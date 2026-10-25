// Browser side of /api/clone, including cold-start handling for the
// free Hugging Face Space (CLAUDE.md §10): poll until awake, long wait, one retry.
import { cloneSpeech, wakeCloneEngine, ApiError } from '../api.js';

const WAKE_TIMEOUT_MS = 180_000;
const WAKE_POLL_MS = 5_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitUntilAwake(onStatus) {
  const deadline = Date.now() + WAKE_TIMEOUT_MS;
  let first = true;
  while (Date.now() < deadline) {
    try {
      if ((await wakeCloneEngine()).ready) return;
    } catch (err) {
      // Network blips (status 0) and rate limits are worth polling through; anything else
      // (e.g. "not configured") will not fix itself.
      if (err instanceof ApiError && err.status !== 0 && err.status !== 429) throw err;
    }
    if (first) onStatus?.('warming');
    first = false;
    await sleep(WAKE_POLL_MS);
  }
  throw new ApiError('The voice engine took too long to start. Please try again.', 503);
}

export async function cloneVoice(scene, { language, sample, onStatus } = {}) {
  if (!sample) throw new ApiError('Record a voice sample first.', 400);
  await waitUntilAwake(onStatus);
  onStatus?.('generating');
  const args = { text: scene.text, language, sample, consent: true };
  try {
    return { blob: await cloneSpeech(args), provider: 'clone' };
  } catch (err) {
    if (!(err instanceof ApiError) || err.status !== 503) throw err;
    await sleep(WAKE_POLL_MS);
    return { blob: await cloneSpeech(args), provider: 'clone' };
  }
}
