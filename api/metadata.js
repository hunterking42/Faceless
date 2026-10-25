// POST /api/metadata
// Body: { title: string, language: "bn"|"en", scenes: string[] }  (narration text per scene)
// Returns: { title, description, tags, hashtags, provider }
import { generateJSON } from './_lib/llm.js';
import { requireMethod, requireString, requireLanguage, parseBody, sendError, ValidationError, LIMITS } from './_lib/validate.js';
import { rateLimit, clientKey } from './_lib/rateLimit.js';
import { buildMetadataPrompt, isValidMetadata, normalizeMetadata } from './_lib/metadata.js';

export default async function handler(req, res) {
  try {
    requireMethod(req, 'POST');

    const limit = rateLimit(`metadata:${clientKey(req)}`, { max: 6, windowMs: 60_000 });
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      return sendError(res, { status: 429, message: 'Too many requests. Please wait a moment and try again.' });
    }

    const body = parseBody(req);
    const title = requireString(body.title, { field: 'title', maxLen: LIMITS.titleMaxLen });
    const language = requireLanguage(body.language);

    if (!Array.isArray(body.scenes) || body.scenes.length === 0 || body.scenes.length > LIMITS.maxScenes) {
      throw new ValidationError(`scenes must be a list of 1 to ${LIMITS.maxScenes} narration texts`);
    }
    const narration = body.scenes
      .map((s) => requireString(s, { field: 'scene text', maxLen: LIMITS.sceneTextMaxLen }))
      .join('\n');

    const { system, user } = buildMetadataPrompt({ title, language, narration });
    const { parsed, provider } = await generateJSON({ systemPrompt: system, userPrompt: user, validate: isValidMetadata });

    res.status(200).json({ ...normalizeMetadata(parsed), provider });
  } catch (err) {
    sendError(res, err);
  }
}
