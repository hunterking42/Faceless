"""Voice-clone service for the Faceless Video Maker (Phase 2b).

Runs on a free Hugging Face Space (Docker SDK). Vercel's /api/clone proxies here.
Voice samples are written to a temp file for the duration of one request and
deleted; nothing is stored or logged.
"""
import os
import subprocess
import tempfile
import threading

from fastapi import FastAPI, File, Form, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from starlette.background import BackgroundTask

os.environ.setdefault("COQUI_TOS_AGREED", "1")  # XTTS-v2 license: CPML, non-commercial

# XTTS-v2 language support. Bengali ("bn") is NOT supported by XTTS-v2, so it
# returns 422 and the app falls back to TTS / record-your-own-voice.
SUPPORTED = {"en", "es", "fr", "de", "it", "pt", "pl", "tr", "ru", "nl", "cs", "ar", "zh-cn", "ja", "hu", "ko", "hi"}

app = FastAPI()
_model = None
_busy = threading.Lock()  # one inference at a time on the free CPU tier


def get_model():
    global _model
    if _model is None:
        from TTS.api import TTS

        _model = TTS("tts_models/multilingual/multi-dataset/xtts_v2")
    return _model


def _cleanup(*paths):
    for p in paths:
        try:
            os.remove(p)
        except OSError:
            pass


@app.get("/health")
def health():
    get_model()  # first call loads the model; the proxy polls until this returns
    return {"ok": True}


@app.post("/clone")
def clone(text: str = Form(...), language: str = Form(...), sample: UploadFile = File(...)):
    if language not in SUPPORTED:
        return JSONResponse({"error": "unsupported language"}, status_code=422)
    if not _busy.acquire(blocking=False):
        return JSONResponse({"error": "busy"}, status_code=503)

    raw = ref = out = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".bin") as f:
            f.write(sample.file.read())
            raw = f.name
        ref = raw + ".wav"
        # Browsers record webm/opus or mp4; XTTS wants a clean mono wav reference.
        subprocess.run(
            ["ffmpeg", "-y", "-loglevel", "error", "-i", raw, "-ac", "1", "-ar", "22050", "-t", "30", ref],
            check=True,
            timeout=30,
        )
        out = raw + ".out.wav"
        get_model().tts_to_file(text=text[:300], speaker_wav=ref, language=language, file_path=out)
    except Exception:
        _cleanup(*(p for p in (raw, ref, out) if p))
        _busy.release()
        return JSONResponse({"error": "failed"}, status_code=500)

    _cleanup(raw, ref)

    def done():
        _cleanup(out)
        _busy.release()

    return FileResponse(out, media_type="audio/wav", background=BackgroundTask(done))
