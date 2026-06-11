import path from 'path';
import { loadProduct, generateFilename, ensureOutputDirs } from './utils/fileManager';
import { generateHooks, generateScript, generateVideoBrief, Product } from './ai/scriptWriter';
import { generateVoiceover } from './voice/elevenlabs';
import { generateVideo, generateVideoFromImage } from './video/higgsfield';
import { mergeAudioVideo } from './merge/ffmpeg';
import { deliverForPosting } from './deliver/package';
import { log } from './utils/logger';

export interface PipelineResult {
  audioPath: string;
  rawVideoPath: string;
  mergedVideoPath: string;
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

  // 4. Video brief
  log.step('Generating video brief...');
  const brief = await generateVideoBrief(product, script);
  log.success('Video brief ready');

  const audioPath    = path.join('output', 'audio',  generateFilename(product.id, 'audio', 'mp3'));
  const rawVideoPath = path.join('output', 'video',  generateFilename(product.id, 'video', 'mp4'));

  // 5. Voiceover + video in parallel
  log.step('Generating voiceover and video in parallel...');
  const [resolvedAudio, resolvedVideo] = await Promise.all([
    generateVoiceover(script, process.env.ELEVENLABS_VOICE_ID!, audioPath),
    product.referenceImageUrl
      ? generateVideoFromImage(brief, product.referenceImageUrl, rawVideoPath)
      : generateVideo(brief, rawVideoPath),
  ]);
  log.success('Voiceover and video ready');

  // 6. Merge
  log.step('Merging audio and video...');
  const mergedVideoPath = path.join('output', 'final', generateFilename(product.id, 'final', 'mp4'));
  await mergeAudioVideo(resolvedVideo, resolvedAudio, mergedVideoPath);
  log.success('Merge complete');

  // 7. Deliver
  deliverForPosting(mergedVideoPath, product, script, brief);

  log.info(`Audio:        ${resolvedAudio}`);
  log.info(`Raw video:    ${resolvedVideo}`);
  log.info(`Merged video: ${mergedVideoPath}`);

  return { audioPath: resolvedAudio, rawVideoPath: resolvedVideo, mergedVideoPath };
}
