import { chromium } from 'playwright';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { log } from '../utils/logger';

export interface ScrapedProduct {
  id: string;
  name: string;
  category: string;
  price: string;
  keyBenefits: string[];
  targetAudience: string;
  tone: string;
  visualStyle: string;
  referenceImageUrl: string;
  hashtags: string[];
  callToAction: string;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}

async function enrichWithGemini(
  name: string,
  description: string,
  price: string
): Promise<Pick<ScrapedProduct, 'category' | 'keyBenefits' | 'targetAudience' | 'tone' | 'visualStyle' | 'hashtags' | 'callToAction'>> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const prompt = `You are helping set up a TikTok UGC video pipeline for an affiliate seller.

Product name: ${name}
Price: ${price}
Description: ${description}

Return a JSON object with these fields:
- category: one short word (beauty, fitness, home, tech, food, fashion, pets, tools, etc.)
- keyBenefits: array of 3 punchy benefit statements (max 10 words each, specific and credible)
- targetAudience: one sentence describing who this is for and why they'd want it
- tone: one word (enthusiastic, authoritative, casual, humorous, heartfelt)
- visualStyle: one word (transformation, demonstration, testimonial, lifestyle, unboxing)
- hashtags: array of 5 TikTok hashtags including #tiktokshop
- callToAction: one short sentence for end of video (link in bio style)

Return only valid JSON, no markdown.`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim().replace(/```json\n?|\n?```/g, '');
  return JSON.parse(text);
}

export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  log.step('Launching browser...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  });
  const page = await context.newPage();

  try {
    log.step(`Navigating to ${url}`);
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for product title to appear
    await page.waitForSelector('[data-testid="pdp-product-title"], h1, .product-title', {
      timeout: 15000,
    }).catch(() => {});

    // Give JS a moment to hydrate
    await page.waitForTimeout(3000);

    const raw = await page.evaluate(() => {
      const getText = (selectors: string[]): string => {
        for (const sel of selectors) {
          const el = document.querySelector(sel);
          if (el?.textContent?.trim()) return el.textContent.trim();
        }
        return '';
      };

      const name = getText([
        '[data-testid="pdp-product-title"]',
        'h1',
        '.product-title',
        '[class*="title"]',
      ]);

      const price = getText([
        '[data-testid="pdp-price"]',
        '[class*="price"]',
        '[class*="Price"]',
      ]);

      // Grab all visible text blocks that look like descriptions
      const descEls = document.querySelectorAll(
        '[data-testid="pdp-description"], [class*="description"], [class*="detail"], [class*="bullet"]'
      );
      const description = Array.from(descEls)
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, 2000);

      const image = (document.querySelector(
        '[data-testid="pdp-main-image"] img, .product-image img, img[class*="main"]'
      ) as HTMLImageElement)?.src ?? '';

      return { name, price, description, image };
    });

    await browser.close();

    if (!raw.name) {
      throw new Error('Could not extract product name — TikTok Shop may have blocked the request');
    }

    log.success(`Found: ${raw.name} — ${raw.price}`);
    log.step('Enriching with Gemini...');

    const enriched = await enrichWithGemini(raw.name, raw.description, raw.price);

    return {
      id: slugify(raw.name),
      name: raw.name,
      price: raw.price || 'check link',
      referenceImageUrl: raw.image,
      ...enriched,
    };
  } catch (err) {
    await browser.close();
    throw err;
  }
}
