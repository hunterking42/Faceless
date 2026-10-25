// Minimal in-memory rate limiter. Vercel serverless functions are
// stateless/ephemeral and may run on different instances per request, so
// this is a best-effort throttle, not a strict guarantee — good enough to
// stop accidental hammering (e.g. a buggy client retry loop) on a free tier
// where NVIDIA NIM gives us ~40 req/min shared across the whole key.
//
// For a real multi-instance guarantee you'd need a shared store (Redis,
// Vercel KV), which is out of scope per the zero-cost / no-infra rule.

const buckets = new Map(); // key -> { count, resetAt }

/**
 * @param {string} key - usually `${routeName}:${clientIp}`
 * @param {object} opts
 * @param {number} opts.max - max requests per window
 * @param {number} opts.windowMs - window length in ms
 * @returns {{ allowed: boolean, retryAfterSec: number }}
 */
export function rateLimit(key, { max = 10, windowMs = 60_000 } = {}) {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    bucket = { count: 0, resetAt: now + windowMs };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > max) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) };
  }

  return { allowed: true, retryAfterSec: 0 };
}

/** Gets a reasonably stable client identifier from a Vercel request. */
export function clientKey(req) {
  const fwd = req.headers?.['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : fwd || '').split(',')[0].trim();
  return ip || req.socket?.remoteAddress || 'unknown';
}

// Opportunistically prevent unbounded memory growth in long-lived instances.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now > bucket.resetAt) buckets.delete(key);
  }
}, 5 * 60_000);
cleanupTimer.unref?.();
