// Shared input validation helpers. Keep limits conservative — free-tier
// providers (Gemini, NVIDIA NIM) bill us in latency and quota, not money,
// but quota is still finite and shared.

export const LIMITS = {
  topicMaxLen: 200,
  titleMaxLen: 200,
  sceneTextMaxLen: 500,
  keywordMaxLen: 80,
  maxScenes: 15,
  cloneTextMaxLen: 300, // CPU inference on a free Space is slow; keep clips short
  sampleMaxBytes: 3_000_000,
};

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ValidationError';
    this.status = 400;
  }
}

/** Throws ValidationError if method isn't in allowed list. */
export function requireMethod(req, methods) {
  const allowed = Array.isArray(methods) ? methods : [methods];
  if (!allowed.includes(req.method)) {
    const err = new ValidationError(`Method ${req.method} not allowed`);
    err.status = 405;
    err.allow = allowed.join(', ');
    throw err;
  }
}

/** Trims a string field, enforces presence and max length. */
export function requireString(value, { field, maxLen, minLen = 1 }) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < minLen) {
    throw new ValidationError(`${field} is required`);
  }
  if (trimmed.length > maxLen) {
    throw new ValidationError(`${field} must be ${maxLen} characters or fewer`);
  }
  return trimmed;
}

/** Validates a language code is one we support. */
export function requireLanguage(value) {
  const lang = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (lang !== 'bn' && lang !== 'en') {
    throw new ValidationError('language must be "bn" or "en"');
  }
  return lang;
}

/** Safely parses JSON request bodies that Vercel may hand us as a string or object. */
export function parseBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'object') return req.body;
  try {
    return JSON.parse(req.body);
  } catch {
    throw new ValidationError('Request body must be valid JSON');
  }
}

/** Sends a consistent { error } JSON response and ends the request. Accepts
 * an Error instance or a plain { status, message } object. */
export function sendError(res, err) {
  const status = err.status || 500;
  if (err.allow) res.setHeader('Allow', err.allow);
  // Never leak stack traces or upstream error bodies to the client.
  const rawMessage = err.message || 'Something went wrong. Please try again.';
  const message = status >= 500 && !err.expose ? 'Something went wrong. Please try again.' : rawMessage;
  res.status(status).json({ error: message });
}
