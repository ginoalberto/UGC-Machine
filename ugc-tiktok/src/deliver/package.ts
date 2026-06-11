import fs from 'fs';
import path from 'path';
import { Product } from '../ai/scriptWriter';

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
  fs.mkdirSync('output/ready-to-post', { recursive: true });

  const base    = `${safeName(product.name)}_${todayDate()}`;
  const destVid = path.join('output', 'ready-to-post', `${base}.mp4`);
  const destTxt = path.join('output', 'ready-to-post', `${base}.txt`);

  fs.copyFileSync(videoPath, destVid);

  const caption =
    `${product.name} — ${product.keyBenefits.slice(0, 3).join(' | ')}\n` +
    product.hashtags.join(' ');

  fs.writeFileSync(
    destTxt,
    ['=== CAPTION ===', caption, '', '=== SCRIPT ===', script, '', '=== VIDEO BRIEF ===', brief].join('\n'),
    'utf-8'
  );

  console.log(`
✅ Ready to post!

📁 Video:   ${destVid}
📄 Caption: ${destTxt}

→ Right-click the video in the file explorer → Download
→ Open TikTok → tap + → select video → paste caption from the .txt → post
`);
}
