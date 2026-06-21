export interface Config {
  geminiApiKey: string;
  elevenLabsApiKey: string;
  elevenLabsVoiceId: string;
  heygenApiKey: string;
}

export function getConfig(): Config {
  const missing: string[] = [];

  const geminiApiKey      = process.env.GEMINI_API_KEY;
  const elevenLabsApiKey  = process.env.ELEVENLABS_API_KEY;
  const elevenLabsVoiceId = process.env.ELEVENLABS_VOICE_ID;
  const heygenApiKey      = process.env.HEYGEN_API_KEY;

  if (!geminiApiKey)      missing.push('GEMINI_API_KEY');
  if (!elevenLabsApiKey)  missing.push('ELEVENLABS_API_KEY');
  if (!elevenLabsVoiceId) missing.push('ELEVENLABS_VOICE_ID');
  if (!heygenApiKey)      missing.push('HEYGEN_API_KEY');

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Set them before running:\n` +
      missing.map((v) => `  export ${v}=your_value_here`).join('\n')
    );
  }

  return {
    geminiApiKey:      geminiApiKey!,
    elevenLabsApiKey:  elevenLabsApiKey!,
    elevenLabsVoiceId: elevenLabsVoiceId!,
    heygenApiKey:      heygenApiKey!,
  };
}
