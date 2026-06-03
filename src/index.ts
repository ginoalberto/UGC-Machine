import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { runFullPipeline } from './pipeline';
import { generateHooks, generateScript, generateVideoBrief, Product } from './ai/scriptWriter';
import { generateVoiceover, listVoices } from './voice/elevenlabs';
import { generateVideo } from './video/higgsfield';
import { mergeAudioVideo, checkFfmpeg } from './merge/ffmpeg';
import { loadProduct, generateFilename, ensureOutputDirs } from './utils/fileManager';
import { getConfig } from './config';
import { log } from './utils/logger';

checkFfmpeg();

const program = new Command();
program.name('ugc-mmw').description('MMW UGC Pipeline').version('1.0.0');

program
  .command('run')
  .description('Run full pipeline for a product')
  .requiredOption('--product <file>', 'Path to product JSON')
  .option('--hook-index <n>', 'Which hook to use (0-indexed)', '0')
  .action(async (opts: { product: string; hookIndex: string }) => {
    try {
      await runFullPipeline(opts.product, parseInt(opts.hookIndex, 10));
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('script')
  .description('Generate script only')
  .requiredOption('--product <file>', 'Path to product JSON')
  .action(async (opts: { product: string }) => {
    try {
      const product = loadProduct(opts.product) as unknown as Product;
      log.step('Generating hooks...');
      const hooks = await generateHooks(product);
      hooks.forEach((h, i) => log.info(`  ${i + 1}. ${h}`));

      log.step('Generating full script...');
      const script = await generateScript(product, hooks[0]);
      log.success('Script:\n');
      console.log(script);

      log.step('Generating video brief...');
      const brief = await generateVideoBrief(product, script);
      log.success('Video Brief:\n');
      console.log(brief);

      ensureOutputDirs();
      const scriptFile = path.join('output', 'scripts', generateFilename(product.id, 'script', 'txt'));
      fs.writeFileSync(scriptFile, `SCRIPT:\n${script}\n\nVIDEO BRIEF:\n${brief}`, 'utf-8');
      log.success(`Saved to ${scriptFile}`);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('voice')
  .description('Generate voiceover from script file')
  .requiredOption('--script <file>', 'Path to script .txt file')
  .action(async (opts: { script: string }) => {
    try {
      const config = getConfig();
      const script = fs.readFileSync(opts.script, 'utf-8');
      ensureOutputDirs();
      const outPath = path.join('output', 'audio', generateFilename('custom', 'audio', 'mp3'));
      await generateVoiceover(script, config.elevenLabsVoiceId, outPath);
      log.success(`Voiceover saved to ${outPath}`);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('video')
  .description('Generate video from brief text')
  .requiredOption('--brief <text>', 'Video brief / prompt text')
  .action(async (opts: { brief: string }) => {
    try {
      ensureOutputDirs();
      const outPath = path.join('output', 'video', generateFilename('custom', 'video', 'mp4'));
      await generateVideo(opts.brief, outPath);
      log.success(`Video saved to ${outPath}`);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('merge')
  .description('Merge audio and video files')
  .requiredOption('--audio <file>', 'Path to audio file')
  .requiredOption('--video <file>', 'Path to video file')
  .action(async (opts: { audio: string; video: string }) => {
    try {
      ensureOutputDirs();
      const outPath = path.join('output', 'final', generateFilename('merged', 'final', 'mp4'));
      await mergeAudioVideo(opts.video, opts.audio, outPath);
      log.success(`Merged video saved to ${outPath}`);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('voice-list')
  .description('List available ElevenLabs voices')
  .action(async () => {
    try {
      const voices = await listVoices();
      log.success(`Found ${voices.length} voices:\n`);
      voices.forEach((v) => {
        console.log(`  ${v.voice_id}  ${v.name}${v.category ? `  [${v.category}]` : ''}`);
      });
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('batch')
  .description('Run full pipeline for all product JSONs in a directory')
  .requiredOption('--dir <dir>', 'Directory containing product JSON files')
  .action(async (opts: { dir: string }) => {
    const files = fs
      .readdirSync(opts.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(opts.dir, f));

    if (files.length === 0) {
      log.warn('No JSON files found in directory');
      return;
    }

    log.info(`Running pipeline for ${files.length} products...`);
    for (const file of files) {
      log.step(`\nProcessing: ${file}`);
      try {
        await runFullPipeline(file);
      } catch (err) {
        log.error(`Failed for ${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    log.success('Batch complete');
  });

program
  .command('check')
  .description('Ping each API and report pass/fail')
  .action(async () => {
    let config: ReturnType<typeof getConfig> | undefined;
    try {
      config = getConfig();
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }

    // ElevenLabs
    try {
      await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': config.elevenLabsApiKey },
      });
      log.success('ElevenLabs API — connected');
    } catch (err) {
      log.error(`ElevenLabs API — failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Higgsfield
    try {
      await axios.get('https://api.higgsfield.ai/v1/health', {
        headers: { Authorization: `Bearer ${config.higgsfieldApiKey}` },
      });
      log.success('Higgsfield API — connected');
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      // A 404/422 means the server is up, just no health endpoint
      if (status && status < 500) {
        log.success(`Higgsfield API — reachable (status ${status})`);
      } else {
        log.error(`Higgsfield API — failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    // Gemini
    try {
      await axios.get(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${config.geminiApiKey}`
      );
      log.success('Gemini API — connected');
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      if (status && status < 500) {
        log.success(`Gemini API — reachable (status ${status})`);
      } else {
        log.error(`Gemini API — failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  });

program.parse(process.argv);
