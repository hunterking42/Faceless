// POST /api/script
// Body: { topic: string, language: "bn" | "en", sceneCount?: number }
// Returns: { title: string, scenes: [{ text, keyword }] }
import { generateJSON } from './_lib/llm.js';
import { requireMethod, requireString, requireLanguage, parseBody, sendError, LIMITS } from './_lib/validate.js';
import { rateLimit, clientKey } from './_lib/rateLimit.js';

function buildPrompt({ topic, language, sceneCount }) {
  const langName = language === 'bn' ? 'Bengali (Bangla)' : 'English';
  const narrationNote =
    language === 'bn'
      ? 'Write ALL "text" fields in natural, conversational Bengali (Bangla script). Keep sentences short and spoken, not written/formal.'
      : 'Write all "text" fields in natural, conversational English. Keep sentences short and spoken.';

  const system = `You are a scriptwriter for short-form YouTube videos. You write tight, punchy, engaging narration broken into scenes. You always respond with strict JSON only, matching the exact schema given. No markdown, no commentary, no code fences.`;

  const user = `Write a ${sceneCount}-scene video script about this topic: "${topic}"

Language for narration: ${langName}.
${narrationNote}

Each scene needs:
- "text": one or two spoken sentences of narration in ${langName}.
- "keyword": a short English search phrase (2-4 words) describing the visual for this scene, suitable for searching a stock video/photo library like Pexels. ALWAYS in English regardless of narration language.

The first scene must be a strong hook. The last scene should feel like a conclusion or call-to-action.

Respond with ONLY this JSON shape, no other text:
{
  "title": "a catchy video title in ${langName}",
  "scenes": [
    { "text": "...", "keyword": "..." }
  ]
}`;

  return { system, user };
}

function isValidScript(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (typeof parsed.title !== 'string' || !parsed.title.trim()) return false;
  if (!Array.isArray(parsed.scenes) || parsed.scenes.length === 0) return false;
  return parsed.scenes.every(
    (s) => s && typeof s.text === 'string' && s.text.trim() && typeof s.keyword === 'string' && s.keyword.trim()
  );
}

export default async function handler(req, res) {
  try {
    requireMethod(req, 'POST');

    const limit = rateLimit(`script:${clientKey(req)}`, { max: 8, windowMs: 60_000 });
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      return sendError(res, { status: 429, message: 'Too many requests. Please wait a moment and try again.' });
    }

    const body = parseBody(req);
    const topic = requireString(body.topic, { field: 'topic', maxLen: LIMITS.topicMaxLen });
    const language = requireLanguage(body.language);

    let sceneCount = 6;
    if (body.sceneCount !== undefined) {
      const n = Number(body.sceneCount);
      if (!Number.isInteger(n) || n < 3 || n > LIMITS.maxScenes) {
        return sendError(res, { status: 400, message: `sceneCount must be an integer between 3 and ${LIMITS.maxScenes}` });
      }
      sceneCount = n;
    }

    const { system, user } = buildPrompt({ topic, language, sceneCount });

    const { parsed, provider } = await generateJSON({
      systemPrompt: system,
      userPrompt: user,
      validate: isValidScript,
    });

    // Trim scenes to requested count defensively (LLMs sometimes over/under-produce).
    const scenes = parsed.scenes.slice(0, sceneCount).map((s, i) => ({
      id: `s${i + 1}`,
      text: s.text.trim().slice(0, LIMITS.sceneTextMaxLen),
      keyword: s.keyword.trim().slice(0, LIMITS.keywordMaxLen),
    }));

    res.status(200).json({
      title: parsed.title.trim(),
      language,
      scenes,
      provider, // useful for debugging which backend served the request; harmless to expose
    });
  } catch (err) {
    sendError(res, err);
  }
}
