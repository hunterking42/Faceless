// Subtitle timing. Pure functions, no DOM, so the preview player and the
// Phase 3 renderer share one source of truth and tests can run in Node.

const SENTENCE_END = /(?<=[।.!?…])\s+/u;
const PAUSE_WEIGHT = 4; // extra "characters" of silence after a sentence end

function splitWords(sentence) {
  return sentence.split(/\s+/u).filter(Boolean);
}

/** Splits narration into short on-screen chunks, balanced within a sentence. */
export function splitIntoChunks(text, maxWords = 7) {
  const chunks = [];
  const sentences = text.trim().split(SENTENCE_END).filter(Boolean);
  for (const sentence of sentences) {
    const words = splitWords(sentence);
    if (!words.length) continue;
    const parts = Math.ceil(words.length / maxWords);
    const size = Math.ceil(words.length / parts);
    for (let i = 0; i < words.length; i += size) {
      chunks.push({
        text: words.slice(i, i + size).join(' '),
        endsSentence: i + size >= words.length,
      });
    }
  }
  return chunks;
}

/**
 * Distributes cues across the real audio duration, weighted by text length.
 * Cues are contiguous and the last one ends exactly at durationSec.
 * @returns {{ start: number, end: number, text: string }[]}
 */
export function buildCues(text, durationSec, maxWords = 7) {
  const chunks = splitIntoChunks(text || '', maxWords);
  if (!chunks.length || !(durationSec > 0)) return [];

  const weights = chunks.map((c) => Array.from(c.text.replace(/\s/gu, '')).length + (c.endsSentence ? PAUSE_WEIGHT : 0));
  const total = weights.reduce((a, b) => a + b, 0);

  let cursor = 0;
  return chunks.map((chunk, i) => {
    const start = cursor;
    cursor = i === chunks.length - 1 ? durationSec : cursor + (weights[i] / total) * durationSec;
    return { start, end: cursor, text: chunk.text };
  });
}

/** Cue visible at time t, or null. */
export function cueAt(cues, t) {
  return cues.find((c) => t >= c.start && t < c.end) || null;
}

/** Rough spoken length, used only when a scene has no generated audio yet. */
export function estimateDuration(text, language) {
  const words = splitWords(text || '').length;
  const wordsPerSec = language === 'bn' ? 2.2 : 2.6;
  return Math.max(1.5, words / wordsPerSec);
}
