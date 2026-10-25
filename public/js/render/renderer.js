// Canvas + MediaRecorder renderer (CLAUDE.md §11). Runs in real time: a 60 s video takes about 60 s.
// Timing comes from the AudioContext clock, so picture and narration stay in sync.
import { buildTimeline, itemAt } from './timeline.js';
import { outputSize, coverRect, kenBurns, wrapLines, pickMime } from './layout.js';
import { incomingAlpha, FADE_SEC } from './transitions.js';
import { buildCues, cueAt } from './subtitles.js';
import { SUBTITLE_STYLES, DEFAULT_SUBTITLE_STYLE, subtitleFontPx } from './subtitleStyle.js';
import { createAudioMixer } from './audioMixer.js';
import { loadSceneMedia, releaseMedia } from './mediaLoader.js';

const FPS = 30;
const FONT_STACK = '"Noto Sans Bengali", "Segoe UI", system-ui, sans-serif';

export class RenderError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'RenderError';
    this.code = code; // empty | too_long | unsupported | cancelled | recorder
  }
}

export function canRender() {
  return typeof MediaRecorder !== 'undefined' && typeof HTMLCanvasElement.prototype.captureStream === 'function' && Boolean(window.AudioContext || window.webkitAudioContext);
}

async function ensureFont() {
  try {
    await document.fonts.load(`700 40px "Noto Sans Bengali"`, 'অআক');
    await document.fonts.load(`400 40px "Noto Sans Bengali"`, 'অআক');
  } catch {
    /* system fallback is fine; glyphs still draw */
  }
}

function drawMedia(ctx, loaded, w, h, item, progress, index) {
  if (!loaded || !(loaded.width > 0 && loaded.height > 0)) {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#1d1b3a');
    g.addColorStop(1, '#3b2a6b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.font = `700 ${Math.round(Math.min(w, h) * 0.06)}px ${FONT_STACK}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.scene.keyword || '', w / 2, h / 2);
    return;
  }
  const strength = loaded.kind === 'video' ? 0.04 : 0.09;
  const { zoom, focusX, focusY } = kenBurns(progress, index, strength);
  const { sx, sy, sw, sh } = coverRect(loaded.width, loaded.height, w, h, zoom, focusX, focusY);
  ctx.drawImage(loaded.el, sx, sy, sw, sh, 0, 0, w, h);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawSubtitle(ctx, text, w, h, styleName) {
  if (!text) return;
  const style = SUBTITLE_STYLES[styleName] || SUBTITLE_STYLES[DEFAULT_SUBTITLE_STYLE];
  const px = subtitleFontPx(styleName, w, h);
  ctx.font = `${style.weight} ${px}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const maxWidth = w * 0.86;
  const lines = wrapLines(text, maxWidth, (s) => ctx.measureText(s).width);
  const lineH = Math.round(px * 1.35);
  // Portrait: keep clear of the Shorts UI along the bottom edge.
  const centerY = h > w ? h * 0.7 : h * 0.86;
  const top = centerY - ((lines.length - 1) * lineH) / 2;

  if (style.box) {
    const widest = Math.max(...lines.map((l) => ctx.measureText(l).width));
    const padX = px * 0.6;
    const padY = px * 0.4;
    const bw = widest + padX * 2;
    const bh = lines.length * lineH + padY * 2 - (lineH - px);
    ctx.fillStyle = style.box;
    roundRect(ctx, w / 2 - bw / 2, centerY - bh / 2, bw, bh, px * 0.35);
    ctx.fill();
  }
  lines.forEach((line, i) => {
    const y = top + i * lineH;
    if (style.stroke) {
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = px * style.strokeEm * 2;
      ctx.strokeText(line, w / 2, y);
    }
    ctx.fillStyle = style.fill;
    ctx.fillText(line, w / 2, y);
  });
}

/**
 * @param {object} project  CLAUDE.md §7 project JSON (scenes carry audio.blobUrl)
 * @param {object} options
 * @param {'720p'|'1080p'} [options.quality]
 * @param {boolean} [options.preferMp4]
 * @param {string} [options.subtitleStyle]
 * @param {Blob|null} [options.musicBlob]
 * @param {boolean} [options.duck]
 * @param {(p:{phase:'prepare'|'render'|'finalize', fraction:number, elapsedSec?:number, totalSec?:number})=>void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ blob: Blob, ext: string, mime: string, durationSec: number, warnings: {sceneIndex:number, kind:string}[] }>}
 */
export async function renderVideo(project, options = {}) {
  const { quality = '1080p', preferMp4 = false, subtitleStyle = DEFAULT_SUBTITLE_STYLE, musicBlob = null, duck = true, onProgress = () => {}, signal } = options;
  const aborted = () => signal?.aborted;
  const cancelled = () => new RenderError('cancelled');

  if (!canRender()) throw new RenderError('unsupported');
  const timeline = buildTimeline(project.scenes, project.language);
  if (!timeline.items.length) throw new RenderError('empty');
  if (timeline.overCap) throw new RenderError('too_long');

  const chosen = pickMime((m) => MediaRecorder.isTypeSupported(m), preferMp4);
  if (!chosen) throw new RenderError('unsupported');

  const { width, height } = outputSize(project.format, quality);
  const { items, total } = timeline;
  const warnings = [];
  const loaded = [];
  let audioCtx = null;
  let mixer = null;
  let recorder = null;
  let timer = 0;
  let wakeLock = null;
  let combined = null;

  const cleanup = () => {
    clearInterval(timer);
    loaded.forEach(releaseMedia);
    mixer?.stop();
    audioCtx?.close?.().catch(() => {});
    combined?.getTracks().forEach((t) => t.stop());
    wakeLock?.release?.().catch(() => {});
  };

  try {
    onProgress({ phase: 'prepare', fraction: 0 });
    // Created while the click's user activation is fresh; media loading below can take seconds.
    const Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();
    await audioCtx.resume();
    await ensureFont();

    for (let i = 0; i < items.length; i++) {
      if (aborted()) throw cancelled();
      const result = await loadSceneMedia(items[i].scene.media);
      loaded.push(result.media);
      if (result.fallback !== 'none' && items[i].scene.media) warnings.push({ sceneIndex: items[i].index, kind: result.fallback });
      onProgress({ phase: 'prepare', fraction: (i + 1) / items.length });
    }

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { alpha: false });

    mixer = await createAudioMixer(audioCtx, items, total, { musicBlob, duck });

    const cueSets = items.map((it) => buildCues(it.scene.text, it.hasVoice ? it.scene.audio.durationSec : it.duration));

    combined = new MediaStream([...canvas.captureStream(FPS).getVideoTracks(), ...mixer.stream.getAudioTracks()]);
    recorder = new MediaRecorder(combined, {
      mimeType: chosen.mime,
      videoBitsPerSecond: quality === '720p' ? 4_000_000 : 8_000_000,
      audioBitsPerSecond: 128_000,
    });
    const chunks = [];
    recorder.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
    let recorderFailed = false;
    const stopped = new Promise((resolve) => {
      recorder.onstop = resolve;
      recorder.onerror = () => {
        recorderFailed = true;
        resolve();
      };
    });

    try {
      wakeLock = await navigator.wakeLock?.request('screen');
    } catch {
      /* optional */
    }

    const playing = new Set();
    const syncVideos = (current, localT) => {
      items.forEach((it, i) => {
        const media = loaded[i];
        if (media?.kind !== 'video') return;
        const isCurrent = i === current;
        const isHeldPrev = i === current - 1 && localT < FADE_SEC;
        if (isCurrent && !playing.has(i)) {
          media.el.currentTime = 0;
          media.el.play().catch(() => {});
          playing.add(i);
        } else if (!isCurrent && !isHeldPrev && playing.has(i)) {
          media.el.pause();
          playing.delete(i);
        }
      });
    };

    const drawFrame = (t) => {
      const item = itemAt(timeline, t);
      const i = items.indexOf(item);
      const local = Math.min(item.duration, t - item.start);
      syncVideos(i, local);

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, width, height);
      const alpha = incomingAlpha(local, item.duration);
      if (i > 0 && alpha < 1) drawMedia(ctx, loaded[i - 1], width, height, items[i - 1], 1, items[i - 1].index);
      ctx.globalAlpha = alpha;
      drawMedia(ctx, loaded[i], width, height, item, local / item.duration, item.index);
      ctx.globalAlpha = 1;
      drawSubtitle(ctx, cueAt(cueSets[i], local)?.text, width, height, subtitleStyle);
    };

    drawFrame(0);
    recorder.start(1000);
    const t0 = audioCtx.currentTime + 0.1;
    mixer.start(t0);

    await new Promise((resolve, reject) => {
      timer = setInterval(() => {
        if (aborted()) return reject(cancelled());
        if (recorderFailed) return reject(new RenderError('recorder'));
        const t = Math.max(0, audioCtx.currentTime - t0);
        if (t >= total) return resolve();
        drawFrame(t);
        onProgress({ phase: 'render', fraction: t / total, elapsedSec: t, totalSec: total });
      }, 1000 / FPS);
    });
    clearInterval(timer);

    onProgress({ phase: 'finalize', fraction: 1 });
    // Hold the last frame a beat so the final audio tail is captured.
    await new Promise((r) => setTimeout(r, 250));
    recorder.stop();
    await stopped;
    if (recorderFailed || !chunks.length) throw new RenderError('recorder');
    return { blob: new Blob(chunks, { type: chosen.mime.split(';')[0] }), ext: chosen.ext, mime: chosen.mime, durationSec: total, warnings };
  } catch (err) {
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
      } catch {
        /* ignore */
      }
    }
    throw err instanceof RenderError ? err : new RenderError('recorder', err?.message);
  } finally {
    cleanup();
  }
}
