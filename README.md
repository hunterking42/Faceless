# Faceless Video Maker

A free web app that turns a topic into a downloadable YouTube video: AI script → voiceover → stock/AI visuals → subtitles → video file. Supports Bengali and English. Rendering happens entirely in your browser — zero server-side video processing, zero paid services.

**Status: Phases 3–4 (render + download, metadata) and a scoped Phase 5 (music, subtitle styles) are code complete.** See `CLAUDE.md` for the full phase roadmap and architecture rules.

## What works right now

- Enter a topic, pick a language (Bengali or English) and format (Shorts 9:16 or landscape 16:9)
- AI generates a scene-by-scene script (Gemini, falling back to NVIDIA NIM on error/429)
- Edit narration text per scene, reorder/add/delete scenes
- Search Pexels for stock video clips per scene and pick one
- Generate a voiceover per scene (Edge TTS, falling back to Gemini TTS) — Bengali and English
- Preview a single scene or the whole video: narration, clip and synced subtitles play together. Scenes without voice play on an estimated timeline
- Draft autosaves to `localStorage` so a refresh doesn't lose your work. Generated voice is kept in memory only, so it must be regenerated after a reload; editing a scene's narration discards its stale voice

- **Record your own voice** per scene (browser microphone, no server needed)
- **Voice cloning** (English and other XTTS-v2 languages): record a 5–30 s sample after ticking a consent box ("this is my own voice, or I have permission"); the sample stays in memory, is sent only when generating, and is never stored. Needs the Hugging Face Space in `hf-space/` and the `voiceClone` flag. **Bengali cloning is not available** (XTTS-v2 doesn't support it); Bengali videos use AI voice or your own recording. XTTS-v2 is non-commercial licensed.

- **Render & download** in the browser (Canvas + MediaRecorder): 720p/1080p, WebM (or MP4 where supported), Ken Burns zoom, cross-fades, three subtitle styles, 3-minute cap, progress and cancel. Rendering runs in real time, so keep the tab open.
- **Background music** (optional): upload your own file; it stays in your browser and ducks under the narration.
- **Title, description and tags** suggested by AI, with Pexels credits and an AI-disclosure line added to the description. Always review before uploading.

**Known limits:** WebM files from MediaRecorder have no duration header (YouTube accepts them; some players can't seek). If a Pexels clip can't be read by the canvas (CORS), its still image is used and you are told which scenes. Not implemented: FFmpeg.wasm, brand kit, backlog features (`CLAUDE.md` §15).

## Setup

```bash
npm install
cp .env.example .env.local
# fill in .env.local with your free-tier API keys (see below)
npx vercel dev
```

Open the local URL Vercel prints (usually `http://localhost:3000`).

### Required API keys (all free tier)

| Variable | Where to get it |
|---|---|
| `GEMINI_API_KEY` | [Google AI Studio](https://aistudio.google.com/) |
| `NVIDIA_API_KEY` | [build.nvidia.com](https://build.nvidia.com/) — starts with `nvapi-` |
| `NVIDIA_MODEL` | Pick a model ID from the NVIDIA NIM catalog after testing Bengali output quality (catalog changes over time, so this isn't hardcoded) |
| `PEXELS_API_KEY` | [Pexels API](https://www.pexels.com/api/) |
| `GEMINI_TTS_MODEL` | Optional. Overrides the Gemini TTS fallback model (default `gemini-2.5-flash-preview-tts`) |
| `HF_SPACE_URL`, `HF_TOKEN` | Only for voice cloning: your deployed Space URL and a read token (see `hf-space/README.md`). Optional — without them, cloning stays off |

Fonts: download Noto Sans Bengali (Regular and Bold) per `public/fonts/README.md`. Without them, Bengali subtitles use a system font if one exists and may render as empty boxes on devices without one.

## Commands

```bash
npm install
npx vercel dev       # local dev, including /api functions
npx vercel --prod    # manual deploy (normally auto on GitHub push)
npm test             # run unit tests
```

## Project structure

See `CLAUDE.md` §4 for the full target structure. Phase 2 currently includes:

```
api/
  _lib/
    llm.js          # Gemini -> NVIDIA NIM fallback, JSON generation w/ retry
    validate.js      # input validation, length limits, error responses
    rateLimit.js      # simple in-memory rate limiting
    tts.js            # Edge -> Gemini TTS fallback
    edgeTts.js        # Edge TTS websocket client (uses `ws`)
    geminiTts.js      # Gemini TTS + PCM -> WAV
  script.js         # POST — topic+language -> scene script
  media.js          # GET — Pexels proxy (keeps the API key server-side)
  tts.js            # POST — one scene's narration -> audio
  metadata.js       # POST — title/description/tags suggestions
public/
  index.html
  css/
    style.css
    themes.css       # light/dark mode tokens
  fonts/             # Noto Sans Bengali goes here (see fonts/README.md)
  js/
    app.js           # UI state: topic form -> scene editor
    api.js           # fetch wrapper for /api calls
    storage.js        # localStorage draft persistence
    flags.js          # feature flags for not-yet-built phases
    voice/            # getVoice(scene, mode) interface + TTS client
    preview/player.js # scene / full-video preview player
    render/           # renderer, timeline, layout, transitions, audio mixer, ducking, subtitles
    exportPanel.js    # render dialog
    metadataPanel.js  # title/description/tags
tests/
  llm.test.js
  validate.test.js
  rateLimit.test.js
  subtitles.test.js
  tts.test.js
  clone.test.js
  render.test.js
  metadata.test.js
```

## Deploying

1. Push this repo to GitHub.
2. Import it in [Vercel](https://vercel.com) (Hobby plan — free).
3. Add the environment variables from `.env.example` in the Vercel dashboard (Project Settings → Environment Variables).
4. Vercel auto-deploys on every push to the default branch.

## Hard constraints (don't break these)

- Zero cost — free tiers only, no credit card anywhere
- All rendering happens in the browser, never on the server
- API keys never reach client code — always proxy through `api/`
- No auth, database, analytics, or cloud save

Full rules live in `CLAUDE.md`.

## License

Not yet specified by the project owner.
