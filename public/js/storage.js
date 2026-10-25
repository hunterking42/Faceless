// localStorage-backed draft persistence. Never store secrets here
// (CLAUDE.md §13) — only the project JSON the user is editing.

const DRAFT_KEY = 'fvm.draft';

// Blob URLs don't survive a reload, so generated voice is never persisted;
// the user regenerates it (one cheap call per scene).
function withoutVoice(project) {
  return {
    ...project,
    scenes: project.scenes.map((s) => ({ ...s, audio: { mode: s.audio?.mode || 'tts', blobUrl: null, durationSec: 0 } })),
  };
}

export function saveDraft(project) {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(withoutVoice(project)));
    return true;
  } catch {
    return false; // storage full or unavailable (private mode) — fail silently
  }
}

export function loadDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
