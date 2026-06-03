import path from 'path';
import { loadProduct, generateFilename, ensureOutputDirs } from './utils/fileManager';
import { generateHooks, generateScript, generateVideoBrief, Product } from './ai/scriptWriter';
import { generateVoiceover } from './voice/elevenlabs';
import { generateVideo, generateVideoFromImage } from './video/higgsfield';
import { mergeAudioVideo } from './merge/ffmpeg';
import { deliverForPosting } from './deliver/package';
import { getConfig } from './config';
import { log } from './utils/logger';

export interface PipelineResult {
  scriptPath: string;
  audioPath: string;
  rawVideoPath: string;
  mergedVideoPath: string;
  readyToPostDir: string;
}

export async function runFullPipeline(
  productPath: string,
  hookIndex = 0
): Promise<PipelineResult> {
  ensureOutputDirs();
  const config = getConfig();

  // 1. Load product
  log.step('Loading product...');
  const rawProduct = loadProduct(productPath);
  const product = rawProduct as unknown as Product;

  // 2. Generate hooks
  log.step('Generating hook variants...');
  const hooks = await generateHooks(product);
  hooks.forEach((h, i) => log.info(`  ${i + 1}. ${h}`));
  const selectedHook = hooks[hookIndex] ?? hooks[0];
  log.success(`Using hook ${hookIndex + 1}: "${selectedHook}"`);

  // 3. Generate full script
  log.step('Writing full script...');
  const script = await generateScript(product, selectedHook);
  log.success('Script generated');

  // 4. Generate video brief
  log.step('Generating video brief...');
  const brief = await generateVideoBrief(product, script);
  log.success('Video brief generated');

  const audioFilename = generateFilename(product.id, 'audio', 'mp3');
  const audioPath = path.join('output', 'audio', audioFilename);

  const videoFilename = generateFilename(product.id, 'video', 'mp4');
  const rawVideoPath = path.join('output', 'video', videoFilename);

  // 5. Voiceover + video in parallel
  log.step('Generating voiceover and video in parallel...');
  const [resolvedAudioPath, resolvedVideoPath] = await Promise.all([
    generateVoiceover(script, config.elevenLabsVoiceId, audioPath),
    product.referenceImageUrl
      ? generateVideoFromImage(brief, product.referenceImageUrl, rawVideoPath)
      : generateVideo(brief, rawVideoPath),
  ]);
  log.success('Voiceover and video generated');

  // 6. Merge
  log.step('Merging audio and video...');
  const mergedFilename = generateFilename(product.id, 'final', 'mp4');
  const mergedVideoPath = path.join('output', 'final', mergedFilename);
  await mergeAudioVideo(resolvedVideoPath, resolvedAudioPath, mergedVideoPath);
  log.success('Merge complete');

  // 7. Deliver
  log.step('Packaging for posting...');
  deliverForPosting(mergedVideoPath, product, script, brief);

  const result: PipelineResult = {
    scriptPath: path.join('output', 'scripts', generateFilename(product.id, 'script', 'txt')),
    audioPath: resolvedAudioPath,
    rawVideoPath: resolvedVideoPath,
    mergedVideoPath,
    readyToPostDir: 'output/ready-to-post',
  };

  log.success('Pipeline complete!');
  log.info(`Audio:        ${result.audioPath}`);
  log.info(`Raw video:    ${result.rawVideoPath}`);
  log.info(`Merged video: ${result.mergedVideoPath}`);

  return result;
}
