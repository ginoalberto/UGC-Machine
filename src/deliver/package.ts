import fs from 'fs';
import path from 'path';
import { Product } from '../ai/scriptWriter';
import { log } from '../utils/logger';

function todayDate(): string {
  return new Date().toISOString().split('T')[0];
}

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9]/g, '_');
}

export function deliverForPosting(
  videoPath: string,
  product: Product,
  script: string,
  brief: string
): void {
  const dir = 'output/ready-to-post';
  fs.mkdirSync(dir, { recursive: true });

  const baseName = `${safeName(product.name)}_${todayDate()}`;
  const destVideo = path.join(dir, `${baseName}.mp4`);
  const destTxt = path.join(dir, `${baseName}.txt`);

  fs.copyFileSync(videoPath, destVideo);

  const caption =
    `${product.name} — ${product.keyBenefits.slice(0, 3).join(' | ')}\n` +
    product.hashtags.join(' ');

  const txtContent = [
    '=== CAPTION ===',
    caption,
    '',
    '=== SCRIPT ===',
    script,
    '',
    '=== VIDEO BRIEF ===',
    brief,
  ].join('\n');

  fs.writeFileSync(destTxt, txtContent, 'utf-8');

  console.log(`
✅ Ready to post!

📁 Video:   ${destVideo}
📄 Caption: ${destTxt}

→ Right-click the video in the file explorer → Download
→ Open TikTok → tap + → select video → paste caption from the .txt → post
`);
}
