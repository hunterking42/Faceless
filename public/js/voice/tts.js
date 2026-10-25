// Browser side of /api/tts: one call per scene.
import { synthesizeSpeech } from '../api.js';

/** Decoded length in seconds. decodeAudioData is exact; the <audio> fallback covers odd codecs. */
export async function measureDuration(blob) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    try {
      const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
      return decoded.duration;
    } finally {
      ctx.close?.();
    }
  } catch {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const audio = new Audio();
      audio.preload = 'metadata';
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        Number.isFinite(audio.duration) ? resolve(audio.duration) : reject(new Error('Unknown duration'));
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read audio'));
      };
      audio.src = url;
    });
  }
}

export async function ttsVoice(scene, { language, gender } = {}) {
  const { blob, provider } = await synthesizeSpeech({ text: scene.text, language, gender });
  return { blob, provider };
}
