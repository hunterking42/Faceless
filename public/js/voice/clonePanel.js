// Consent + sample recording UI for voice cloning. The sample lives in memory
// only: never in localStorage, never uploaded until a scene is generated.
import { startRecording, MicError } from './recorder.js';

const MIN_SEC = 5;
const MAX_SEC = 30;

export function createClonePanel({ els, t, onChange }) {
  let sample = null; // { blob, url, durationSec }
  let recording = null;
  let starting = false; // mic permission/startup in flight: ignore extra clicks

  function clearSample() {
    if (sample) URL.revokeObjectURL(sample.url);
    sample = null;
    els.player.hidden = true;
    els.player.removeAttribute('src');
  }

  function setStatus(text, isError = false) {
    els.status.textContent = text;
    els.status.classList.toggle('error', isError);
  }

  function refresh() {
    els.recordBtn.disabled = !els.consent.checked;
    els.recordBtn.textContent = recording ? t('sampleStop') : sample ? t('sampleRerecord') : t('sampleRecord');
    onChange?.();
  }

  function setSample(blob, durationSec) {
    clearSample();
    if (durationSec < MIN_SEC) {
      setStatus(t('sampleTooShort'), true);
      return;
    }
    sample = { blob, url: URL.createObjectURL(blob), durationSec };
    els.player.src = sample.url;
    els.player.hidden = false;
    setStatus(`${t('sampleReady')} · ${durationSec.toFixed(1)}s`);
  }

  async function begin() {
    setStatus('');
    starting = true;
    try {
      const started = Date.now();
      recording = await startRecording({
        maxSec: MAX_SEC,
        onTick: (sec) => setStatus(`${t('sampleRecording')} ${sec.toFixed(0)}s / ${MAX_SEC}s`),
        onAutoStop: (blob) => finish(blob, started),
      });
      recording.startedAt = started;
    } catch (err) {
      recording = null;
      setStatus(err instanceof MicError ? t(`mic_${err.code}`) : t('mic_busy'), true);
    }
    starting = false;
    refresh();
  }

  function finish(blob, started) {
    if (!recording) return;
    recording = null;
    if (blob) setSample(blob, (Date.now() - started) / 1000);
    refresh();
  }

  els.recordBtn.addEventListener('click', async () => {
    if (!els.consent.checked || starting) return; // never bypass consent
    if (recording) {
      const started = recording.startedAt;
      const blob = await recording.stop();
      finish(blob, started);
    } else {
      await begin();
    }
  });

  // Withdrawing consent discards the sample immediately.
  els.consent.addEventListener('change', () => {
    if (!els.consent.checked) {
      recording?.cancel();
      recording = null;
      clearSample();
      setStatus('');
    }
    refresh();
  });

  refresh();

  return {
    /** The sample blob, only while consent is ticked. */
    getSample: () => (els.consent.checked && sample ? sample.blob : null),
    reset() {
      recording?.cancel();
      recording = null;
      clearSample();
      els.consent.checked = false;
      setStatus('');
      refresh();
    },
    refresh,
  };
}
