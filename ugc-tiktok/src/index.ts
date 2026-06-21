import { Command } from 'commander';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { runFullPipeline } from './pipeline';
import { generateHooks, generateScript, generateVideoBrief, Product } from './ai/scriptWriter';
import { generateVoiceover, listVoices } from './voice/elevenlabs';
import { generateAvatarVideoFromScript, listAvatars } from './video/heygen';
import { mergeAudioVideo, checkFfmpeg } from './merge/ffmpeg';
import { loadProduct, generateFilename, ensureOutputDirs, saveScript } from './utils/fileManager';
import { log } from './utils/logger';

checkFfmpeg();

const program = new Command();
program.name('ugc-tiktok').description('UGC TikTok Pipeline').version('1.0.0');

program
  .command('run')
  .description('Run full pipeline for a product')
  .requiredOption('--product <file>', 'Path to product JSON')
  .option('--hook-index <n>', 'Hook to use (0-indexed)', '0')
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
      console.log('\n--- SCRIPT ---\n' + script);

      log.step('Generating video brief...');
      const brief = await generateVideoBrief(product, script);
      console.log('\n--- VIDEO BRIEF ---\n' + brief);

      const saved = saveScript(product.id, `SCRIPT:\n${script}\n\nVIDEO BRIEF:\n${brief}`);
      log.success(`Saved to ${saved}`);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('voice')
  .description('Generate voiceover from a script file (ElevenLabs)')
  .requiredOption('--script <file>', 'Path to .txt script file')
  .action(async (opts: { script: string }) => {
    try {
      ensureOutputDirs();
      const script  = fs.readFileSync(opts.script, 'utf-8');
      const outPath = path.join('output', 'audio', generateFilename('custom', 'audio', 'mp3'));
      await generateVoiceover(script, process.env.ELEVENLABS_VOICE_ID!, outPath);
      log.success(`Voiceover saved to ${outPath}`);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('video')
  .description('Generate HeyGen avatar video from a script file')
  .requiredOption('--script <file>', 'Path to .txt script file')
  .option('--voice-id <id>', 'HeyGen voice ID (overrides HEYGEN_VOICE_ID env var)')
  .action(async (opts: { script: string; voiceId?: string }) => {
    try {
      ensureOutputDirs();
      const script    = fs.readFileSync(opts.script, 'utf-8');
      const voiceId   = opts.voiceId ?? process.env.HEYGEN_VOICE_ID ?? '';
      const outPath   = path.join('output', 'final', generateFilename('custom', 'final', 'mp4'));
      await generateAvatarVideoFromScript(script, voiceId, outPath);
      log.success(`Video saved to ${outPath}`);
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('merge')
  .description('Merge separate audio and video files with FFmpeg')
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
      log.success(`${voices.length} voices available:\n`);
      voices.forEach((v) =>
        console.log(`  ${v.voice_id}  ${v.name}${v.category ? `  [${v.category}]` : ''}`)
      );
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('avatar-list')
  .description('List available HeyGen avatars')
  .action(async () => {
    try {
      const avatars = await listAvatars();
      log.success(`${avatars.length} avatars available:\n`);
      avatars.forEach((a) => console.log(`  ${a.avatar_id}  ${a.avatar_name}`));
    } catch (err) {
      log.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
  });

program
  .command('batch')
  .description('Run full pipeline for all product JSONs in a directory')
  .requiredOption('--dir <dir>', 'Directory with product JSON files')
  .action(async (opts: { dir: string }) => {
    const files = fs
      .readdirSync(opts.dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => path.join(opts.dir, f));

    if (!files.length) { log.warn('No JSON files found'); return; }

    log.info(`Processing ${files.length} products...`);
    for (const file of files) {
      log.step(`\n→ ${file}`);
      try {
        await runFullPipeline(file);
      } catch (err) {
        log.error(`Failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    log.success('Batch complete');
  });

program
  .command('check')
  .description('Ping each API and report pass/fail')
  .action(async () => {
    // Gemini
    try {
      const g = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? '');
      const m = g.getGenerativeModel({ model: 'gemini-2.5-flash' });
      await m.generateContent('test');
      log.success('Gemini API        — ✅ connected');
    } catch (err) {
      log.error(`Gemini API        — ❌ ${err instanceof Error ? err.message : String(err)}`);
    }

    // ElevenLabs
    try {
      await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY ?? '' },
      });
      log.success('ElevenLabs API    — ✅ connected');
    } catch (err) {
      log.error(`ElevenLabs API    — ❌ ${err instanceof Error ? err.message : String(err)}`);
    }

    // HeyGen
    try {
      const res = await axios.get('https://api.heygen.com/v2/avatars', {
        headers: { 'x-api-key': process.env.HEYGEN_API_KEY ?? '' },
        validateStatus: (s) => s < 500,
      });
      if (res.status === 200) {
        log.success('HeyGen API        — ✅ connected');
      } else {
        log.error(`HeyGen API        — ❌ HTTP ${res.status}`);
      }
    } catch (err) {
      log.error(`HeyGen API        — ❌ ${err instanceof Error ? err.message : String(err)}`);
    }
  });

program.parse(process.argv);
