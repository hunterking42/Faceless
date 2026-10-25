// Pure canvas geometry: output size, cover-fit, Ken Burns, text wrapping,
// and recorder MIME selection. Everything takes plain numbers/functions.

const SIZES = {
  '9:16': { '720p': [720, 1280], '1080p': [1080, 1920] },
  '16:9': { '720p': [1280, 720], '1080p': [1920, 1080] },
};

export function outputSize(format, quality = '1080p') {
  const bySize = SIZES[format] || SIZES['9:16'];
  const [width, height] = bySize[quality] || bySize['1080p'];
  return { width, height };
}

/** Source rect (sx, sy, sw, sh) that fills the target aspect without distortion. `zoom` >= 1 crops further. */
export function coverRect(srcW, srcH, dstW, dstH, zoom = 1, focusX = 0.5, focusY = 0.5) {
  if (!(srcW > 0 && srcH > 0)) return { sx: 0, sy: 0, sw: 0, sh: 0 };
  const srcAspect = srcW / srcH;
  const dstAspect = dstW / dstH;
  let sw = srcW;
  let sh = srcH;
  if (srcAspect > dstAspect) sw = srcH * dstAspect;
  else sh = srcW / dstAspect;
  sw /= zoom;
  sh /= zoom;
  const sx = (srcW - sw) * focusX;
  const sy = (srcH - sh) * focusY;
  return { sx, sy, sw, sh };
}

/**
 * Ken Burns: slow zoom, direction alternates per scene so consecutive scenes
 * don't all push in the same way. progress is 0..1 within the scene.
 */
export function kenBurns(progress, sceneIndex, strength = 0.08) {
  const p = Math.min(1, Math.max(0, progress));
  const zoomIn = sceneIndex % 2 === 0;
  const zoom = zoomIn ? 1 + strength * p : 1 + strength * (1 - p);
  const focusX = 0.5 + (sceneIndex % 3 === 1 ? 0.15 : sceneIndex % 3 === 2 ? -0.15 : 0) * p;
  return { zoom, focusX: Math.min(1, Math.max(0, focusX)), focusY: 0.5 };
}

/**
 * Greedy word wrap using a caller-supplied width measure, so it works with
 * ctx.measureText in the browser and a fake in tests. A single word wider than
 * maxWidth stays on its own line instead of being cut (Bengali clusters must not split).
 */
export function wrapLines(text, maxWidth, measure) {
  const words = text.split(/\s+/u).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

const MIME_CANDIDATES = [
  { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
  { mime: 'video/mp4', ext: 'mp4' },
  { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
  { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
  { mime: 'video/webm', ext: 'webm' },
];

/**
 * Picks the first container the browser can record. WebM first when
 * `preferMp4` is false, because MediaRecorder's MP4 output is newer and less
 * proven than WebM; the user opts in.
 */
export function pickMime(isSupported, preferMp4 = false) {
  const order = preferMp4 ? MIME_CANDIDATES : [...MIME_CANDIDATES].sort((a, b) => (a.ext === b.ext ? 0 : a.ext === 'webm' ? -1 : 1));
  return order.find((c) => isSupported(c.mime)) || null;
}

/** Filesystem-safe file name from a title; keeps Bengali letters. */
export function safeFileName(title, ext) {
  const base = (title || 'video').normalize('NFC').replace(/[\\/:*?"<>|\u0000-\u001f]/gu, '').replace(/\s+/gu, '-').slice(0, 60).replace(/^-+|-+$/g, '');
  return `${base || 'video'}.${ext}`;
}
