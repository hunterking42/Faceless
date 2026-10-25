// The one voice interface (CLAUDE.md §10). Callers get an audio Blob and never
// learn which mode produced it.
import { ttsVoice } from './tts.js';
import { cloneVoice } from './clone.js';

// 'record' wraps audio the user already recorded with recorder.js (options.blob).
async function recordedVoice(_scene, { blob } = {}) {
  if (!blob) throw new Error('No recording provided.');
  return { blob, provider: 'record' };
}

const MODES = {
  tts: ttsVoice,
  clone: cloneVoice,
  record: recordedVoice,
};

/**
 * @param {{ text: string }} scene
 * @param {'tts'|'clone'|'record'} mode
 * @param {{ language: 'bn'|'en', gender?: 'female'|'male', sample?: Blob, blob?: Blob, onStatus?: Function }} options
 * @returns {Promise<{ blob: Blob, provider: string }>}
 */
export async function getVoice(scene, mode = 'tts', options = {}) {
  const handler = MODES[mode];
  if (!handler) throw new Error(`Voice mode "${mode}" is not available yet.`);
  return handler(scene, options);
}
