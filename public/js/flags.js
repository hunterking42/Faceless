// Feature flags. Phase 1 features are on; later-phase features default
// off so the MVP never breaks when a feature module is incomplete
// (CLAUDE.md §15).
const DEFAULT_FLAGS = {
  // Phase 1
  sceneEditor: true,
  // Phase 2
  voicePreview: true,
  // Phase 2b+
  voiceRecord: true, // record-your-own-voice needs no server
  voiceClone: false, // needs a deployed Hugging Face Space (hf-space/)
  voiceCloneBn: false, // keep off until Bengali clone quality is verified
  render: true, // Phase 3
  metadata: true, // Phase 4
  musicUpload: true, // Phase 5: user-supplied background music
  // Upgrade backlog (off by default)
  wordHighlight: false,
  brollMatcher: false,
  smartCuts: false,
  brandKit: false,
  hookScore: false,
  trends: false,
  ingest: false,
  factCheck: false,
  dubbing: false,
  dialogue: false,
  thumbnail: false,
  shortsCutter: false,
  youtubeUpload: false,
};

const STORAGE_KEY = 'fvm.flags';

function loadOverrides() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const overrides = loadOverrides();

export const flags = { ...DEFAULT_FLAGS, ...overrides };

export function isEnabled(name) {
  return Boolean(flags[name]);
}
