import axios from 'axios';
import fs from 'fs';
import { log } from '../utils/logger';

const BASE = 'https://api.higgsfield.ai';
const POLL_INTERVAL = 5000;
const TIMEOUT = 180000;

export interface VideoJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  output_url?: string;
  error?: string;
}

export interface GenerateOptions {
  duration?: number;
  fps?: number;
}

function authHeaders() {
  return { Authorization: `Bearer ${process.env.HIGGSFIELD_API_KEY!}` };
}

async function submitJob(body: Record<string, unknown>): Promise<string> {
  const res = await axios.post<{ id: string }>(`${BASE}/v1/generate`, body, {
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
  });
  return res.data.id;
}

export async function pollJobStatus(jobId: string): Promise<VideoJob> {
  const deadline = Date.now() + TIMEOUT;
  while (Date.now() < deadline) {
    const res = await axios.get<VideoJob>(`${BASE}/v1/jobs/${jobId}`, {
      headers: authHeaders(),
    });
    const job = res.data;
    log.step(`Job ${jobId}: ${job.status}`);
    if (job.status === 'completed' || job.status === 'failed') return job;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));
  }
  throw new Error(`Job ${jobId} timed out after ${TIMEOUT / 1000}s`);
}

export async function downloadVideo(url: string, outputPath: string): Promise<string> {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(outputPath, Buffer.from(res.data as ArrayBuffer));
  return outputPath;
}

async function generate(body: Record<string, unknown>, outputPath: string): Promise<string> {
  let lastErr: Error | undefined;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      log.step(`Higgsfield generate attempt ${attempt}/3`);
      const jobId = await submitJob(body);
      const job = await pollJobStatus(jobId);
      if (job.status === 'failed') throw new Error(`Job failed: ${job.error ?? 'unknown'}`);
      if (!job.output_url) throw new Error('No output_url on completed job');
      return downloadVideo(job.output_url, outputPath);
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      log.warn(`Attempt ${attempt} failed: ${lastErr.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr ?? new Error('Video generation failed after 3 attempts');
}

export async function generateVideo(
  prompt: string,
  outputPath: string,
  options?: GenerateOptions
): Promise<string> {
  return generate(
    { prompt, aspect_ratio: '9:16', ...options },
    outputPath
  );
}

export async function generateVideoFromImage(
  prompt: string,
  imageUrl: string,
  outputPath: string
): Promise<string> {
  return generate({ prompt, image_url: imageUrl, aspect_ratio: '9:16' }, outputPath);
}
