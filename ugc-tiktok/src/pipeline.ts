import path from 'path';
import { loadProduct, generateFilename, ensureOutputDirs } from './utils/fileManager';
import { generateHooks, generateScript, generateVideoBrief, Product } from './ai/scriptWriter';
import { generateAvatarVideoFromScript } from './video/heygen';
import { deliverForPosting } from './deliver/package';
import { log } from './utils/logger';

export interface PipelineResult {
  videoPath: string;
}

export async function runFullPipeline(
  productPath: string,
  hookIndex = 0
): Promise<PipelineResult> {
  ensureOutputDirs();

  // 1. Load product
  log.step('Loading product...');
  const product = loadProduct(productPath) as unknown as Product;

  // 2. Hooks
  log.step('Generating hook variants...');
  const hooks = await generateHooks(product);
  hooks.forEach((h, i) => log.info(`  ${i + 1}. ${h}`));
  const selectedHook = hooks[hookIndex] ?? hooks[0];
  log.success(`Using hook ${hookIndex + 1}: "${selectedHook}"`);

  // 3. Script
  log.step('Writing full script...');
  const script = await generateScript(product, selectedHook);
  log.success('Script ready');

  // 4. Video brief (for reference / deliver package)
  log.step('Generating video brief...');
  const brief = await generateVideoBrief(product, script);
  log.success('Video brief ready');

  // 5. HeyGen avatar video (voice baked in by HeyGen)
  log.step('Generating HeyGen avatar video...');
  const heygenVoiceId = process.env.HEYGEN_VOICE_ID ?? '';
  const videoPath = path.join('output', 'final', generateFilename(product.id, 'final', 'mp4'));
  await generateAvatarVideoFromScript(script, heygenVoiceId, videoPath);
  log.success('Video ready');

  // 6. Deliver
  deliverForPosting(videoPath, product, script, brief);

  log.info(`Video: ${videoPath}`);
  return { videoPath };
}
