import { GoogleGenerativeAI } from '@google/generative-ai';
import { HOOK_VARIANTS_PROMPT, FULL_SCRIPT_PROMPT, VIDEO_BRIEF_PROMPT } from './prompts';
import { log } from '../utils/logger';

export interface Product {
  id: string;
  name: string;
  category: string;
  price: string;
  keyBenefits: string[];
  targetAudience: string;
  tone: string;
  visualStyle: string;
  referenceImageUrl?: string;
  hashtags: string[];
  callToAction: string;
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}

export async function generateHooks(product: Product): Promise<string[]> {
  const prompt = fill(HOOK_VARIANTS_PROMPT, {
    productName:    product.name,
    category:       product.category,
    keyBenefits:    product.keyBenefits.join(', '),
    targetAudience: product.targetAudience,
    tone:           product.tone,
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  try {
    const cleaned = text.replace(/```json\n?|\n?```/g, '').trim();
    const hooks = JSON.parse(cleaned) as string[];
    if (!Array.isArray(hooks)) throw new Error('not an array');
    return hooks;
  } catch {
    log.warn('Could not parse hooks as JSON — extracting lines');
    return text
      .split('\n')
      .map((l) => l.replace(/^[\d.\-*"\s]+/, '').replace(/[",]$/g, '').trim())
      .filter((l) => l.length > 5)
      .slice(0, 5);
  }
}

export async function generateScript(product: Product, selectedHook: string): Promise<string> {
  const prompt = fill(FULL_SCRIPT_PROMPT, {
    selectedHook,
    callToAction:   product.callToAction,
    productName:    product.name,
    price:          product.price,
    keyBenefits:    product.keyBenefits.join(', '),
    targetAudience: product.targetAudience,
    tone:           product.tone,
  });

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

export async function generateVideoBrief(product: Product, script: string): Promise<string> {
  const prompt = fill(VIDEO_BRIEF_PROMPT, {
    script,
    productName:  product.name,
    category:     product.category,
    visualStyle:  product.visualStyle,
    tone:         product.tone,
  });

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}
