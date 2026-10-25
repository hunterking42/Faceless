# Roadmap

Phase definitions, rules, and the full architecture live in `CLAUDE.md`. This file tracks concrete progress against that plan.

## Phase 0 — Setup ✅
- [x] Repo structure
- [x] `package.json`, `vercel.json`, `.env.example`, `.gitignore`
- [x] README

## Phase 1 — Script + visuals ✅
- [x] `api/_lib/llm.js` — Gemini → NVIDIA NIM fallback, JSON generation with one retry
- [x] `api/_lib/validate.js` — input validation helpers
- [x] `api/_lib/rateLimit.js` — in-memory rate limiting
- [x] `POST /api/script` — topic + language → scene script
- [x] `GET /api/media` — Pexels proxy (keeps key server-side)
- [x] Topic form UI (topic, language, scene count, format)
- [x] Scene editor UI (edit narration, reorder/add/delete scenes, find & pick clips)
- [x] Draft autosave to `localStorage`
- [x] Dark mode, Bengali/English UI strings, mobile-first layout
- [x] Unit tests for JSON parsing / validation / rate limiting

## Phase 2 — Voice + preview ✅
- [x] `api/tts.js` — Edge TTS primary, Gemini TTS fallback (`api/_lib/edgeTts.js`, `geminiTts.js`, `tts.js`)
- [x] `public/js/voice/index.js` — `getVoice(scene, mode)` interface
- [x] `public/js/voice/tts.js`
- [x] Scene preview player (`public/js/preview/player.js`) — narration + visual + subtitles together, per scene or whole video
- [x] Subtitle timing sync with TTS audio duration (`public/js/render/subtitles.js`)
- [x] Unit tests for subtitle timing, SSML, Edge token/frames, WAV wrapping, provider fallback
- [ ] **Still to verify on a real Vercel deploy:** Edge TTS reachability from Vercel IPs (CLAUDE.md §10), Gemini TTS model name, Bengali voice quality

## Phase 2b — Voice clone ✅ (code complete; Space not yet deployed)
- [x] Hugging Face Space for XTTS-v2 (`hf-space/`) — **not built or run by the author; deploy and fix versions as needed**
- [x] `api/clone.js` proxy (consent enforced server-side, size/mime limits, no upstream detail leaked), cold-start `?wake=1` polling in `voice/clone.js`
- [x] Sample recorder UI + explicit consent checkbox (`voice/clonePanel.js`); withdrawing consent discards the sample
- [x] Record-your-own-voice fallback (`voice/recorder.js`, per-scene Record button, `voiceRecord` flag on by default)
- [x] Voice mode selector (AI voice / cloned / record); recordings survive mode switches
- [x] Unit tests for the clone proxy
- [ ] **Bengali clone is NOT available:** XTTS-v2 has no Bengali. The UI blocks clone for `bn` (flag `voiceCloneBn`, off) and points to AI voice or record-yourself. Revisit with an F5-TTS Bengali finetune and verify quality before enabling.
- [ ] Deploy the Space, set `HF_SPACE_URL` / `HF_TOKEN`, then enable the `voiceClone` flag

## Phase 3 — Render + download ✅ (verified in headless Chromium, not on a real deploy)
- [x] `render/renderer.js` — Canvas + MediaRecorder, AudioContext-clock timing, Ken Burns, cross-fades, fade-out
- [x] `render/timeline.js`, `layout.js`, `transitions.js`, `mediaLoader.js` — pure/testable where possible
- [x] Subtitles drawn on canvas with wrapping (Bengali clusters never split) and Noto Sans Bengali loading
- [x] Progress bar, cancel, 3-minute cap, WebM (MP4 where the browser supports it)
- [x] Render dialog (`exportPanel.js`): quality 720p/1080p, file type, subtitle style, stale-result detection
- [x] Tainted/CORS-blocked clips fall back to the Pexels still and the user is told which scenes
- [ ] **Add font files** (`public/fonts/NotoSansBengali-Regular.woff2`, `-Bold.woff2`); not bundled, see `public/fonts/README.md`
- [ ] **Verify on a real deploy:** Pexels video CDN CORS (if blocked, every clip falls back to a still), MP4 recording on Safari/Firefox, a 1-minute video in under 5 minutes on a phone

## Phase 4 — Polish ✅
- [x] `api/metadata.js` + `_lib/metadata.js` — title/description/tags/hashtags, YouTube limits enforced server-side, no invented facts in the prompt
- [x] Metadata panel with copy buttons; description gets Pexels credits and an AI-disclosure line (`credits.js`)
- [x] Draft status line ("Draft saved" / storage failure / restored)
- [x] Render error states mapped to human-readable, translated messages (EN/BN)
- [x] README finalized

## Phase 5 — Optional (scoped)
- [x] Background music: user uploads a file (stays in the browser), ducking under narration (`ducking.js`)
- [x] Subtitle style presets (classic, bold, box)
- [ ] FFmpeg.wasm (MP4 remux / duration header) — not started
- [ ] Brand kit / themes — not started
- [ ] Bundled royalty-free tracks — not started (licensing)

## Upgrade backlog
See `CLAUDE.md` §15 for the full list (word-highlight subtitles, auto B-roll matching, hook score, trends, dubbing, thumbnail studio, Shorts cutter, YouTube direct upload, etc.) — not started, intentionally deferred until Phases 1–3 work end to end.
