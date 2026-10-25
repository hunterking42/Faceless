// Render & download dialog: settings -> progress -> result (+ metadata).
import { renderVideo, canRender, RenderError } from './render/renderer.js';
import { buildTimeline, MAX_VIDEO_SEC } from './render/timeline.js';
import { safeFileName, pickMime } from './render/layout.js';
import { isEnabled } from './flags.js';
import { createMetadataPanel } from './metadataPanel.js';

const MAX_MUSIC_BYTES = 25_000_000;

/** What a render depends on; if it changes, a finished render is stale. */
function signature(project) {
  return JSON.stringify([project.format, project.title, project.scenes.map((s) => [s.text, s.media?.url || null, s.audio?.blobUrl || null])]);
}

export function createExportPanel({ els, getProject, t }) {
  let controller = null;
  let resultUrl = null;
  let resultSig = '';
  let musicBlob = null;
  let busy = false;
  const meta = createMetadataPanel({ els: els.meta, getProject, t, getEnabled: () => isEnabled('metadata') });

  const show = (name) => {
    els.setup.hidden = name !== 'setup';
    els.progress.hidden = name !== 'progress';
    els.result.hidden = name !== 'result';
  };

  function setProgress(fraction, text) {
    const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
    els.bar.style.width = `${pct}%`;
    els.barWrap.setAttribute('aria-valuenow', String(pct));
    els.status.textContent = text;
  }

  function releaseResult() {
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = null;
    els.video.removeAttribute('src');
    els.video.load();
  }

  function describeSetup() {
    const project = getProject();
    const timeline = buildTimeline(project.scenes, project.language);
    const issues = [];
    if (!canRender()) issues.push(t('renderUnsupported'));
    if (!timeline.items.length) issues.push(t('renderEmpty'));
    if (timeline.overCap) issues.push(`${t('renderTooLong')} (${Math.round(timeline.total)}s / ${MAX_VIDEO_SEC}s)`);

    const noVoice = timeline.items.filter((i) => !i.hasVoice).length;
    const noClip = timeline.items.filter((i) => !i.scene.media).length;
    const notes = [];
    if (noVoice) notes.push(`${noVoice} ${t('renderNoVoiceCount')}`);
    if (noClip) notes.push(`${noClip} ${t('renderNoClipCount')}`);

    els.summary.textContent = `${timeline.items.length} ${t('renderScenesWord')} · ~${Math.round(timeline.total)}s${notes.length ? ` · ${notes.join(' · ')}` : ''}`;
    els.issues.hidden = issues.length === 0;
    els.issues.textContent = issues.join(' ');
    els.startBtn.disabled = issues.length > 0;

    const mp4Ok = typeof MediaRecorder !== 'undefined' && Boolean(pickMime((m) => MediaRecorder.isTypeSupported(m), true)?.ext === 'mp4');
    const mp4Opt = els.container.querySelector('option[value="mp4"]');
    mp4Opt.disabled = !mp4Ok;
    if (!mp4Ok && els.container.value === 'mp4') els.container.value = 'webm';

    els.musicBox.hidden = !isEnabled('musicUpload');
  }

  function errorMessage(err) {
    const code = err instanceof RenderError ? err.code : 'recorder';
    return t(`render_${code}`) || t('render_recorder');
  }

  async function start() {
    if (busy) return;
    busy = true;
    controller = new AbortController();
    releaseResult();
    els.issues.hidden = true;
    show('progress');
    setProgress(0, t('renderPreparing'));
    try {
      const result = await renderVideo(getProject(), {
        quality: els.quality.value,
        preferMp4: els.container.value === 'mp4',
        subtitleStyle: els.subStyle.value,
        musicBlob: isEnabled('musicUpload') ? musicBlob : null,
        duck: els.duck.checked,
        signal: controller.signal,
        onProgress: ({ phase, fraction, elapsedSec, totalSec }) => {
          if (phase === 'prepare') setProgress(fraction * 0.05, t('renderPreparing'));
          else if (phase === 'render') setProgress(0.05 + fraction * 0.9, `${t('renderRendering')} ${Math.floor(elapsedSec)}s / ${Math.ceil(totalSec)}s`);
          else setProgress(0.97, t('renderFinishing'));
        },
      });
      resultUrl = URL.createObjectURL(result.blob);
      resultSig = signature(getProject());
      els.video.src = resultUrl;
      els.download.href = resultUrl;
      els.download.download = safeFileName(getProject().title, result.ext);
      showWarnings(result.warnings);
      meta.reset();
      show('result');
    } catch (err) {
      show('setup');
      describeSetup();
      if (!(err instanceof RenderError && err.code === 'cancelled')) {
        els.issues.hidden = false;
        els.issues.textContent = errorMessage(err);
      }
    } finally {
      busy = false;
      controller = null;
    }
  }

  function showWarnings(warnings) {
    els.warnings.hidden = warnings.length === 0;
    els.warnings.replaceChildren();
    if (!warnings.length) return;
    const p = document.createElement('p');
    p.textContent = `${t('renderWarnClips')} ${warnings.map((w) => w.sceneIndex + 1).join(', ')}`;
    els.warnings.appendChild(p);
  }

  els.startBtn.addEventListener('click', start);
  els.cancelBtn.addEventListener('click', () => controller?.abort());
  els.againBtn.addEventListener('click', () => {
    releaseResult();
    show('setup');
    describeSetup();
  });
  els.closeBtn.addEventListener('click', () => els.dialog.close());
  els.dialog.addEventListener('close', () => controller?.abort());
  els.dialog.addEventListener('cancel', () => controller?.abort());

  els.musicFile.addEventListener('change', async () => {
    const file = els.musicFile.files?.[0];
    musicBlob = null;
    els.issues.hidden = true;
    if (!file) return;
    if (file.size > MAX_MUSIC_BYTES) {
      els.musicFile.value = '';
      els.issues.hidden = false;
      els.issues.textContent = t('renderMusicTooBig');
      return;
    }
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      const probe = new Ctx();
      try {
        await probe.decodeAudioData(await file.arrayBuffer());
      } finally {
        probe.close?.();
      }
      musicBlob = file;
    } catch {
      els.musicFile.value = '';
      els.issues.hidden = false;
      els.issues.textContent = t('renderMusicBad');
    }
  });

  return {
    open() {
      if (!els.dialog.open) els.dialog.showModal();
      if (resultUrl && !busy && resultSig === signature(getProject())) {
        show('result');
        return;
      }
      if (!busy) releaseResult();
      show('setup');
      describeSetup();
    },
    refreshLanguage() {
      if (!els.dialog.open) return;
      if (!els.setup.hidden) describeSetup();
    },
  };
}
