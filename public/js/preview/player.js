// Scene preview player: plays narration, visual and subtitles together.
// Scenes without generated voice play silently on an estimated timeline so the
// layout and pacing can be checked before spending TTS calls.
import { buildCues, cueAt, estimateDuration } from '../render/subtitles.js';

export function createPlayer({ els, getProject, t }) {
  const audio = new Audio();
  let scenes = [];
  let language = 'en';
  let index = 0;
  let single = false;
  let playing = false;
  let elapsed = 0;
  let duration = 0;
  let cues = [];
  let hasAudio = false;
  let lastFrame = 0;
  let raf = 0;
  let durations = [];

  const hasVoice = (s) => Boolean(s.audio?.blobUrl) && s.audio.durationSec > 0;
  const sceneDuration = (s) => (hasVoice(s) ? s.audio.durationSec : estimateDuration(s.text, language));

  function renderMedia(scene) {
    els.media.innerHTML = '';
    const m = scene.media;
    if (m?.type === 'video') {
      const v = document.createElement('video');
      v.src = m.url;
      v.muted = true;
      v.loop = true;
      v.autoplay = true;
      v.playsInline = true;
      els.media.appendChild(v);
      if (playing) v.play().catch(() => {});
    } else if (m) {
      const img = document.createElement('img');
      img.src = m.url;
      img.alt = '';
      els.media.appendChild(img);
    } else {
      const ph = document.createElement('div');
      ph.className = 'media-placeholder';
      ph.textContent = scene.keyword || t('noMediaYet');
      els.media.appendChild(ph);
    }
  }

  function setPlaying(value) {
    playing = value;
    els.playBtn.textContent = playing ? '⏸' : '▶';
    els.playBtn.setAttribute('aria-label', playing ? t('pause') : t('play'));
    els.media.querySelector('video')?.[playing ? 'play' : 'pause']?.();
    if (hasAudio) {
      if (playing) audio.play().catch(() => setPlaying(false));
      else audio.pause();
    }
    cancelAnimationFrame(raf);
    if (playing) {
      lastFrame = performance.now();
      raf = requestAnimationFrame(tick);
    }
  }

  function paint() {
    const cue = cueAt(cues, elapsed);
    els.subtitle.textContent = cue ? cue.text : '';
    const before = single ? 0 : durations.slice(0, index).reduce((a, b) => a + b, 0);
    const total = single ? duration : durations.reduce((a, b) => a + b, 0);
    els.bar.style.width = `${Math.min(100, ((before + elapsed) / (total || 1)) * 100)}%`;
  }

  function tick(now) {
    if (!playing) return;
    const dt = (now - lastFrame) / 1000;
    lastFrame = now;
    if (hasAudio) elapsed = audio.currentTime;
    else elapsed += dt;
    paint();
    if (!hasAudio && elapsed >= duration) return advance();
    raf = requestAnimationFrame(tick);
  }

  function advance() {
    if (single || index >= scenes.length - 1) {
      showScene(single ? index : 0, false);
    } else {
      showScene(index + 1, true);
    }
  }

  function showScene(i, autoplay) {
    cancelAnimationFrame(raf);
    audio.pause();
    index = i;
    const scene = scenes[i];
    elapsed = 0;
    duration = sceneDuration(scene);
    cues = buildCues(scene.text, duration);
    hasAudio = hasVoice(scene);
    if (hasAudio) {
      audio.src = scene.audio.blobUrl;
      audio.currentTime = 0;
    } else {
      audio.removeAttribute('src');
    }
    renderMedia(scene);
    els.label.textContent = `${t('scene')} ${i + 1} / ${scenes.length}`;
    els.prevBtn.disabled = single || i === 0;
    els.nextBtn.disabled = single || i === scenes.length - 1;
    const missing = !hasAudio;
    els.note.hidden = !missing;
    els.note.textContent = missing ? t('previewNoVoice') : '';
    paint();
    setPlaying(autoplay);
  }

  audio.addEventListener('ended', () => playing && advance());

  els.playBtn.addEventListener('click', () => {
    // Replay from the top if the previous run finished.
    if (!playing && elapsed >= duration - 0.05) showScene(index, true);
    else setPlaying(!playing);
  });
  els.prevBtn.addEventListener('click', () => showScene(index - 1, playing));
  els.nextBtn.addEventListener('click', () => showScene(index + 1, playing));
  els.closeBtn.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('close', () => {
    setPlaying(false);
    audio.removeAttribute('src');
    els.media.innerHTML = '';
  });

  return {
    /** @param {number} start scene index @param {{ single?: boolean }} opts */
    open(start = 0, opts = {}) {
      const project = getProject();
      scenes = project.scenes.filter((s) => s.text.trim());
      if (!scenes.length) return;
      const target = project.scenes[start];
      language = project.language;
      single = Boolean(opts.single);
      if (single) scenes = [target];
      durations = scenes.map(sceneDuration);
      els.stage.classList.toggle('landscape', project.format === '16:9');
      els.stage.classList.toggle('portrait', project.format !== '16:9');
      els.subtitle.lang = language;
      if (!els.dialog.open) els.dialog.showModal();
      showScene(single ? 0 : Math.max(0, scenes.indexOf(target)), true);
    },
  };
}
