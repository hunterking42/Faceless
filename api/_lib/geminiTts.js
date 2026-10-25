// Gemini TTS fallback. Returns 16-bit mono PCM wrapped as WAV so browsers can play it.
const DEFAULT_MODEL = 'gemini-2.5-flash-preview-tts';
const VOICES = { female: 'Kore', male: 'Puck' };

export function pcmToWav(pcm, sampleRate = 24000, channels = 1, bitsPerSample = 16) {
  const header = Buffer.alloc(44);
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE((channels * bitsPerSample) / 8, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export function parseSampleRate(mimeType = '') {
  const m = /rate=(\d+)/.exec(mimeType);
  return m ? Number(m[1]) : 24000;
}

/** @returns {Promise<Buffer>} WAV audio */
export async function synthesizeGemini({ text, gender }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not configured');
  const model = process.env.GEMINI_TTS_MODEL || DEFAULT_MODEL;

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICES[gender] || VOICES.female } } },
        },
      }),
    }
  );
  if (!resp.ok) throw new Error(`Gemini TTS failed (${resp.status})`);

  const data = await resp.json();
  const inline = data?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
  if (!inline?.data) throw new Error('Gemini TTS returned no audio');
  return pcmToWav(Buffer.from(inline.data, 'base64'), parseSampleRate(inline.mimeType));
}
