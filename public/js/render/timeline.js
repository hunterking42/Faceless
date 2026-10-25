// Pure timeline math for the renderer. No DOM, so Node tests cover it.
import { estimateDuration } from './subtitles.js';

export const MAX_VIDEO_SEC = 180; // CLAUDE.md §11
export const TRAILING_PAD_SEC = 0.4; // breathing room after the last word of a scene
export const MIN_SCENE_SEC = 1.5;

/**
 * Lays scenes end to end. Scenes without narration text are skipped.
 * A scene with voice lasts as long as its audio (plus a short pad); without
 * voice it uses the same estimate the preview player uses.
 * @returns {{ items: {index:number, scene:object, start:number, end:number, duration:number, hasVoice:boolean}[], total:number, overCap:boolean }}
 */
export function buildTimeline(scenes, language) {
  const items = [];
  let cursor = 0;
  scenes.forEach((scene, index) => {
    if (!scene.text?.trim()) return;
    const voiced = Boolean(scene.audio?.blobUrl) && scene.audio.durationSec > 0;
    const duration = voiced
      ? scene.audio.durationSec + TRAILING_PAD_SEC
      : Math.max(MIN_SCENE_SEC, estimateDuration(scene.text, language));
    items.push({ index, scene, start: cursor, end: cursor + duration, duration, hasVoice: voiced });
    cursor += duration;
  });
  return { items, total: cursor, overCap: cursor > MAX_VIDEO_SEC };
}

/** Item active at time t (clamped to the last item), or null for an empty timeline. */
export function itemAt(timeline, t) {
  const { items } = timeline;
  if (!items.length) return null;
  for (const item of items) if (t < item.end) return item;
  return items[items.length - 1];
}
