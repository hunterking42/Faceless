// Subtitle look presets. Data only; the renderer reads these.

export const SUBTITLE_STYLES = {
  classic: { fill: '#ffffff', stroke: 'rgba(0,0,0,0.85)', strokeEm: 0.12, box: null, weight: 700, sizeEm: 0.045 },
  bold: { fill: '#ffe14a', stroke: 'rgba(0,0,0,0.9)', strokeEm: 0.16, box: null, weight: 800, sizeEm: 0.052 },
  box: { fill: '#ffffff', stroke: null, strokeEm: 0, box: 'rgba(0,0,0,0.62)', weight: 700, sizeEm: 0.042 },
};

export const DEFAULT_SUBTITLE_STYLE = 'classic';

/** Font size scales with the short side so 720p and 1080p, portrait and landscape look alike. */
export function subtitleFontPx(style, width, height) {
  const s = SUBTITLE_STYLES[style] || SUBTITLE_STYLES[DEFAULT_SUBTITLE_STYLE];
  return Math.round(Math.min(width, height) * s.sizeEm * (width < height ? 1.25 : 1));
}
