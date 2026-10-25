// GET /api/media?keyword=...&type=video|photo&orientation=portrait|landscape
// Proxies Pexels so the API key never reaches the client (CLAUDE.md §2, §13).
import { requireMethod, requireString, sendError, LIMITS } from './_lib/validate.js';
import { rateLimit, clientKey } from './_lib/rateLimit.js';

const PEXELS_VIDEO_URL = 'https://api.pexels.com/videos/search';
const PEXELS_PHOTO_URL = 'https://api.pexels.com/v1/search';

export default async function handler(req, res) {
  try {
    requireMethod(req, 'GET');

    const limit = rateLimit(`media:${clientKey(req)}`, { max: 30, windowMs: 60_000 });
    if (!limit.allowed) {
      res.setHeader('Retry-After', String(limit.retryAfterSec));
      return sendError(res, { status: 429, message: 'Too many requests. Please wait a moment and try again.' });
    }

    const keyword = requireString(req.query.keyword, { field: 'keyword', maxLen: LIMITS.keywordMaxLen });

    const key = process.env.PEXELS_API_KEY;
    if (!key) {
      return sendError(res, { status: 500, message: 'Media search is not configured.' });
    }

    const type = req.query.type === 'photo' ? 'photo' : 'video'; // default to video
    const orientation = req.query.orientation === 'landscape' ? 'landscape' : 'portrait'; // Shorts default
    const perPage = Math.min(Math.max(parseInt(req.query.perPage, 10) || 6, 1), 15);

    const base = type === 'photo' ? PEXELS_PHOTO_URL : PEXELS_VIDEO_URL;
    const url = new URL(base);
    url.searchParams.set('query', keyword);
    url.searchParams.set('orientation', orientation);
    url.searchParams.set('per_page', String(perPage));

    const resp = await fetch(url, {
      headers: { Authorization: key },
    });

    if (!resp.ok) {
      return sendError(res, { status: 502, message: 'Media provider request failed.' });
    }

    const data = await resp.json();

    const results =
      type === 'photo'
        ? (data.photos || []).map((p) => ({
            id: p.id,
            type: 'image',
            previewUrl: p.src?.medium,
            url: p.src?.large2x || p.src?.original,
            width: p.width,
            height: p.height,
            photographer: p.photographer,
            pexelsUrl: p.url,
          }))
        : (data.videos || []).map((v) => {
            // Pick a reasonably sized file: prefer HD, fall back to the first available.
            const file =
              v.video_files?.find((f) => f.quality === 'hd' && f.width <= 1920) ||
              v.video_files?.find((f) => f.quality === 'sd') ||
              v.video_files?.[0];
            return {
              id: v.id,
              type: 'video',
              previewUrl: v.image,
              url: file?.link,
              width: v.width,
              height: v.height,
              durationSec: v.duration,
              photographer: v.user?.name,
              pexelsUrl: v.url,
            };
          });

    // Cache at the edge/browser for a bit — same keyword searched again
    // shortly after shouldn't re-hit Pexels (CLAUDE.md §13: cache to save quota).
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=3600');
    res.status(200).json({ keyword, type, orientation, results });
  } catch (err) {
    sendError(res, err);
  }
}
