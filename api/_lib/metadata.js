// Prompt + normalisation for /api/metadata. Pure, so tests need no network.

export const META_LIMITS = {
  titleMax: 100, // YouTube's title limit
  descriptionMax: 1500,
  tagMax: 30,
  tagsTotalMax: 450, // YouTube allows ~500 characters of tags in total
  tagCountMax: 15,
  hashtagMax: 3,
};

export function buildMetadataPrompt({ title, language, narration }) {
  const langName = language === 'bn' ? 'Bengali (Bangla)' : 'English';
  const system =
    'You write YouTube metadata. You always respond with strict JSON only, matching the exact schema given. No markdown, no commentary, no code fences.';
  const user = `Write YouTube metadata for a short faceless video.

Working title: "${title}"
Narration language: ${langName}
Narration:
"""
${narration}
"""

Rules:
- "title": under ${META_LIMITS.titleMax} characters, in ${langName}, specific and curious, no clickbait lies, no ALL CAPS.
- "description": 2-4 short sentences in ${langName} summarising what the video covers. Only describe what the narration actually says. Do not add facts, statistics or claims that are not in the narration.
- "tags": 8-12 short search tags (1-3 words each). Mix ${langName} and English.
- "hashtags": up to ${META_LIMITS.hashtagMax} hashtags, each starting with #, no spaces.

Respond with ONLY this JSON shape:
{ "title": "...", "description": "...", "tags": ["..."], "hashtags": ["#..."] }`;
  return { system, user };
}

export function isValidMetadata(p) {
  return Boolean(
    p &&
      typeof p === 'object' &&
      typeof p.title === 'string' &&
      p.title.trim() &&
      typeof p.description === 'string' &&
      p.description.trim() &&
      Array.isArray(p.tags)
  );
}

/** Enforces YouTube's limits regardless of what the model returned. */
export function normalizeMetadata(p) {
  const clean = (s) => String(s ?? '').replace(/\s+/gu, ' ').trim();

  const title = Array.from(clean(p.title)).slice(0, META_LIMITS.titleMax).join('');
  const description = Array.from(String(p.description ?? '').trim()).slice(0, META_LIMITS.descriptionMax).join('');

  const seen = new Set();
  const tags = [];
  let used = 0;
  for (const raw of p.tags || []) {
    const tag = Array.from(clean(raw).replace(/^#+/u, '')).slice(0, META_LIMITS.tagMax).join('');
    const key = tag.toLowerCase();
    if (!tag || seen.has(key)) continue;
    if (tags.length >= META_LIMITS.tagCountMax || used + tag.length + 1 > META_LIMITS.tagsTotalMax) break;
    seen.add(key);
    tags.push(tag);
    used += tag.length + 1;
  }

  const hashtags = [];
  for (const raw of Array.isArray(p.hashtags) ? p.hashtags : []) {
    const body = clean(raw).replace(/^#+/u, '').replace(/\s+/gu, '');
    if (body && hashtags.length < META_LIMITS.hashtagMax && !hashtags.includes(`#${body}`)) hashtags.push(`#${body}`);
  }

  return { title, description, tags, hashtags };
}
