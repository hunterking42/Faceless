// Music ducking envelope. Pure: turns speech intervals into gain automation points.

/** Merges intervals closer than `gap` seconds so the music doesn't pump between sentences. */
export function mergeIntervals(intervals, gap) {
  const merged = [];
  for (const { start, end } of [...intervals].sort((a, b) => a.start - b.start)) {
    const last = merged[merged.length - 1];
    if (last && start - last.end < gap) last.end = Math.max(last.end, end);
    else merged.push({ start, end });
  }
  return merged;
}

/**
 * @param {{start:number,end:number}[]} speech intervals in seconds
 * @param {number} total video length
 * @returns {{t:number, gain:number}[]} points for linearRampToValueAtTime, strictly ascending in t
 */
export function duckEnvelope(speech, total, { base = 0.28, ducked = 0.09, attack = 0.25, release = 0.6 } = {}) {
  const pts = [{ t: 0, gain: base }];
  const push = (t, gain) => {
    const clamped = Math.min(total, Math.max(0, t));
    if (clamped > pts[pts.length - 1].t) pts.push({ t: clamped, gain });
  };
  for (const { start, end } of mergeIntervals(speech, attack + release)) {
    push(start - attack, base);
    push(start, ducked);
    push(end, ducked);
    push(end + release, base);
  }
  return pts;
}
