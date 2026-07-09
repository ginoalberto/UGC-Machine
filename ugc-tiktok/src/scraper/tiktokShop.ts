import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { log } from '../utils/logger';

chromium.use(StealthPlugin());

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

export async function buildProductFromDetails(
  name: string,
  price: string,
  description: string
): Promise<ScrapedProduct> {
  const enriched = await enrichWithGemini(name, description, price);
  return {
    id: slugify(name),
    name,
    price,
    referenceImageUrl: '',
    ...enriched,
  };
}

export async function scrapeProduct(url: string): Promise<ScrapedProduct> {
  log.step('Launching stealth browser...');

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
    ],
  });

  const context = await browser.newContext({
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
  });

  const page = await context.newPage();

  // Remove webdriver flag
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    log.step(`Navigating to product page...`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 });

    // Check for captcha/verify page
    const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 200));
    if (bodyText.toLowerCase().includes('verify') || bodyText.toLowerCase().includes('captcha')) {
      // Try waiting and reloading once
      log.warn('Verification page detected — waiting and retrying...');
      await page.waitForTimeout(4000);
      await page.reload({ waitUntil: 'networkidle', timeout: 45000 });
    }

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
        '[class*="ProductTitle"]',
        '[class*="product-title"]',
        '[class*="title"]',
      ]);

      const price = getText([
        '[data-testid="pdp-price"]',
        '[class*="price"]',
        '[class*="Price"]',
        '[class*="sale-price"]',
      ]);

      const descEls = document.querySelectorAll(
        '[data-testid="pdp-description"], [class*="description"], [class*="detail"], [class*="bullet"], [class*="Description"]'
      );
      const description = Array.from(descEls)
        .map((el) => el.textContent?.trim())
        .filter(Boolean)
        .join('\n')
        .slice(0, 2000);

      const image = (document.querySelector(
        '[data-testid="pdp-main-image"] img, .product-image img, img[class*="main"], img[class*="product"]'
      ) as HTMLImageElement)?.src ?? '';

      // Also grab page title as fallback for name
      const pageTitle = document.title;

      return { name, price, description, image, pageTitle };
    });

    await browser.close();

    // Use page title as fallback if name extraction failed
    const productName = raw.name ||
      raw.pageTitle.replace(/\s*[-|].*$/, '').trim();

    if (!productName || productName.toLowerCase().includes('verify')) {
      throw new Error(
        'TikTok Shop blocked the request with a verification challenge.\n' +
        'Try running from a different network or paste the product details manually.'
      );
    }

    log.success(`Found: ${productName}${raw.price ? ' — ' + raw.price : ''}`);
    log.step('Enriching with Gemini...');

    const enriched = await enrichWithGemini(productName, raw.description, raw.price);

    return {
      id: slugify(productName),
      name: productName,
      price: raw.price || 'check link',
      referenceImageUrl: raw.image,
      ...enriched,
    };
  } catch (err) {
    await browser.close();
    throw err;
  }
}
