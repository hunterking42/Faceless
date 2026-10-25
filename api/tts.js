// POST /api/tts
// Body: { text: string, language: "bn" | "en", gender?: "female" | "male" }
// Returns: audio bytes (audio/mpeg or audio/wav). Header X-TTS-Provider names the backend.
// One call per scene, never per video (CLAUDE.md §2).
import { synthesize } from './_lib/tts.js';
import { requireMethod, requireString, requireLanguage, parseBody, sendError, ValidationError, LIMITS } from './_lib/validate.js';
import { rateLimit, clientKey } from './_lib/rateLimit.js';

export default async function handler(req, res) {
  try {
    requireMethod(req, 'POST');

    const limit = rateLimit(`tts:${clientKey(req)}`, { max: 30, windowMs: 60_000 });
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      return sendError(res, { status: 429, message: 'Too many requests. Please wait a moment and try again.' });
    }

    const body = parseBody(req);
    const text = requireString(body.text, { field: 'text', maxLen: LIMITS.sceneTextMaxLen });
    const language = requireLanguage(body.language);
    const gender = body.gender === undefined ? 'female' : body.gender;
    if (gender !== 'female' && gender !== 'male') {
      throw new ValidationError('gender must be "female" or "male"');
    }

    const { audio, mime, provider } = await synthesize({ text, language, gender });

    res.setHeader('Content-Type', mime);
    res.setHeader('X-TTS-Provider', provider);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(audio);
  } catch (err) {
    sendError(res, err);
  }
}
