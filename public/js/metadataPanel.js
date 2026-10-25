// Title / description / tags suggestions shown under the finished video.
import { generateMetadata, ApiError } from './api.js';
import { buildCredits, composeDescription } from './credits.js';

export function createMetadataPanel({ els, getProject, t, getEnabled }) {
  let busy = false;

  function reset() {
    els.panel.hidden = !getEnabled();
    els.fields.hidden = true;
    els.status.textContent = '';
    els.status.classList.remove('error');
    els.generateBtn.disabled = false;
  }

  async function generate() {
    if (busy) return;
    const project = getProject();
    const scenes = project.scenes.map((s) => s.text.trim()).filter(Boolean);
    busy = true;
    els.generateBtn.disabled = true;
    els.status.classList.remove('error');
    els.status.textContent = t('metaWorking');
    try {
      const meta = await generateMetadata({ title: project.title, language: project.language, scenes });
      els.title.value = meta.title;
      els.description.value = composeDescription({
        description: meta.description,
        hashtags: meta.hashtags,
        credits: buildCredits(project.scenes),
      });
      els.tags.value = meta.tags.join(', ');
      els.fields.hidden = false;
      els.status.textContent = t('metaReady');
    } catch (err) {
      els.status.classList.add('error');
      els.status.textContent = err instanceof ApiError && err.status < 500 ? err.message : t('metaFailed');
    } finally {
      busy = false;
      els.generateBtn.disabled = false;
    }
  }

  els.generateBtn.addEventListener('click', generate);

  els.panel.addEventListener('click', async (e) => {
    const btn = e.target.closest('.meta-copy');
    if (!btn) return;
    const field = document.getElementById(btn.dataset.target);
    const original = btn.textContent;
    try {
      await navigator.clipboard.writeText(field.value);
      btn.textContent = t('copied');
    } catch {
      field.select();
      btn.textContent = t('copyManual');
    }
    setTimeout(() => (btn.textContent = original), 1500);
  });

  return { reset };
}
