// Thin wrapper around fetch() for calling our own /api functions.
// Centralizes error handling so UI code gets a clean, human-readable
// message instead of raw stack traces (CLAUDE.md §12).

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

async function send(path, { method = 'GET', body, params } = {}) {
  let url = path;
  if (params) {
    const qs = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null)
    ).toString();
    if (qs) url += `?${qs}`;
  }

  let resp;
  try {
    resp = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Could not reach the server. Check your connection and try again.', 0);
  }

  if (!resp.ok) {
    let data = null;
    try {
      data = await resp.json();
    } catch {
      /* non-JSON error body */
    }
    const err = new ApiError(data?.error || `Request failed (${resp.status})`, resp.status);
    err.retryAfterSec = Number(resp.headers.get('Retry-After')) || 0;
    throw err;
  }
  return resp;
}

async function request(path, opts) {
  const resp = await send(path, opts);
  try {
    return await resp.json();
  } catch {
    return null;
  }
}

/**
 * @param {{topic: string, language: 'bn'|'en', sceneCount?: number}} input
 */
export function generateScript(input) {
  return request('/api/script', { method: 'POST', body: input });
}

/**
 * @param {{keyword: string, type?: 'video'|'photo', orientation?: 'portrait'|'landscape'}} input
 */
export function searchMedia({ keyword, type, orientation, perPage }) {
  return request('/api/media', { params: { keyword, type, orientation, perPage } });
}

/**
 * One TTS call per scene (CLAUDE.md §2).
 * @param {{text: string, language: 'bn'|'en', gender?: 'female'|'male'}} input
 * @returns {Promise<{blob: Blob, provider: string}>}
 */
export async function synthesizeSpeech(input) {
  const resp = await send('/api/tts', { method: 'POST', body: input });
  return { blob: await resp.blob(), provider: resp.headers.get('X-TTS-Provider') || 'unknown' };
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(new ApiError('Could not read the voice sample.', 0));
    reader.readAsDataURL(blob);
  });
}

/** Polls the voice engine's readiness (cold start). @returns {Promise<{ready: boolean}>} */
export function wakeCloneEngine() {
  return request('/api/clone', { params: { wake: 1 } });
}

/**
 * @param {{text: string, language: 'bn'|'en', sample: Blob, consent: true}} input
 * @returns {Promise<Blob>}
 */
export async function cloneSpeech({ text, language, sample, consent }) {
  const resp = await send('/api/clone', {
    method: 'POST',
    body: { text, language, consent, mime: sample.type || 'audio/webm', sample: await toBase64(sample) },
  });
  return resp.blob();
}

/**
 * @param {{title: string, language: 'bn'|'en', scenes: string[]}} input
 * @returns {Promise<{title: string, description: string, tags: string[], hashtags: string[]}>}
 */
export function generateMetadata(input) {
  return request('/api/metadata', { method: 'POST', body: input });
}

export { ApiError };
