import fs from 'fs';
import path from 'path';

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
  const filepath = path.join('output', 'scripts', filename);
  fs.writeFileSync(filepath, content, 'utf-8');
  return filepath;
}

export function generateFilename(productId: string, step: string, ext: string): string {
  return `${productId}_${step}_${Date.now()}.${ext}`;
}

export function loadProduct(filepath: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(filepath, 'utf-8')) as Record<string, unknown>;
}
