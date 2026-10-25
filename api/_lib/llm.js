// All text generation goes through this module. Endpoints never call
// Gemini or NVIDIA directly (CLAUDE.md §9). Tries Gemini first; on error
// or 429 falls back to NVIDIA NIM (OpenAI-compatible).

const GEMINI_MODEL = 'gemini-1.5-flash'; // fast + free-tier friendly
const GEMINI_URL = (model, key) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;
const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions';

class LLMProviderError extends Error {
  constructor(message, { provider, status }) {
    super(message);
    this.name = 'LLMProviderError';
    this.provider = provider;
    this.status = status;
  }
}

async function callGemini({ systemPrompt, userPrompt, jsonMode }) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new LLMProviderError('GEMINI_API_KEY not configured', { provider: 'gemini', status: 0 });

  const body = {
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    systemInstruction: systemPrompt ? { parts: [{ text: systemPrompt }] } : undefined,
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: 2048,
      ...(jsonMode ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const resp = await fetch(GEMINI_URL(GEMINI_MODEL, key), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new LLMProviderError(`Gemini request failed`, { provider: 'gemini', status: resp.status });
  }

  const data = await resp.json();
  const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') ?? '';
  if (!text) throw new LLMProviderError('Gemini returned empty response', { provider: 'gemini', status: 200 });
  return text;
}

async function callNvidia({ systemPrompt, userPrompt, jsonMode }) {
  const key = process.env.NVIDIA_API_KEY;
  const model = process.env.NVIDIA_MODEL;
  if (!key) throw new LLMProviderError('NVIDIA_API_KEY not configured', { provider: 'nvidia', status: 0 });
  if (!model) throw new LLMProviderError('NVIDIA_MODEL not configured', { provider: 'nvidia', status: 0 });

  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  messages.push({ role: 'user', content: userPrompt });

  const body = {
    model,
    messages,
    temperature: 0.8,
    max_tokens: 2048,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
  };

  const resp = await fetch(NVIDIA_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    throw new LLMProviderError(`NVIDIA NIM request failed`, { provider: 'nvidia', status: resp.status });
  }

  const data = await resp.json();
  const text = data?.choices?.[0]?.message?.content ?? '';
  if (!text) throw new LLMProviderError('NVIDIA NIM returned empty response', { provider: 'nvidia', status: 200 });
  return text;
}

/**
 * Generates text via Gemini, falling back to NVIDIA NIM on error or 429.
 * @param {object} opts
 * @param {string} [opts.systemPrompt]
 * @param {string} opts.userPrompt
 * @param {boolean} [opts.jsonMode] - request structured JSON output if the provider supports it
 * @returns {Promise<{ text: string, provider: 'gemini' | 'nvidia' }>}
 */
export async function generateText({ systemPrompt, userPrompt, jsonMode = false }) {
  try {
    const text = await callGemini({ systemPrompt, userPrompt, jsonMode });
    return { text, provider: 'gemini' };
  } catch (geminiErr) {
    // Fall back on any Gemini failure (network error, 4xx/5xx, missing key, empty response).
    try {
      const text = await callNvidia({ systemPrompt, userPrompt, jsonMode });
      return { text, provider: 'nvidia' };
    } catch (nvidiaErr) {
      const err = new Error('Both Gemini and NVIDIA NIM failed to generate a response.');
      err.status = 502;
      err.cause = { gemini: geminiErr.message, nvidia: nvidiaErr.message };
      throw err;
    }
  }
}

/**
 * Strips markdown code fences (```json ... ```) that LLMs often wrap JSON in.
 */
export function stripCodeFences(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : trimmed;
}

/**
 * Generates text expected to be JSON matching the caller's schema, parses
 * defensively, and retries once (with a corrective follow-up prompt) if
 * parsing fails.
 * @param {object} opts - same as generateText, plus:
 * @param {(parsed: any) => boolean} [opts.validate] - optional shape check; failure triggers the retry
 */
export async function generateJSON({ systemPrompt, userPrompt, validate }) {
  const attempt = async (prompt) => {
    const { text, provider } = await generateText({ systemPrompt, userPrompt: prompt, jsonMode: true });
    const cleaned = stripCodeFences(text);
    const parsed = JSON.parse(cleaned); // throws on invalid JSON — caught by caller below
    if (validate && !validate(parsed)) {
      const err = new Error('Parsed JSON did not match expected shape');
      err.name = 'ShapeError';
      throw err;
    }
    return { parsed, provider };
  };

  try {
    return await attempt(userPrompt);
  } catch (firstErr) {
    // Retry once with an explicit correction prompt.
    const retryPrompt = `${userPrompt}\n\nIMPORTANT: Your previous response was not valid JSON matching the required schema. Respond with ONLY valid JSON, no markdown code fences, no commentary.`;
    try {
      return await attempt(retryPrompt);
    } catch (secondErr) {
      const err = new Error('LLM did not return valid JSON after retry.');
      err.status = 502;
      err.cause = { first: firstErr.message, second: secondErr.message };
      throw err;
    }
  }
}
