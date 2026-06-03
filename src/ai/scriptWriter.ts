import Anthropic from '@anthropic-ai/sdk';
import { getConfig } from '../config';
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

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

async function callClaude(prompt: string): Promise<string> {
  const config = getConfig();
  const client = new Anthropic({ apiKey: config.anthropicApiKey });

  const message = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  const block = message.content[0];
  if (block.type !== 'text') throw new Error('Unexpected response type from Claude');
  return block.text.trim();
}

export async function generateHooks(product: Product): Promise<string[]> {
  const prompt = fillTemplate(HOOK_VARIANTS_PROMPT, {
    productName: product.name,
    category: product.category,
    keyBenefits: product.keyBenefits.join(', '),
    targetAudience: product.targetAudience,
    tone: product.tone,
  });

  const raw = await callClaude(prompt);

  try {
    const cleaned = raw.replace(/```json\n?|\n?```/g, '').trim();
    const hooks = JSON.parse(cleaned) as string[];
    if (!Array.isArray(hooks)) throw new Error('Not an array');
    return hooks;
  } catch {
    log.warn('Failed to parse hooks as JSON, extracting lines');
    return raw
      .split('\n')
      .map((l) => l.replace(/^[\d.\-*"\s]+/, '').replace(/["']$/g, '').trim())
      .filter((l) => l.length > 5)
      .slice(0, 5);
  }
}

export async function generateScript(product: Product, selectedHook: string): Promise<string> {
  const prompt = fillTemplate(FULL_SCRIPT_PROMPT, {
    selectedHook,
    callToAction: product.callToAction,
    productName: product.name,
    price: product.price,
    keyBenefits: product.keyBenefits.join(', '),
    targetAudience: product.targetAudience,
    tone: product.tone,
  });

  return callClaude(prompt);
}

export async function generateVideoBrief(product: Product, script: string): Promise<string> {
  const prompt = fillTemplate(VIDEO_BRIEF_PROMPT, {
    script,
    productName: product.name,
    category: product.category,
    visualStyle: product.visualStyle,
    tone: product.tone,
  });

  return callClaude(prompt);
}
