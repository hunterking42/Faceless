---
title: Faceless Video Maker Voice Clone
sdk: docker
app_port: 7860
---

# Voice-clone Space

Receives a short voice sample plus narration text and returns cloned speech (XTTS-v2).
Called only by `/api/clone` in the main app.

## Deploy
1. Create a new Space at huggingface.co/new-space, SDK **Docker**, hardware **CPU basic (free)**. Make it **private**.
2. Push the contents of this folder (`README.md`, `Dockerfile`, `requirements.txt`, `app.py`) to the Space repo.
3. In the Vercel project set `HF_SPACE_URL=https://<user>-<space>.hf.space` and `HF_TOKEN=<a read token>`.
4. Turn on the `voiceClone` flag in the app (see `public/js/flags.js`).

## Know before you rely on it
- **Not built or tested by the author of this phase.** Expect to adjust package versions if the build fails.
- **Bengali is not supported by XTTS-v2.** The Space returns 422 for `bn`; the app then offers TTS or recording your own voice. The `voiceCloneBn` flag exists for a future Bengali-capable model (e.g. an F5-TTS finetune) and must stay off until its quality is verified.
- **License:** XTTS-v2 uses the Coqui Public Model License, which is non-commercial. Do not monetize with it (CLAUDE.md §10).
- **Speed:** free CPU inference is slow (roughly real-time or slower). Clone text is capped at 300 characters per scene to stay under the 60 s Vercel limit. The free Space sleeps when idle; the app polls `/health` while it wakes.
- Samples are held in a temp file for one request and deleted. Nothing is logged or stored.
