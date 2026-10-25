// Microphone recording, used for the clone sample and for record-your-own-voice.
const PREFERRED = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];

export class MicError extends Error {
  constructor(code) {
    super(code);
    this.code = code; // 'unsupported' | 'denied' | 'busy'
  }
}

/**
 * @param {{ maxSec?: number, onTick?: (sec: number) => void, onAutoStop?: (blob: Blob) => void }} opts
 * @returns {Promise<{ stop: () => Promise<Blob>, cancel: () => void }>}
 */
export async function startRecording({ maxSec = 30, onTick, onAutoStop } = {}) {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new MicError('unsupported');

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (err) {
    throw new MicError(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'busy');
  }

  const mimeType = PREFERRED.find((m) => MediaRecorder.isTypeSupported?.(m));
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);

  const started = Date.now();
  let timer = 0;
  let finished;
  const done = new Promise((resolve) => {
    finished = resolve;
    recorder.onstop = () => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' }));
    };
  });

  let stopped = false;
  const stop = () => {
    if (!stopped) {
      stopped = true;
      if (recorder.state !== 'inactive') recorder.stop();
    }
    return done;
  };

  recorder.start();
  timer = setInterval(() => {
    const sec = (Date.now() - started) / 1000;
    onTick?.(sec);
    if (sec >= maxSec && !stopped) stop().then((blob) => onAutoStop?.(blob));
  }, 200);

  return {
    stop,
    cancel() {
      chunks.length = 0;
      stopped = true;
      if (recorder.state !== 'inactive') recorder.stop();
      finished?.(null);
    },
  };
}
