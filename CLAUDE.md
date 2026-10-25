# CLAUDE.md

Guidance for Claude Code when working in this repository. Read this fully before making changes. The roadmap lives in `PLAN.md`.

## 1. Project
**Faceless Video Maker**: a free web app. The user enters a topic and gets a downloadable video for YouTube: AI script -> voiceover -> stock/AI visuals -> subtitles -> video file. Supports Bengali and English. Rendering happens in the user's browser.

**Current phase:** Phases 3 (render + download), 4 (metadata, polish) and a scoped Phase 5 (user-supplied music with ducking, subtitle styles) are code complete and verified in headless Chromium. Still to do on a real deploy: verify the Phase 2 items (Edge TTS from Vercel, Gemini TTS model name), add the Noto Sans Bengali font files, check Pexels video CORS, deploy the Hugging Face Space. Not started: FFmpeg.wasm, brand kit, and the upgrade backlog (§15). Update this line whenever a phase is completed.

## 2. Hard constraints
- **Zero cost.** Free tiers only (Vercel Hobby, Gemini, NVIDIA NIM, Pexels, Edge TTS, Hugging Face Spaces). Never add a paid service or anything needing a credit card.
- **Browser-side rendering.** No server-side video processing.
- **Secrets stay on the server.** All third-party calls go through `/api` functions. Never hardcode keys, never commit `.env*`, never expose keys to client code.
- **Short serverless calls.** Vercel Hobby timeouts are small. One TTS call per scene, never per video. Set `maxDuration` where needed.
- **No unrequested infrastructure.** No auth, database, analytics, or cloud save. Login and cloud save are out of scope.
- Vercel Hobby is for non-commercial use. If the project becomes a revenue-earning service, hosting must be revisited.

## 3. Stack
| Area | Choice |
|---|---|
| Frontend | Static HTML/CSS/vanilla ES modules in `public/` (no build step unless a phase adds Vite) |
| Backend | Vercel Serverless Functions, Node.js ESM, in `api/` |
| Hosting | GitHub -> Vercel auto-deploy |
| Text AI | Gemini (primary), NVIDIA NIM (fallback, OpenAI-compatible at `https://integrate.api.nvidia.com/v1`) |
| AI images | NVIDIA image models via `/api/ai-image` |
| Stock media | Pexels API via `/api/media` |
| Voice (TTS) | Edge TTS via `/api/tts`, fallback Gemini TTS |
| Voice (clone) | Open-source model (XTTS-v2 / F5-TTS) on a free Hugging Face Space, proxied by `/api/clone` |
| Render | Canvas + MediaRecorder (MVP). FFmpeg.wasm later, optional |

## 4. Structure
```
faceless-video-maker/
├── CLAUDE.md
├── PLAN.md
├── README.md
├── vercel.json
├── package.json
├── .env.example
├── .gitignore
├── api/
│   ├── _lib/
│   │   ├── llm.js            # Gemini -> NVIDIA fallback
│   │   ├── validate.js       # input validation, length limits
│   │   ├── rateLimit.js      # simple rate limiting
│   │   ├── tts.js            # Edge -> Gemini TTS fallback orchestration
│   │   ├── edgeTts.js        # Edge TTS websocket client
│   │   └── geminiTts.js      # Gemini TTS + PCM->WAV
│   ├── script.js             # script -> scenes JSON
│   ├── media.js              # Pexels proxy
│   ├── ai-image.js           # NVIDIA AI images
│   ├── tts.js                # Edge TTS / Gemini TTS
│   ├── clone.js              # Hugging Face Space proxy (voice clone)
│   ├── metadata.js           # YouTube title/description/tags (Phase 4)
│   ├── analyze.js            # hook score, fact-check notes (6, 9)
│   ├── translate.js          # multi-language dubbing (10)
│   ├── ingest.js             # article/transcript summary (8)
│   ├── trends.js             # keyword/topic suggestions (7)
│   └── youtube/              # optional, feature 14
│       ├── auth.js
│       └── upload.js
├── public/
│   ├── index.html
│   ├── css/
│   │   ├── style.css
│   │   └── themes.css        # dark mode and brand kit
│   ├── fonts/                # Noto Sans Bengali etc.
│   ├── music/                # royalty-free background music
│   └── js/
│       ├── app.js            # UI and state
│       ├── api.js            # /api call wrapper
│       ├── storage.js        # localStorage drafts, brand kit
│       ├── flags.js          # feature flags
│       ├── preview/
│       │   └── player.js     # scene preview player
│       ├── voice/
│       │   ├── index.js      # getVoice(scene, mode)
│       │   ├── tts.js
│       │   ├── clone.js
│       │   ├── clonePanel.js # consent + sample recording UI
│       │   └── recorder.js   # record own voice
│       ├── exportPanel.js    # render dialog: settings, progress, result
│       ├── metadataPanel.js  # title/description/tags suggestions
│       ├── credits.js        # Pexels credit + AI disclosure lines
│       ├── render/
│       │   ├── renderer.js   # Canvas + MediaRecorder
│       │   ├── subtitles.js  # subtitle timing and style
│       │   ├── transitions.js
│       │   ├── timeline.js, layout.js, mediaLoader.js, subtitleStyle.js, ducking.js
│       │   └── audioMixer.js # narration + optional music with ducking
│       └── features/
│           ├── wordHighlight.js   # 1
│           ├── brollMatcher.js    # 2
│           ├── smartCuts.js       # 3
│           ├── brandKit.js        # 5
│           ├── hookScore.js       # 6
│           ├── trends.js          # 7
│           ├── ingest.js          # 8
│           ├── factCheck.js       # 9
│           ├── dubbing.js         # 10
│           ├── dialogue.js        # 11
│           ├── thumbnail.js       # 12
│           ├── shortsCutter.js    # 13
│           └── youtubeUpload.js   # 14
├── hf-space/                 # voice-clone Space (Docker, XTTS-v2), deployed separately on Hugging Face
└── tests/                    # basic unit tests (JSON parsing, subtitle timing)
```
Create files only when their phase starts. Do not scaffold empty feature files in advance.

## 5. Environment variables
```
GEMINI_API_KEY=
NVIDIA_API_KEY=      # starts with nvapi-
NVIDIA_MODEL=        # chosen after testing Bengali quality
PEXELS_API_KEY=
HF_SPACE_URL=
HF_TOKEN=
```
Local: `.env.local`. Production: Vercel dashboard. Keep `.env.example` in sync when adding variables.

## 6. Commands
```
npm install
npx vercel dev       # local dev including /api functions
npx vercel --prod    # manual deploy (normally auto on GitHub push)
npm test             # once tests/ exists
```

## 7. Core data model
A video project is one JSON object used by every module:
```json
{
  "topic": "5 fun space facts",
  "language": "bn",
  "format": "9:16",
  "title": "...",
  "scenes": [
    {
      "id": "s1",
      "text": "narration text in the video language",
      "keyword": "english pexels search keyword",
      "media": { "type": "video|image", "url": "...", "source": "pexels|ai" },
      "audio": { "mode": "tts|clone|record", "blobUrl": "...", "durationSec": 0 }
    }
  ]
}
```
Gemini/NVIDIA script output must be strict JSON matching `{ title, scenes: [{ text, keyword }] }`. Strip code fences, parse defensively, and retry once on invalid JSON.

## 8. API conventions
Every function in `api/`:
- Validates HTTP method, validates and length-limits input (for example topic max 200 chars).
- Returns JSON `{ error: "message" }` with a correct status code on failure.
- Never forwards upstream error bodies or leaks keys.
- Applies basic rate limiting.

Endpoints: `POST /api/script`, `GET /api/media`, `POST /api/ai-image`, `POST /api/tts`, `POST /api/clone`, `POST /api/metadata`, plus feature endpoints listed in the structure.

## 9. LLM provider rules
- All text generation goes through `api/_lib/llm.js`: try Gemini, on error or 429 fall back to NVIDIA NIM. Endpoints never call a provider directly.
- NVIDIA free tier is about 40 requests/min shared across the whole key and intended for prototyping, not production. Keep calls minimal, cache, back off on 429, never loop calls.
- Read the model from `NVIDIA_MODEL`. Do not hardcode model IDs; the free catalog changes. Verify Bengali output quality before choosing.
- Pexels `keyword` is always English, even when narration is Bengali.

## 10. Voice rules
- One interface: `getVoice(scene, mode)` returns an audio Blob. Modes: `tts`, `clone`, `record`. The renderer must not know which mode produced the audio.
- GPU models cannot run on Vercel. Clone inference lives in a separate Hugging Face Space; `/api/clone` only proxies. Handle cold starts (loading state, long client timeout, retry).
- Voice samples are never stored server-side or logged.
- Cloning requires an explicit consent checkbox ("this is my own voice or I have permission"). Never ship a flow that bypasses it.
- Bengali clone quality is unverified. Test before promising it in the UI; fall back to TTS or `record`.
- Edge TTS is not an official public API and may be unstable. Test on Vercel early in Phase 2; switch to Gemini TTS if unreliable.
- Check the clone model license before any monetized use.

## 11. Rendering rules
- Rendering is real time (a 60 s video takes ~60 s) and timed by the AudioContext clock. The tab must stay visible.
- A clip is only drawn if a canvas probe (`getImageData`) succeeds; otherwise the renderer falls back to the Pexels still, then a placeholder, and tells the user. Never draw tainted media.
- Music is user-supplied and stays in the browser; we do not bundle tracks.
- MediaRecorder WebM has no duration header (players may not seek). Accepted for the MVP; an FFmpeg.wasm remux is the Phase 5 follow-up.
- Offscreen canvas at 1080x1920 (Shorts) or 1920x1080, with a 720p option.
- Scenes drawn in order with a Ken Burns effect and subtitles. Audio combined via `AudioContext` and `MediaRecorder` on `canvas.captureStream()`.
- Output WebM (YouTube accepts it); MP4 where the browser supports it.
- Cap video length at 3 minutes. Show a progress bar and handle cancel.
- Subtitles need a Bengali-capable font (Noto Sans Bengali). Verify glyphs render correctly on canvas.
- Do not enable COOP/COEP headers unless multi-thread FFmpeg.wasm is actually used; they can block cross-origin Pexels media.

## 12. Product rules
- The user must be able to edit the script and swap clips before rendering. This is intentional (avoids YouTube "repetitious content" problems). Never remove it.
- Show Pexels attribution where appropriate.
- Every async step has loading, success, and error states. Errors are human-readable, not raw stack traces.
- Mobile-first, responsive. Dark mode supported.
- UI text must work in Bengali and English.

## 13. Code conventions
- Modern JS, ES modules, no TypeScript unless asked. No UI framework in the MVP.
- Small files, one responsibility each.
- Cache Pexels results (memory or localStorage) to save quota.
- Never store secrets in localStorage.
- Prefer clear names over comments; comment only the non-obvious why.
- Small, reviewable commits with clear messages.
- Before adding a dependency, confirm it is free and works on Vercel serverless.

## 14. Phases
0. Setup: repo, Vercel, API keys, `vercel.json`
1. Script + visuals: `/api/script`, `/api/media`, topic form, scene editor
2. Voice + preview: `/api/tts`, scene preview player, subtitle sync
2b. Voice clone: Hugging Face Space, `/api/clone`, sample recorder, consent, record fallback
3. Render + download: Canvas + MediaRecorder, progress, download
4. Polish: metadata generator, draft save, responsive UI, error handling, README
5. Optional: FFmpeg.wasm, background music, themes

Finish and test one phase before starting the next. Update "Current phase" above.

## 15. Upgrade backlog (post-MVP)
Start only after Phases 1-3 work end to end. Priority: 1, 4, 12, 6 first (browser-only, high impact).

**Video quality:** 1 word-by-word highlight subtitles, 2 auto B-roll matching, 3 smart transitions and zoom, 4 audio ducking and music mixer, 5 brand kit
**Content intelligence:** 6 hook and retention score, 7 trend and niche suggestions (free sources only, verify they work), 8 video from article/PDF/transcript, 9 fact-check notes (advisory only, never claim accuracy)
**Language and voice:** 10 multi-language dubbing, 11 two-voice dialogue mode (clone only with consent)
**YouTube growth:** 12 thumbnail studio, 13 Shorts auto-cutter, 14 direct upload and scheduling (Google OAuth, verification and quota limits; optional, behind a flag)

Rules for these:
- One module per feature under `public/js/features/`, toggled through `flags.js`, so unfinished features never break the MVP.
- Anything needing an LLM goes through `api/_lib/llm.js` and respects NVIDIA limits.
- Heavy work stays browser-side with length caps.

## 16. Definition of done (per phase)
- Works in `vercel dev` and on a Vercel preview deploy
- Works on mobile and desktop in Bengali and English
- Errors handled, no keys exposed, inputs validated
- `.env.example` and README updated if setup changed
- A 1-minute video renders in under about 5 minutes

## 17. Don'ts
- No paid services, auth, databases, or analytics unless asked
- No keys in client code or the repo
- No removing the script/clip editing step
- No cloning flow without consent
- No hardcoded NVIDIA model IDs
- No scaffolding future-phase files early
