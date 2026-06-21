import axios from 'axios';
import fs from 'fs';
import { log } from '../utils/logger';

const BASE = 'https://api.heygen.com';
const POLL_INTERVAL = 8000;
const TIMEOUT = 300000;

function authHeaders() {
  return { 'x-api-key': process.env.HEYGEN_API_KEY! };
}

async function pollVideo(videoId: string): Promise<string> {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    const res = await axios.get<{
      data: { status: string; video_url?: string; error?: string };
    }>(`${BASE}/v1/video_status.get?video_id=${videoId}`, { headers: authHeaders() });

    const { status, video_url, error } = res.data.data;
    log.step(`HeyGen video ${videoId}: ${status}`);

    if (status === 'completed') {
      if (!video_url) throw new Error('No video_url on completed job');
      return video_url;
    }
    if (status === 'failed') throw new Error(`HeyGen job failed: ${error ?? 'unknown'}`);
  }
  throw new Error(`HeyGen video ${videoId} timed out after ${TIMEOUT / 1000}s`);
}

async function downloadVideo(url: string, outputPath: string): Promise<string> {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(outputPath, Buffer.from(res.data as ArrayBuffer));
  return outputPath;
}

export async function generateAvatarVideo(
  script: string,
  audioPath: string,
  outputPath: string
): Promise<string> {
  const avatarId = process.env.HEYGEN_AVATAR_ID ?? '476c0422f20249aaac7ef2c02840f1a2';

  const body = {
    video_inputs: [
      {
        character: {
          type: 'avatar',
          avatar_id: avatarId,
          avatar_style: 'normal',
        },
        voice: {
          type: 'audio',
          audio_url: audioPath,
        },
        background: {
          type: 'color',
          value: '#000000',
        },
      },
    ],
    dimension: { width: 1080, height: 1920 },
    aspect_ratio: '9:16',
  };

  log.step('Submitting HeyGen avatar video job...');
  const res = await axios.post<{ data: { video_id: string } }>(
    `${BASE}/v2/video/generate`,
    body,
    { headers: { ...authHeaders(), 'Content-Type': 'application/json' } }
  );

  const videoId = res.data.data.video_id;
  log.info(`HeyGen job submitted: ${videoId}`);

  const videoUrl = await pollVideo(videoId);
  log.success('HeyGen video ready — downloading...');
  return downloadVideo(videoUrl, outputPath);
}

export async function generateAvatarVideoFromScript(
  script: string,
  voiceId: string,
  outputPath: string
): Promise<string> {
  const avatarId = process.env.HEYGEN_AVATAR_ID ?? '476c0422f20249aaac7ef2c02840f1a2';
  const resolvedVoiceId = voiceId || process.env.HEYGEN_VOICE_ID || 'f19e6ed9bd184d9c822e1257b39987dd';

  const body = {
    video_inputs: [
      {
        character: {
          type: 'avatar',
          avatar_id: avatarId,
          avatar_style: 'normal',
        },
        voice: {
          type: 'text',
          input_text: script,
          voice_id: resolvedVoiceId,
        },
        background: {
          type: 'color',
          value: '#000000',
        },
      },
    ],
    dimension: { width: 1080, height: 1920 },
    aspect_ratio: '9:16',
  };

  log.step('Submitting HeyGen avatar video (text-to-speech) job...');
  const res = await axios.post<{ data: { video_id: string } }>(
    `${BASE}/v2/video/generate`,
    body,
    { headers: { ...authHeaders(), 'Content-Type': 'application/json' } }
  );

  const videoId = res.data.data.video_id;
  log.info(`HeyGen job submitted: ${videoId}`);

  const videoUrl = await pollVideo(videoId);
  log.success('HeyGen video ready — downloading...');
  return downloadVideo(videoUrl, outputPath);
}

export async function listAvatars(): Promise<{ avatar_id: string; avatar_name: string }[]> {
  const res = await axios.get<{ data: { avatars: { avatar_id: string; avatar_name: string }[] } }>(
    `${BASE}/v2/avatars`,
    { headers: authHeaders() }
  );
  return res.data.data.avatars;
}
