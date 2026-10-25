// Scene transitions. Pure math: the renderer asks for an alpha and draws twice.

export const FADE_SEC = 0.35;

/**
 * Alpha for the incoming scene at `localT` seconds into it. 1 = fully visible.
 * The first scene fades in from black; later scenes cross-fade over the previous one.
 * The fade is capped to a fraction of the scene so very short scenes still show.
 */
export function incomingAlpha(localT, sceneDuration, fade = FADE_SEC) {
  const f = Math.min(fade, sceneDuration / 3);
  if (f <= 0) return 1;
  return Math.min(1, Math.max(0, localT / f));
}

/** Fade-out multiplier for the final scene's last moments (and audio tail). */
export function outroAlpha(localT, sceneDuration, fade = FADE_SEC) {
  const f = Math.min(fade, sceneDuration / 3);
  if (f <= 0) return 1;
  return Math.min(1, Math.max(0, (sceneDuration - localT) / f));
}
