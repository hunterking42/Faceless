// Builds the credit lines for the video description. Pexels asks for attribution
// where appropriate (CLAUDE.md §12); the description is the natural place for it.

/** @returns {string} text to append to the description ('' when no stock clips were used) */
export function buildCredits(scenes, { includeAiDisclosure = true } = {}) {
  const seen = new Set();
  const lines = [];
  for (const s of scenes) {
    const m = s.media;
    if (!m || !m.photographer) continue;
    const key = `${m.photographer}|${m.pexelsUrl || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`• ${m.photographer}${m.pexelsUrl ? ` — ${m.pexelsUrl}` : ''}`);
  }
  const parts = [];
  if (lines.length) parts.push(`Video clips from Pexels (https://www.pexels.com):\n${lines.join('\n')}`);
  if (includeAiDisclosure) parts.push('Script and voiceover created with AI tools.');
  return parts.join('\n\n');
}

/** Joins description, hashtags and credits into the final text the user pastes into YouTube. */
export function composeDescription({ description, hashtags = [], credits = '' }) {
  return [description.trim(), hashtags.join(' '), credits].filter(Boolean).join('\n\n');
}
