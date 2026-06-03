import fs from 'fs';
import path from 'path';

const OUTPUT_BASE = path.resolve('output');

export function ensureOutputDirs(): void {
  const dirs = [
    'output/scripts',
    'output/audio',
    'output/video',
    'output/final',
    'output/ready-to-post',
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

export function saveScript(productId: string, content: string): string {
  ensureOutputDirs();
  const filename = generateFilename(productId, 'script', 'txt');
  const filepath = path.join(OUTPUT_BASE, 'scripts', filename);
  fs.writeFileSync(filepath, content, 'utf-8');
  return filepath;
}

export function generateFilename(productId: string, step: string, ext: string): string {
  const ts = Date.now();
  return `${productId}_${step}_${ts}.${ext}`;
}

export function loadProduct(filepath: string): Record<string, unknown> {
  const raw = fs.readFileSync(filepath, 'utf-8');
  return JSON.parse(raw) as Record<string, unknown>;
}
