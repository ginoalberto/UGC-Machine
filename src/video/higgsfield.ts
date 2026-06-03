import axios from 'axios';
import fs from 'fs';
import { getConfig } from '../config';
import { log } from '../utils/logger';

const BASE_URL = 'https://api.higgsfield.ai';
const POLL_INTERVAL_MS = 5000;
const TIMEOUT_MS = 180000;

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

async function submitGeneration(body: Record<string, unknown>): Promise<string> {
  const config = getConfig();
  const res = await axios.post<{ id: string }>(`${BASE_URL}/v1/generate`, body, {
    headers: {
      Authorization: `Bearer ${config.higgsfieldApiKey}`,
      'Content-Type': 'application/json',
    },
  });
  return res.data.id;
}

export async function pollJobStatus(jobId: string): Promise<VideoJob> {
  const config = getConfig();
  const start = Date.now();

  while (Date.now() - start < TIMEOUT_MS) {
    const res = await axios.get<VideoJob>(`${BASE_URL}/v1/jobs/${jobId}`, {
      headers: { Authorization: `Bearer ${config.higgsfieldApiKey}` },
    });
    const job = res.data;
    log.step(`Job ${jobId}: ${job.status}`);

    if (job.status === 'completed' || job.status === 'failed') return job;

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error(`Job ${jobId} timed out after ${TIMEOUT_MS / 1000}s`);
}

export async function downloadVideo(url: string, outputPath: string): Promise<string> {
  const res = await axios.get(url, { responseType: 'arraybuffer' });
  fs.writeFileSync(outputPath, Buffer.from(res.data as ArrayBuffer));
  return outputPath;
}

export async function generateVideo(
  prompt: string,
  outputPath: string,
  options?: GenerateOptions
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      log.step(`Higgsfield generate attempt ${attempt}/3`);
      const jobId = await submitGeneration({
        prompt,
        aspect_ratio: '9:16',
        ...(options?.duration ? { duration: options.duration } : {}),
        ...(options?.fps ? { fps: options.fps } : {}),
      });

      const job = await pollJobStatus(jobId);
      if (job.status === 'failed') throw new Error(`Job failed: ${job.error ?? 'unknown'}`);
      if (!job.output_url) throw new Error('No output URL in completed job');

      return downloadVideo(job.output_url, outputPath);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log.warn(`Attempt ${attempt} failed: ${lastError.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }

  throw lastError ?? new Error('Video generation failed after 3 attempts');
}

export async function generateVideoFromImage(
  prompt: string,
  imageUrl: string,
  outputPath: string
): Promise<string> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      log.step(`Higgsfield image-to-video attempt ${attempt}/3`);
      const jobId = await submitGeneration({
        prompt,
        image_url: imageUrl,
        aspect_ratio: '9:16',
      });

      const job = await pollJobStatus(jobId);
      if (job.status === 'failed') throw new Error(`Job failed: ${job.error ?? 'unknown'}`);
      if (!job.output_url) throw new Error('No output URL in completed job');

      return downloadVideo(job.output_url, outputPath);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      log.warn(`Attempt ${attempt} failed: ${lastError.message}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }

  throw lastError ?? new Error('Video generation failed after 3 attempts');
}
