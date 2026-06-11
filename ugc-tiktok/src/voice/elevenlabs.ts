import axios from 'axios';
import fs from 'fs';

const BASE = 'https://api.elevenlabs.io';

export interface Voice {
  voice_id: string;
  name: string;
  category?: string;
}

export async function listVoices(): Promise<Voice[]> {
  const res = await axios.get<{ voices: Voice[] }>(`${BASE}/v1/voices`, {
    headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY! },
  });
  return res.data.voices;
}

export async function generateVoiceover(
  script: string,
  voiceId: string,
  outputPath: string
): Promise<string> {
  const res = await axios.post(
    `${BASE}/v1/text-to-speech/${voiceId}`,
    {
      text: script,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.3,
        use_speaker_boost: true,
      },
    },
    {
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      responseType: 'arraybuffer',
    }
  );

  fs.writeFileSync(outputPath, Buffer.from(res.data as ArrayBuffer));
  return outputPath;
}
