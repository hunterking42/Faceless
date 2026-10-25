// UI and state: topic form -> script generation -> scene editor -> voice + preview.
import { generateScript, searchMedia, ApiError } from './api.js';
import { saveDraft, loadDraft, clearDraft } from './storage.js';
import { isEnabled } from './flags.js';
import { getVoice } from './voice/index.js';
import { measureDuration } from './voice/tts.js';
import { createPlayer } from './preview/player.js';
import { createClonePanel } from './voice/clonePanel.js';
import { startRecording, MicError } from './voice/recorder.js';
import { createExportPanel } from './exportPanel.js';

const STRINGS = {
  en: {
    appName: 'Faceless Video Maker',
    topicHeading: "What's your video about?",
    topicSubheading: "Enter a topic. We'll write a script, find visuals, and build a downloadable video — free.",
    topicLabel: 'Topic',
    languageLabel: 'Narration language',
    sceneCountLabel: 'Number of scenes',
    formatLabel: 'Format',
    generateBtn: 'Generate script',
    loadingScript: 'Writing your script…',
    editorSubheading: 'Edit the script and swap clips before rendering.',
    startOverBtn: 'Start over',
    continueBtn: 'Render & download',
    draftSaved: 'Draft saved',
    draftSaveFailed: 'Could not save the draft in this browser (storage full or blocked).',
    renderTitle: 'Render video',
    renderQualityLabel: 'Quality',
    renderContainerLabel: 'File type',
    renderSubStyleLabel: 'Subtitle style',
    subStyleClassic: 'Classic',
    subStyleBold: 'Bold yellow',
    subStyleBox: 'On a dark box',
    renderMusicLabel: 'Background music (optional)',
    renderDuckLabel: 'Lower the music while the narrator speaks',
    renderMusicHelp: 'Use music you have the right to use. The file stays in your browser.',
    renderMusicTooBig: 'That music file is too large (25 MB max).',
    renderMusicBad: 'That file could not be read as audio. Try an MP3 or WAV.',
    renderStartBtn: 'Start rendering',
    renderKeepOpen: 'Keep this tab open and visible. Rendering runs in real time.',
    renderCancelBtn: 'Cancel',
    renderDownloadBtn: 'Download video',
    renderAgainBtn: 'Render again',
    renderAiNote: 'YouTube may ask you to mark realistic AI-generated voice or visuals as "altered or synthetic content" when you upload.',
    renderScenesWord: 'scenes',
    renderNoVoiceCount: 'without voice (silent)',
    renderNoClipCount: 'without a clip',
    renderUnsupported: 'This browser cannot render video. Use a recent Chrome, Edge or Firefox on a computer.',
    renderEmpty: 'Add some narration first.',
    renderTooLong: 'The video is longer than the 3-minute limit. Remove or shorten scenes.',
    renderPreparing: 'Loading clips…',
    renderRendering: 'Rendering',
    renderFinishing: 'Finishing the file…',
    renderWarnClips: 'These scenes could not use the chosen video clip, so a still image or plain background was used:',
    render_recorder: 'Rendering failed. Try 720p, or reload and try again.',
    render_unsupported: 'This browser cannot record video in a supported format.',
    render_empty: 'Add some narration first.',
    render_too_long: 'The video is longer than the 3-minute limit.',
    metaHeading: 'Title, description & tags',
    metaGenerateBtn: 'Suggest with AI',
    metaTitleLabel: 'Title',
    metaDescriptionLabel: 'Description',
    metaTagsLabel: 'Tags (comma separated)',
    metaWorking: 'Writing suggestions…',
    metaReady: 'Review and edit before you upload — the AI can get things wrong.',
    metaFailed: 'Could not generate suggestions. Please try again.',
    copyBtn: 'Copy',
    copied: 'Copied',
    copyManual: 'Press Ctrl+C',
    scene: 'Scene',
    generateVoiceBtn: 'Generate voice',
    regenerateVoiceBtn: 'Regenerate voice',
    previewSceneBtn: '▶ Preview scene',
    generateAllVoicesBtn: 'Generate all voices',
    previewVideoBtn: '▶ Preview video',
    voiceGenerating: 'Generating voice…',
    voiceReady: 'Voice ready',
    voiceFailed: 'Voice generation failed. Please try again.',
    voiceNeedsText: 'Write some narration first.',
    voiceProgress: 'Generating voices',
    voiceAllDone: 'All voices ready.',
    previewNoVoice: 'No voice for this scene yet — timing is estimated.',
    play: 'Play',
    pause: 'Pause',
    voiceModeLabel: 'Voice',
    voiceModeTts: 'AI voice',
    voiceModeClone: 'My cloned voice',
    voiceModeRecord: 'Record myself',
    cloneHelp: 'Record a short sample of your voice. It is used only to generate this video and is never saved.',
    clonePrompt: 'Read aloud: "Hi, this is my voice. I\'m recording a short sample so my videos can sound like me, clearly and naturally."',
    cloneConsent: 'This is my own voice, or I have permission to clone it.',
    sampleRecord: 'Record sample',
    sampleRerecord: 'Re-record sample',
    sampleStop: 'Stop',
    sampleRecording: 'Recording…',
    sampleReady: 'Sample ready',
    sampleTooShort: 'Too short — record at least 5 seconds.',
    mic_unsupported: 'Your browser cannot record audio.',
    mic_denied: 'Microphone access was blocked. Allow it in your browser settings and try again.',
    mic_busy: 'Could not start the microphone. Check that no other app is using it.',
    cloneNeedSample: 'Record a voice sample above first.',
    cloneBnUnavailable: 'Voice cloning is not available for Bengali yet. Use AI voice or record yourself.',
    cloneWarming: 'Waking up the voice engine — this can take a minute or two…',
    recordBtn: '● Record',
    recordStopBtn: '■ Stop',
    recordedReady: 'Recorded',
    recordingNow: 'Recording',
    recordNoteTitle: 'Tip: read each scene aloud in a quiet room.',
    narrationLabel: 'Narration',
    noMediaYet: 'No clip selected',
    visualKeywordLabel: 'Visual search keyword',
    findClipsBtn: 'Find clips',
    addSceneBtn: '+ Add scene',
    pexelsAttribution: 'Video content and photos provided by Pexels',
    topicRequired: 'Please enter a topic.',
    draftRestored: 'Restored your last draft.',
    noResults: 'No clips found. Try a different keyword.',
  },
  bn: {
    appName: 'ফেসলেস ভিডিও মেকার',
    topicHeading: 'আপনার ভিডিওটি কী নিয়ে?',
    topicSubheading: 'একটি বিষয় লিখুন। আমরা স্ক্রিপ্ট লিখব, ভিজ্যুয়াল খুঁজব এবং একটি ডাউনলোডযোগ্য ভিডিও তৈরি করব — বিনামূল্যে।',
    topicLabel: 'বিষয়',
    languageLabel: 'ভাষ্য ভাষা',
    sceneCountLabel: 'দৃশ্যের সংখ্যা',
    formatLabel: 'ফরম্যাট',
    generateBtn: 'স্ক্রিপ্ট তৈরি করুন',
    loadingScript: 'আপনার স্ক্রিপ্ট লেখা হচ্ছে…',
    editorSubheading: 'রেন্ডার করার আগে স্ক্রিপ্ট সম্পাদনা করুন এবং ক্লিপ পরিবর্তন করুন।',
    startOverBtn: 'নতুন করে শুরু করুন',
    continueBtn: 'রেন্ডার ও ডাউনলোড',
    draftSaved: 'খসড়া সংরক্ষিত',
    draftSaveFailed: 'এই ব্রাউজারে খসড়া সংরক্ষণ করা যায়নি (স্টোরেজ ভরা বা বন্ধ)।',
    renderTitle: 'ভিডিও রেন্ডার',
    renderQualityLabel: 'কোয়ালিটি',
    renderContainerLabel: 'ফাইলের ধরন',
    renderSubStyleLabel: 'সাবটাইটেলের স্টাইল',
    subStyleClassic: 'ক্লাসিক',
    subStyleBold: 'গাঢ় হলুদ',
    subStyleBox: 'কালো বক্সে',
    renderMusicLabel: 'ব্যাকগ্রাউন্ড মিউজিক (ঐচ্ছিক)',
    renderDuckLabel: 'বর্ণনা চলার সময় মিউজিক কমান',
    renderMusicHelp: 'যে মিউজিক ব্যবহারের অধিকার আপনার আছে শুধু সেটাই দিন। ফাইলটি আপনার ব্রাউজারেই থাকে।',
    renderMusicTooBig: 'মিউজিক ফাইলটি অনেক বড় (সর্বোচ্চ ২৫ MB)।',
    renderMusicBad: 'ফাইলটি অডিও হিসেবে পড়া যায়নি। MP3 বা WAV দিন।',
    renderStartBtn: 'রেন্ডার শুরু করুন',
    renderKeepOpen: 'এই ট্যাব খোলা ও দৃশ্যমান রাখুন। রেন্ডার রিয়েল-টাইমে চলে।',
    renderCancelBtn: 'বাতিল',
    renderDownloadBtn: 'ভিডিও ডাউনলোড',
    renderAgainBtn: 'আবার রেন্ডার',
    renderAiNote: 'আপলোডের সময় ইউটিউব বাস্তবসম্মত এআই ভয়েস বা ভিজ্যুয়ালকে "পরিবর্তিত বা কৃত্রিম কনটেন্ট" হিসেবে চিহ্নিত করতে বলতে পারে।',
    renderScenesWord: 'দৃশ্য',
    renderNoVoiceCount: 'টি ভয়েস ছাড়া (নীরব)',
    renderNoClipCount: 'টি ক্লিপ ছাড়া',
    renderUnsupported: 'এই ব্রাউজার ভিডিও রেন্ডার করতে পারে না। কম্পিউটারে সাম্প্রতিক Chrome, Edge বা Firefox ব্যবহার করুন।',
    renderEmpty: 'আগে কিছু ভাষ্য লিখুন।',
    renderTooLong: 'ভিডিও ৩ মিনিটের সীমার চেয়ে বড়। দৃশ্য কমান বা ছোট করুন।',
    renderPreparing: 'ক্লিপ লোড হচ্ছে…',
    renderRendering: 'রেন্ডার হচ্ছে',
    renderFinishing: 'ফাইল তৈরি শেষ হচ্ছে…',
    renderWarnClips: 'এই দৃশ্যগুলোতে নির্বাচিত ভিডিও ক্লিপ ব্যবহার করা যায়নি, তাই স্থির ছবি বা সাদামাটা ব্যাকগ্রাউন্ড ব্যবহার হয়েছে:',
    render_recorder: 'রেন্ডার ব্যর্থ হয়েছে। ৭২০p চেষ্টা করুন, অথবা রিলোড করে আবার চেষ্টা করুন।',
    render_unsupported: 'এই ব্রাউজার সমর্থিত ফরম্যাটে ভিডিও রেকর্ড করতে পারে না।',
    render_empty: 'আগে কিছু ভাষ্য লিখুন।',
    render_too_long: 'ভিডিও ৩ মিনিটের সীমার চেয়ে বড়।',
    metaHeading: 'টাইটেল, বিবরণ ও ট্যাগ',
    metaGenerateBtn: 'এআই দিয়ে প্রস্তাব নিন',
    metaTitleLabel: 'টাইটেল',
    metaDescriptionLabel: 'বিবরণ',
    metaTagsLabel: 'ট্যাগ (কমা দিয়ে আলাদা)',
    metaWorking: 'প্রস্তাব লেখা হচ্ছে…',
    metaReady: 'আপলোডের আগে দেখে নিন ও সম্পাদনা করুন — এআই ভুল করতে পারে।',
    metaFailed: 'প্রস্তাব তৈরি করা যায়নি। আবার চেষ্টা করুন।',
    copyBtn: 'কপি',
    copied: 'কপি হয়েছে',
    copyManual: 'Ctrl+C চাপুন',
    scene: 'দৃশ্য',
    generateVoiceBtn: 'ভয়েস তৈরি করুন',
    regenerateVoiceBtn: 'আবার ভয়েস তৈরি করুন',
    previewSceneBtn: '▶ দৃশ্যের প্রিভিউ',
    generateAllVoicesBtn: 'সব ভয়েস তৈরি করুন',
    previewVideoBtn: '▶ ভিডিও প্রিভিউ',
    voiceGenerating: 'ভয়েস তৈরি হচ্ছে…',
    voiceReady: 'ভয়েস প্রস্তুত',
    voiceFailed: 'ভয়েস তৈরি করা যায়নি। আবার চেষ্টা করুন।',
    voiceNeedsText: 'আগে ভাষ্য লিখুন।',
    voiceProgress: 'ভয়েস তৈরি হচ্ছে',
    voiceAllDone: 'সব ভয়েস প্রস্তুত।',
    previewNoVoice: 'এই দৃশ্যের ভয়েস এখনো নেই — সময় আনুমানিক।',
    play: 'চালান',
    pause: 'থামান',
    voiceModeLabel: 'ভয়েস',
    voiceModeTts: 'এআই ভয়েস',
    voiceModeClone: 'আমার ক্লোন করা ভয়েস',
    voiceModeRecord: 'নিজে রেকর্ড করুন',
    cloneHelp: 'আপনার কণ্ঠের একটি ছোট নমুনা রেকর্ড করুন। এটি শুধু এই ভিডিও তৈরিতে ব্যবহৃত হবে এবং কখনো সংরক্ষিত হবে না।',
    clonePrompt: 'জোরে পড়ুন: "হ্যালো, এটি আমার কণ্ঠ। আমি একটি ছোট নমুনা রেকর্ড করছি, যাতে আমার ভিডিওগুলো আমার মতো শোনায়।"',
    cloneConsent: 'এটি আমার নিজের কণ্ঠ, অথবা এটি ক্লোন করার অনুমতি আমার আছে।',
    sampleRecord: 'নমুনা রেকর্ড করুন',
    sampleRerecord: 'আবার রেকর্ড করুন',
    sampleStop: 'থামান',
    sampleRecording: 'রেকর্ড হচ্ছে…',
    sampleReady: 'নমুনা প্রস্তুত',
    sampleTooShort: 'খুব ছোট — অন্তত ৫ সেকেন্ড রেকর্ড করুন।',
    mic_unsupported: 'আপনার ব্রাউজার অডিও রেকর্ড করতে পারে না।',
    mic_denied: 'মাইক্রোফোনের অনুমতি বন্ধ আছে। ব্রাউজার সেটিংসে অনুমতি দিয়ে আবার চেষ্টা করুন।',
    mic_busy: 'মাইক্রোফোন চালু করা যায়নি। অন্য কোনো অ্যাপ ব্যবহার করছে কি না দেখুন।',
    cloneNeedSample: 'আগে উপরে ভয়েস নমুনা রেকর্ড করুন।',
    cloneBnUnavailable: 'বাংলায় ভয়েস ক্লোনিং এখনো পাওয়া যায় না। এআই ভয়েস ব্যবহার করুন বা নিজে রেকর্ড করুন।',
    cloneWarming: 'ভয়েস ইঞ্জিন চালু হচ্ছে — এক-দুই মিনিট লাগতে পারে…',
    recordBtn: '● রেকর্ড',
    recordStopBtn: '■ থামান',
    recordedReady: 'রেকর্ড হয়েছে',
    recordingNow: 'রেকর্ড হচ্ছে',
    recordNoteTitle: 'টিপ: শান্ত ঘরে প্রতিটি দৃশ্য জোরে পড়ুন।',
    narrationLabel: 'ভাষ্য',
    noMediaYet: 'কোনো ক্লিপ নির্বাচিত নেই',
    visualKeywordLabel: 'ভিজ্যুয়াল সার্চ কীওয়ার্ড',
    findClipsBtn: 'ক্লিপ খুঁজুন',
    addSceneBtn: '+ দৃশ্য যোগ করুন',
    pexelsAttribution: 'ভিডিও ও ছবি সরবরাহ করেছে Pexels',
    topicRequired: 'অনুগ্রহ করে একটি বিষয় লিখুন।',
    draftRestored: 'আপনার সর্বশেষ খসড়া পুনরুদ্ধার করা হয়েছে।',
    noResults: 'কোনো ক্লিপ পাওয়া যায়নি। অন্য কীওয়ার্ড চেষ্টা করুন।',
  },
};

let uiLang = (localStorage.getItem('fvm.uiLang')) || 'en';
let project = null; // current video project JSON (see CLAUDE.md §7 data model)

// ---------- Elements ----------
const el = {
  stepTopic: document.getElementById('step-topic'),
  stepLoading: document.getElementById('step-loading'),
  stepEditor: document.getElementById('step-editor'),
  loadingMessage: document.getElementById('loadingMessage'),

  langSwitch: document.getElementById('langSwitch'),
  themeToggle: document.getElementById('themeToggle'),

  topicForm: document.getElementById('topicForm'),
  topicInput: document.getElementById('topicInput'),
  topicCharCount: document.getElementById('topicCharCount'),
  languageSelect: document.getElementById('languageSelect'),
  sceneCountInput: document.getElementById('sceneCountInput'),
  formatSelect: document.getElementById('formatSelect'),
  generateBtn: document.getElementById('generateBtn'),
  topicError: document.getElementById('topicError'),

  projectTitle: document.getElementById('projectTitle'),
  sceneList: document.getElementById('sceneList'),
  sceneCardTemplate: document.getElementById('sceneCardTemplate'),
  addSceneBtn: document.getElementById('addSceneBtn'),
  backToTopicBtn: document.getElementById('backToTopicBtn'),
  continueBtn: document.getElementById('continueBtn'),
  voiceAllBtn: document.getElementById('voiceAllBtn'),
  voiceModeSelect: document.getElementById('voiceModeSelect'),
  cloneBox: document.getElementById('cloneBox'),
  voiceNote: document.getElementById('voiceNote'),
  previewBtn: document.getElementById('previewBtn'),
  draftStatus: document.getElementById('draftStatus'),
};

const player = createPlayer({
  getProject: () => project,
  t: (key) => t(key),
  els: {
    dialog: document.getElementById('previewDialog'),
    stage: document.getElementById('previewStage'),
    media: document.getElementById('previewMedia'),
    subtitle: document.getElementById('previewSubtitle'),
    bar: document.getElementById('previewProgressBar'),
    label: document.getElementById('previewSceneLabel'),
    note: document.getElementById('previewNote'),
    playBtn: document.getElementById('previewPlayBtn'),
    prevBtn: document.getElementById('previewPrevBtn'),
    nextBtn: document.getElementById('previewNextBtn'),
    closeBtn: document.getElementById('previewCloseBtn'),
  },
});

const $ = (id) => document.getElementById(id);
const exportPanel = createExportPanel({
  getProject: () => project,
  t: (key) => t(key),
  els: {
    dialog: $('renderDialog'),
    setup: $('renderSetup'),
    progress: $('renderProgress'),
    result: $('renderResult'),
    quality: $('renderQuality'),
    container: $('renderContainer'),
    subStyle: $('renderSubStyle'),
    musicBox: $('renderMusicBox'),
    musicFile: $('renderMusicFile'),
    duck: $('renderDuck'),
    summary: $('renderSummary'),
    issues: $('renderIssues'),
    startBtn: $('renderStartBtn'),
    cancelBtn: $('renderCancelBtn'),
    againBtn: $('renderAgainBtn'),
    closeBtn: $('renderCloseBtn'),
    status: $('renderStatus'),
    bar: $('renderBar'),
    barWrap: document.querySelector('#renderProgress .render-bar'),
    video: $('renderVideo'),
    download: $('renderDownload'),
    warnings: $('renderWarnings'),
    meta: {
      panel: $('metaPanel'),
      fields: $('metaFields'),
      status: $('metaStatus'),
      generateBtn: $('metaGenerateBtn'),
      title: $('metaTitle'),
      description: $('metaDescription'),
      tags: $('metaTags'),
    },
  },
});

// scene id -> function that refreshes that card's voice controls
const voiceUi = new Map();
let activeRecording = null; // { sceneId, ctl } while a scene is being recorded

const clonePanel = createClonePanel({
  t: (key) => t(key),
  onChange: () => refreshAllVoiceUi(),
  els: {
    consent: document.getElementById('cloneConsent'),
    recordBtn: document.getElementById('sampleRecordBtn'),
    status: document.getElementById('sampleStatus'),
    player: document.getElementById('samplePlayer'),
  },
});



// ---------- i18n ----------
function applyI18n() {
  const dict = STRINGS[uiLang] || STRINGS.en;
  document.querySelectorAll('[data-i18n]').forEach((node) => {
    const key = node.getAttribute('data-i18n');
    if (dict[key]) node.textContent = dict[key];
  });
  document.documentElement.lang = uiLang;
  el.langSwitch.value = uiLang;
  if (project) renderEditor();
  exportPanel.refreshLanguage();
}

function t(key) {
  return (STRINGS[uiLang] || STRINGS.en)[key] || key;
}

el.langSwitch.addEventListener('change', () => {
  uiLang = el.langSwitch.value;
  localStorage.setItem('fvm.uiLang', uiLang);
  applyI18n();
});

// ---------- Theme ----------
function applySavedTheme() {
  const saved = localStorage.getItem('fvm.theme');
  if (saved === 'dark' || saved === 'light') {
    document.documentElement.setAttribute('data-theme', saved);
    el.themeToggle.textContent = saved === 'dark' ? '☀️' : '🌙';
  }
}

el.themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const currentlyDark = current ? current === 'dark' : prefersDark;
  const next = currentlyDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('fvm.theme', next);
  el.themeToggle.textContent = next === 'dark' ? '☀️' : '🌙';
});

// ---------- Step navigation ----------
function showStep(name) {
  for (const step of [el.stepTopic, el.stepLoading, el.stepEditor]) {
    step.hidden = step.dataset.step !== name;
  }
}

// ---------- Topic form ----------
el.topicInput.addEventListener('input', () => {
  el.topicCharCount.textContent = String(el.topicInput.value.length);
});

el.topicForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();

  const topic = el.topicInput.value.trim();
  if (!topic) {
    showError(t('topicRequired'));
    return;
  }

  const language = el.languageSelect.value;
  const sceneCount = Number(el.sceneCountInput.value) || 6;
  const format = el.formatSelect.value;

  el.generateBtn.disabled = true;
  el.loadingMessage.textContent = t('loadingScript');
  showStep('loading');

  try {
    const result = await generateScript({ topic, language, sceneCount });
    project = {
      topic,
      language,
      format,
      voiceMode: 'tts',
      title: result.title,
      scenes: result.scenes.map((s) => ({
        ...s,
        media: null,
        audio: { mode: 'tts', blobUrl: null, durationSec: 0 },
      })),
    };
    saveDraft(project);
    renderEditor();
    showStep('editor');
  } catch (err) {
    showStep('topic');
    showError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
  } finally {
    el.generateBtn.disabled = false;
  }
});

function showError(message) {
  el.topicError.textContent = message;
  el.topicError.hidden = false;
}

function hideError() {
  el.topicError.hidden = true;
  el.topicError.textContent = '';
}

// ---------- Scene editor ----------
function renderEditor() {
  el.projectTitle.textContent = project.title;
  syncVoicePanel();
  el.sceneList.innerHTML = '';
  voiceUi.clear();
  project.scenes.forEach((scene, index) => {
    el.sceneList.appendChild(buildSceneCard(scene, index));
  });
  persist();
}

function buildSceneCard(scene, index) {
  const node = el.sceneCardTemplate.content.firstElementChild.cloneNode(true);
  node.dataset.sceneId = scene.id;

  node.querySelector('.scene-number').textContent = `${t('scene')} ${index + 1}`;

  const textarea = node.querySelector('.scene-text');
  textarea.value = scene.text;
  textarea.addEventListener('input', () => {
    scene.text = textarea.value;
    if (hasVoice(scene) && !voiceMatchesText(scene)) {
      discardVoice(scene);
      voiceUi.get(scene.id)?.();
    }
    persist();
  });

  const keywordInput = node.querySelector('.scene-keyword');
  keywordInput.value = scene.keyword;
  keywordInput.addEventListener('input', () => {
    scene.keyword = keywordInput.value;
    persist();
  });

  const preview = node.querySelector('.scene-media-preview');
  renderMediaPreview(preview, scene);

  const findBtn = node.querySelector('.find-media-btn');
  const resultsBox = node.querySelector('.media-results');
  findBtn.textContent = t('findClipsBtn');
  findBtn.addEventListener('click', () => handleFindMedia(scene, keywordInput.value, resultsBox, preview, findBtn));

  node.querySelector('.scene-field-label').textContent = t('narrationLabel');
  const labels = node.querySelectorAll('.scene-field-label');
  if (labels[1]) labels[1].textContent = t('visualKeywordLabel');

  setupVoiceControls(node, scene);

  node.querySelector('.move-up-btn').addEventListener('click', () => moveScene(scene.id, -1));
  node.querySelector('.move-down-btn').addEventListener('click', () => moveScene(scene.id, 1));
  node.querySelector('.delete-scene-btn').addEventListener('click', () => deleteScene(scene.id));

  return node;
}

function renderMediaPreview(previewEl, scene) {
  previewEl.innerHTML = '';
  if (!scene.media) {
    const placeholder = document.createElement('div');
    placeholder.className = 'media-placeholder';
    placeholder.textContent = t('noMediaYet');
    previewEl.appendChild(placeholder);
    return;
  }
  if (scene.media.type === 'video') {
    const video = document.createElement('video');
    video.src = scene.media.url;
    video.muted = true;
    video.loop = true;
    video.autoplay = true;
    video.playsInline = true;
    previewEl.appendChild(video);
  } else {
    const img = document.createElement('img');
    img.src = scene.media.url;
    img.alt = scene.keyword;
    previewEl.appendChild(img);
  }
}

async function handleFindMedia(scene, keyword, resultsBox, previewEl, findBtn) {
  const query = keyword.trim();
  if (!query) return;

  findBtn.disabled = true;
  const originalLabel = findBtn.textContent;
  findBtn.textContent = '…';

  try {
    const orientation = project.format === '16:9' ? 'landscape' : 'portrait';
    const { results } = await searchMedia({ keyword: query, type: 'video', orientation, perPage: 8 });
    renderMediaResults(results, scene, resultsBox, previewEl);
  } catch (err) {
    resultsBox.hidden = false;
    resultsBox.innerHTML = '';
    const msg = document.createElement('div');
    msg.className = 'media-placeholder';
    msg.textContent = err instanceof ApiError ? err.message : t('noResults');
    resultsBox.appendChild(msg);
  } finally {
    findBtn.disabled = false;
    findBtn.textContent = originalLabel;
  }
}

function renderMediaResults(results, scene, resultsBox, previewEl) {
  resultsBox.innerHTML = '';
  resultsBox.hidden = false;

  if (!results || results.length === 0) {
    const msg = document.createElement('div');
    msg.className = 'media-placeholder';
    msg.textContent = t('noResults');
    resultsBox.appendChild(msg);
    return;
  }

  results.forEach((item) => {
    const thumb = document.createElement('div');
    thumb.className = 'media-result-thumb';
    if (scene.media && scene.media.id === item.id) thumb.classList.add('selected');

    const img = document.createElement('img');
    img.src = item.previewUrl;
    img.alt = '';
    img.loading = 'lazy';
    thumb.appendChild(img);

    if (item.type === 'video' && item.durationSec) {
      const badge = document.createElement('span');
      badge.className = 'badge';
      badge.textContent = `${item.durationSec}s`;
      thumb.appendChild(badge);
    }

    thumb.addEventListener('click', () => {
      scene.media = item;
      persist();
      renderMediaPreview(previewEl, scene);
      resultsBox.querySelectorAll('.media-result-thumb').forEach((n) => n.classList.remove('selected'));
      thumb.classList.add('selected');
    });

    resultsBox.appendChild(thumb);
  });
}

function moveScene(sceneId, direction) {
  const idx = project.scenes.findIndex((s) => s.id === sceneId);
  const newIdx = idx + direction;
  if (idx === -1 || newIdx < 0 || newIdx >= project.scenes.length) return;
  const [scene] = project.scenes.splice(idx, 1);
  project.scenes.splice(newIdx, 0, scene);
  renderEditor();
}

function deleteScene(sceneId) {
  const doomed = project.scenes.find((s) => s.id === sceneId);
  if (activeRecording?.sceneId === sceneId) cancelRecording();
  if (doomed) discardVoice(doomed);
  project.scenes = project.scenes.filter((s) => s.id !== sceneId);
  renderEditor();
}

el.addSceneBtn.addEventListener('click', () => {
  const nextNum = project.scenes.length + 1;
  project.scenes.push({
    id: `s${Date.now()}`,
    text: '',
    keyword: '',
    media: null,
    audio: { mode: 'tts', blobUrl: null, durationSec: 0 },
  });
  renderEditor();
  // Focus the newly added scene's textarea.
  const cards = el.sceneList.querySelectorAll('.scene-card');
  const last = cards[cards.length - 1];
  last?.querySelector('.scene-text')?.focus();
  void nextNum;
});

el.backToTopicBtn.addEventListener('click', () => {
  cancelRecording();
  clonePanel.reset();
  project?.scenes.forEach(discardVoice);
  clearDraft();
  project = null;
  el.topicForm.reset();
  el.topicCharCount.textContent = '0';
  hideError();
  showStep('topic');
});

// ---------- Voice ----------
// Generated audio lives in memory only (scene.audio.blobUrl); drafts never store it.
const voiceMode = () => project?.voiceMode || 'tts';

function hasVoice(scene) {
  return Boolean(scene.audio?.blobUrl);
}

function voiceMatchesText(scene) {
  if (!hasVoice(scene)) return false;
  // A recording is the user's own take; editing the caption text doesn't invalidate it.
  if (scene.audio.mode === 'record') return true;
  return scene.audio.mode === voiceMode() && scene.audio.forText === scene.text.trim();
}

function discardVoice(scene) {
  if (scene.audio?.blobUrl) URL.revokeObjectURL(scene.audio.blobUrl);
  scene.audio = { mode: voiceMode(), blobUrl: null, durationSec: 0 };
}

function formatSeconds(sec) {
  return `${sec.toFixed(1)}s`;
}

function voiceErrorMessage(err) {
  // Clone errors are written to be user-facing; TTS 5xx stay generic.
  if (err instanceof ApiError && (err.status < 500 || voiceMode() === 'clone')) return err.message;
  return t('voiceFailed');
}

function voiceBlockedReason() {
  if (voiceMode() !== 'clone') return '';
  if (project.language === 'bn' && !isEnabled('voiceCloneBn')) return t('cloneBnUnavailable');
  if (!clonePanel.getSample()) return t('cloneNeedSample');
  return '';
}

function cancelRecording() {
  activeRecording?.ctl.cancel();
  activeRecording = null;
}

function syncVoicePanel() {
  if (!project) return;
  const mode = voiceMode();
  el.voiceModeSelect.value = mode;
  for (const [name, flag] of [['clone', 'voiceClone'], ['record', 'voiceRecord']]) {
    const opt = el.voiceModeSelect.querySelector(`option[value="${name}"]`);
    opt.hidden = opt.disabled = !isEnabled(flag);
  }
  el.cloneBox.hidden = mode !== 'clone';
  const blocked = mode === 'clone' && project.language === 'bn' && !isEnabled('voiceCloneBn');
  const note = blocked ? t('cloneBnUnavailable') : mode === 'record' ? t('recordNoteTitle') : '';
  el.voiceNote.textContent = note;
  el.voiceNote.hidden = !note;
  el.voiceAllBtn.hidden = mode === 'record';
  el.voiceAllBtn.disabled = Boolean(voiceBlockedReason());
}

function refreshAllVoiceUi() {
  if (!project) return;
  syncVoicePanel();
  voiceUi.forEach((refresh) => refresh());
}

el.voiceModeSelect.addEventListener('change', () => {
  cancelRecording();
  project.voiceMode = el.voiceModeSelect.value;
  // Recordings are the user's own work and survive a mode switch; generated audio doesn't.
  project.scenes.forEach((s) => s.audio?.mode !== 'record' && discardVoice(s));
  persist();
  refreshAllVoiceUi();
});

function setupVoiceControls(node, scene) {
  const voiceBtn = node.querySelector('.voice-btn');
  const playBtn = node.querySelector('.play-scene-btn');
  const status = node.querySelector('.voice-status');
  let busy = false;
  let message = '';
  let engineStatus = '';
  let recSec = 0;
  let starting = false;

  const refresh = () => {
    const mode = voiceMode();
    const ready = voiceMatchesText(scene);
    const recordingThis = activeRecording?.sceneId === scene.id;
    const recordingOther = Boolean(activeRecording) && !recordingThis;
    const blocked = voiceBlockedReason();

    if (mode === 'record') {
      voiceBtn.textContent = recordingThis ? t('recordStopBtn') : t('recordBtn');
      voiceBtn.disabled = busy || recordingOther;
    } else {
      voiceBtn.textContent = ready ? t('regenerateVoiceBtn') : t('generateVoiceBtn');
      voiceBtn.disabled = busy || Boolean(blocked);
    }
    playBtn.textContent = t('previewSceneBtn');
    playBtn.disabled = busy || recordingThis || !scene.text.trim();

    let text = '';
    if (busy) text = engineStatus === 'warming' ? t('cloneWarming') : t('voiceGenerating');
    else if (recordingThis) text = `${t('recordingNow')} ${recSec}s`;
    else if (message) text = message;
    else if (ready) text = `${scene.audio.mode === 'record' ? t('recordedReady') : t('voiceReady')} · ${formatSeconds(scene.audio.durationSec)}`;
    else if (mode !== 'record') text = blocked;
    status.textContent = text;
    status.classList.toggle('error', Boolean(message) && !busy);
  };
  voiceUi.set(scene.id, refresh);

  async function finishRecording(blob) {
    if (activeRecording?.sceneId !== scene.id) return; // already handled (stop click vs auto-stop)
    activeRecording = null;
    if (blob?.size) {
      busy = true;
      refresh();
      try {
        const { blob: recorded } = await getVoice(scene, 'record', { blob });
        const durationSec = await measureDuration(recorded);
        if (project.scenes.includes(scene)) {
          discardVoice(scene);
          scene.audio = { mode: 'record', blobUrl: URL.createObjectURL(recorded), durationSec, provider: 'record' };
        }
      } catch {
        message = t('voiceFailed');
      }
      busy = false;
    }
    refreshAllVoiceUi();
  }

  async function toggleRecording() {
    if (activeRecording?.sceneId === scene.id) {
      await finishRecording(await activeRecording.ctl.stop());
      return;
    }
    if (starting) return;
    starting = true;
    message = '';
    try {
      const ctl = await startRecording({
        maxSec: 60,
        onTick: (sec) => {
          recSec = Math.floor(sec);
          refresh();
        },
        onAutoStop: finishRecording,
      });
      activeRecording = { sceneId: scene.id, ctl };
      recSec = 0;
    } catch (err) {
      message = err instanceof MicError ? t(`mic_${err.code}`) : t('mic_busy');
    }
    starting = false;
    refreshAllVoiceUi();
  }

  voiceBtn.addEventListener('click', async () => {
    if (voiceMode() === 'record') return toggleRecording();
    busy = true;
    message = '';
    engineStatus = '';
    refresh();
    try {
      await generateVoice(scene, (s) => {
        engineStatus = s;
        refresh();
      });
    } catch (err) {
      message = voiceErrorMessage(err);
    } finally {
      busy = false;
      refresh();
    }
  });

  playBtn.addEventListener('click', () => player.open(project.scenes.indexOf(scene), { single: true }));
  refresh();
}

async function generateVoice(scene, onStatus) {
  const text = scene.text.trim();
  if (!text) throw new ApiError(t('voiceNeedsText'), 400);

  const mode = voiceMode();
  const options = { language: project.language, onStatus };
  if (mode === 'clone') options.sample = clonePanel.getSample();
  const { blob, provider } = await getVoice({ ...scene, text }, mode, options);
  const durationSec = await measureDuration(blob);

  // The scene or voice mode may have changed while the request ran.
  if (!project.scenes.includes(scene) || scene.text.trim() !== text || voiceMode() !== mode) return;

  discardVoice(scene);
  scene.audio = { mode, blobUrl: URL.createObjectURL(blob), durationSec, forText: text, provider };
}

async function generateAllVoices() {
  const pending = project.scenes.filter((s) => s.text.trim() && !voiceMatchesText(s));
  if (!pending.length) return;

  el.voiceAllBtn.disabled = true;
  const label = el.voiceAllBtn.textContent;
  let failed = false;
  try {
    // Sequential on purpose: free-tier TTS and our own rate limit (CLAUDE.md §2).
    for (let i = 0; i < pending.length; i++) {
      const progress = `${t('voiceProgress')} ${i + 1}/${pending.length}…`;
      el.voiceAllBtn.textContent = progress;
      try {
        await generateWithRetry(pending[i], (s) => {
          el.voiceAllBtn.textContent = s === 'warming' ? t('cloneWarming') : progress;
        });
      } catch (err) {
        failed = true;
        el.voiceAllBtn.textContent = voiceErrorMessage(err);
        break;
      } finally {
        voiceUi.get(pending[i].id)?.();
      }
    }
  } finally {
    if (failed) await new Promise((r) => setTimeout(r, 3000));
    el.voiceAllBtn.textContent = label;
    el.voiceAllBtn.disabled = Boolean(voiceBlockedReason());
  }
}

async function generateWithRetry(scene, onStatus) {
  try {
    await generateVoice(scene, onStatus);
  } catch (err) {
    // One polite wait on rate-limit, then give up.
    if (err instanceof ApiError && err.status === 429) {
      await new Promise((r) => setTimeout(r, Math.min(err.retryAfterSec || 5, 60) * 1000));
      return generateVoice(scene, onStatus);
    }
    throw err;
  }
}

el.voiceAllBtn.addEventListener('click', generateAllVoices);
el.previewBtn.addEventListener('click', () => player.open(0));

el.continueBtn.addEventListener('click', () => isEnabled('render') && exportPanel.open());

function persist() {
  if (!project) return;
  const ok = saveDraft(project);
  el.draftStatus.textContent = ok ? t('draftSaved') : t('draftSaveFailed');
  el.draftStatus.classList.toggle('error', !ok);
}

// ---------- Boot ----------
function boot() {
  applySavedTheme();
  applyI18n();

  const draft = loadDraft();
  if (draft && draft.scenes && draft.scenes.length) {
    project = draft;
    el.languageSelect.value = draft.language || 'en';
    el.formatSelect.value = draft.format || '9:16';
    renderEditor();
    showStep('editor');
    el.draftStatus.textContent = t('draftRestored');
  } else {
    showStep('topic');
  }

  const voiceOn = isEnabled('voicePreview');
  document.body.classList.toggle('no-voice', !voiceOn);

  if (!isEnabled('sceneEditor')) {
    // Defensive: scene editor is core to Phase 1 and should always be on,
    // but if a flag override disables it, fall back to a read-only notice
    // rather than a broken UI.
    el.addSceneBtn.hidden = true;
  }
  el.continueBtn.hidden = !isEnabled('render');
}

boot();
