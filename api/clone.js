// Voice clone proxy to a Hugging Face Space (CLAUDE.md §10). The GPU/CPU model
// cannot run on Vercel; this only validates and forwards.
//   GET  /api/clone?wake=1  -> { ready: boolean }   (cold-start polling)
//   POST /api/clone         -> audio/wav
//        Body: { text, language, consent: true, sample: <base64>, mime }
// Voice samples are never stored or logged: they live only in this request.
import { requireMethod, requireString, requireLanguage, parseBody, sendError, ValidationError, LIMITS } from './_lib/validate.js';
import { rateLimit, clientKey } from './_lib/rateLimit.js';

const ALLOWED_MIME = new Set(['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/wav', 'audio/x-wav', 'audio/mpeg']);

function unavailable(message, status = 503) {
  const err = new Error(message);
  err.status = status;
  err.expose = true; // user-facing and safe: contains no upstream detail
  return err;
}

function spaceConfig() {
  const url = process.env.HF_SPACE_URL;
  if (!url) throw unavailable('Voice cloning is not configured.');
  const headers = process.env.HF_TOKEN ? { Authorization: `Bearer ${process.env.HF_TOKEN}` } : {};
  return { base: url.replace(/\/+$/, ''), headers };
}

async function wake(res) {
  const { base, headers } = spaceConfig();
  let ready = false;
  try {
    const r = await fetch(`${base}/health`, { headers, signal: AbortSignal.timeout(8000) });
    ready = r.ok;
  } catch {
    /* sleeping or building */
  }
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ready });
}

export default async function handler(req, res) {
  try {
    requireMethod(req, ['GET', 'POST']);

    const isWake = req.method === 'GET';
    const limit = rateLimit(`clone:${isWake ? 'wake' : 'run'}:${clientKey(req)}`, { max: isWake ? 40 : 10, windowMs: 60_000 });
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      return sendError(res, { status: 429, message: 'Too many requests. Please wait a moment and try again.' });
    }
    if (isWake) return await wake(res);

    const body = parseBody(req);
    if (body.consent !== true) {
      throw new ValidationError('Please confirm this is your own voice or that you have permission to clone it.');
    }
    const text = requireString(body.text, { field: 'text', maxLen: LIMITS.cloneTextMaxLen });
    const language = requireLanguage(body.language);
    const mime = String(body.mime || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_MIME.has(mime)) throw new ValidationError('Unsupported audio format for the voice sample.');
    if (typeof body.sample !== 'string' || !/^[A-Za-z0-9+/]+=*$/.test(body.sample)) {
      throw new ValidationError('sample must be base64 audio');
    }
    const sample = Buffer.from(body.sample, 'base64');
    if (sample.length === 0) throw new ValidationError('sample is empty');
    if (sample.length > LIMITS.sampleMaxBytes) throw new ValidationError('Voice sample is too large.');

    const { base, headers } = spaceConfig();
    const form = new FormData();
    form.set('text', text);
    form.set('language', language);
    form.set('sample', new Blob([sample], { type: mime }), 'sample');

    let upstream;
    try {
      upstream = await fetch(`${base}/clone`, { method: 'POST', headers, body: form, signal: AbortSignal.timeout(55_000) });
    } catch {
      throw unavailable('The voice engine is starting up or too slow. Please try again in a moment.');
    }

    if (upstream.status === 422) throw unavailable('Voice cloning is not supported for this language yet.', 422);
    if (upstream.status === 503) throw unavailable('The voice engine is busy. Please try again in a moment.');
    if (!upstream.ok) throw unavailable('Voice cloning failed. Please try again.', 502);

    const audio = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', 'audio/wav');
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(audio);
  } catch (err) {
    sendError(res, err);
  }
}
