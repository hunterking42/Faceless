// Loads each scene's visual so it can be drawn on a canvas that MediaRecorder can still record.
// A canvas that has drawn a cross-origin resource without CORS is "tainted" and records blank,
// so every candidate is probed with getImageData; on failure we fall back to the Pexels still
// (images.pexels.com sends CORS headers) and finally to a drawn placeholder.

const LOAD_TIMEOUT_MS = 20_000;

function waitFor(target, okEvent, timeoutMs = LOAD_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => done(new Error('timeout')), timeoutMs);
    function done(err) {
      clearTimeout(timer);
      target.removeEventListener(okEvent, onOk);
      target.removeEventListener('error', onErr);
      err ? reject(err) : resolve();
    }
    const onOk = () => done();
    const onErr = () => done(new Error('load error'));
    target.addEventListener(okEvent, onOk);
    target.addEventListener('error', onErr);
  });
}

function isReadable(source) {
  try {
    const probe = document.createElement('canvas');
    probe.width = probe.height = 2;
    const c = probe.getContext('2d');
    c.drawImage(source, 0, 0, 2, 2);
    c.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

async function loadImage(url) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = url;
  await waitFor(img, 'load');
  if (!isReadable(img)) throw new Error('tainted');
  return { kind: 'image', el: img, width: img.naturalWidth, height: img.naturalHeight };
}

async function loadVideo(url) {
  const v = document.createElement('video');
  v.crossOrigin = 'anonymous';
  v.muted = true;
  v.loop = true;
  v.playsInline = true;
  v.preload = 'auto';
  v.src = url;
  await waitFor(v, 'loadeddata');
  if (!isReadable(v)) throw new Error('tainted');
  return { kind: 'video', el: v, width: v.videoWidth, height: v.videoHeight };
}

/**
 * @returns {Promise<{ media: object|null, fallback: 'none'|'still'|'placeholder' }>}
 */
export async function loadSceneMedia(media) {
  if (!media) return { media: null, fallback: 'placeholder' };
  if (media.type === 'video') {
    try {
      return { media: await loadVideo(media.url), fallback: 'none' };
    } catch {
      /* fall through to the still frame */
    }
    if (media.previewUrl) {
      try {
        return { media: await loadImage(media.previewUrl), fallback: 'still' };
      } catch {
        /* fall through */
      }
    }
    return { media: null, fallback: 'placeholder' };
  }
  try {
    return { media: await loadImage(media.url), fallback: 'none' };
  } catch {
    return { media: null, fallback: 'placeholder' };
  }
}

export function releaseMedia(loaded) {
  if (loaded?.kind === 'video') {
    loaded.el.pause();
    loaded.el.removeAttribute('src');
    loaded.el.load();
  }
}
