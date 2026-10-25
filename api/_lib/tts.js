// Provider orchestration: Edge TTS first, Gemini TTS on any failure.
// Providers are injectable so the fallback can be unit-tested.
import { synthesizeEdge } from './edgeTts.js';
import { synthesizeGemini } from './geminiTts.js';

const DEFAULT_PROVIDERS = [
  { name: 'edge', mime: 'audio/mpeg', run: synthesizeEdge },
  { name: 'gemini', mime: 'audio/wav', run: synthesizeGemini },
];

export class TtsUnavailableError extends Error {
  constructor() {
    super('Voice generation is unavailable right now. Please try again in a moment.');
    this.name = 'TtsUnavailableError';
    this.status = 502;
  }
}

/** @returns {Promise<{ audio: Buffer, mime: string, provider: string }>} */
export async function synthesize(input, providers = DEFAULT_PROVIDERS) {
  for (const p of providers) {
    try {
      const audio = await p.run(input);
      if (audio?.length) return { audio, mime: p.mime, provider: p.name };
    } catch {
      // Deliberately swallow: upstream errors are never forwarded (CLAUDE.md §8).
    }
  }
  throw new TtsUnavailableError();
}
