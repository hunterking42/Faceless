import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, itemAt, MAX_VIDEO_SEC, TRAILING_PAD_SEC } from '../public/js/render/timeline.js';
import { outputSize, coverRect, kenBurns, wrapLines, pickMime, safeFileName } from '../public/js/render/layout.js';
import { incomingAlpha, outroAlpha } from '../public/js/render/transitions.js';
import { duckEnvelope, mergeIntervals } from '../public/js/render/ducking.js';
import { subtitleFontPx } from '../public/js/render/subtitleStyle.js';

const voiced = (text, sec) => ({ text, audio: { blobUrl: 'blob:x', durationSec: sec } });
const silent = (text) => ({ text, audio: { blobUrl: null, durationSec: 0 } });

test('timeline lays voiced scenes end to end with a trailing pad', () => {
  const tl = buildTimeline([voiced('a', 3), voiced('b', 2)], 'en');
  assert.equal(tl.items[0].start, 0);
  assert.equal(tl.items[1].start, 3 + TRAILING_PAD_SEC);
  assert.ok(Math.abs(tl.total - (5 + 2 * TRAILING_PAD_SEC)) < 1e-9);
  assert.equal(tl.overCap, false);
});

test('timeline skips empty scenes and keeps original indexes', () => {
  const tl = buildTimeline([voiced('a', 2), voiced('  ', 2), voiced('c', 2)], 'en');
  assert.deepEqual(tl.items.map((i) => i.index), [0, 2]);
});

test('timeline estimates unvoiced scenes and flags the 3-minute cap', () => {
  const tl = buildTimeline([silent('word '.repeat(10))], 'en');
  assert.ok(tl.items[0].duration > 3);
  assert.equal(buildTimeline([voiced('a', MAX_VIDEO_SEC + 1)], 'en').overCap, true);
});

test('itemAt picks the scene for a time and clamps past the end', () => {
  const tl = buildTimeline([voiced('a', 2), voiced('b', 2)], 'en');
  assert.equal(itemAt(tl, 0).index, 0);
  assert.equal(itemAt(tl, tl.items[1].start + 0.01).index, 1);
  assert.equal(itemAt(tl, 999).index, 1);
  assert.equal(itemAt({ items: [] }, 0), null);
});

test('outputSize follows format and quality', () => {
  assert.deepEqual(outputSize('9:16', '1080p'), { width: 1080, height: 1920 });
  assert.deepEqual(outputSize('16:9', '720p'), { width: 1280, height: 720 });
  assert.deepEqual(outputSize('weird', 'weird'), { width: 1080, height: 1920 });
});

test('coverRect fills the target aspect without distortion', () => {
  const r = coverRect(1920, 1080, 1080, 1920);
  assert.ok(Math.abs(r.sw / r.sh - 1080 / 1920) < 1e-9);
  assert.ok(r.sx >= 0 && r.sx + r.sw <= 1920 + 1e-9);
  const z = coverRect(1920, 1080, 1920, 1080, 2);
  assert.equal(z.sw, 960);
  assert.equal(coverRect(0, 0, 10, 10).sw, 0);
});

test('kenBurns alternates direction and stays in range', () => {
  assert.ok(kenBurns(1, 0).zoom > kenBurns(0, 0).zoom);
  assert.ok(kenBurns(1, 1).zoom < kenBurns(0, 1).zoom);
  for (const p of [-1, 0, 0.5, 1, 2]) {
    const k = kenBurns(p, 2);
    assert.ok(k.zoom >= 1 && k.focusX >= 0 && k.focusX <= 1);
  }
});

test('wrapLines wraps greedily and never splits a word', () => {
  const measure = (s) => s.length * 10;
  assert.deepEqual(wrapLines('aaa bbb ccc ddd', 70, measure), ['aaa bbb', 'ccc ddd']);
  assert.deepEqual(wrapLines('supercalifragilistic', 50, measure), ['supercalifragilistic']);
  assert.deepEqual(wrapLines('আমার সোনার বাংলা', 1000, measure), ['আমার সোনার বাংলা']);
  assert.deepEqual(wrapLines('   ', 100, measure), []);
});

test('pickMime prefers WebM unless MP4 is requested, and handles nothing supported', () => {
  const all = () => true;
  assert.equal(pickMime(all).ext, 'webm');
  assert.equal(pickMime(all, true).ext, 'mp4');
  assert.equal(pickMime((m) => m.startsWith('video/webm'), true).ext, 'webm');
  assert.equal(pickMime(() => false), null);
});

test('safeFileName strips unsafe characters and keeps Bengali', () => {
  assert.equal(safeFileName('5 fun/facts: "space"?', 'webm'), '5-funfacts-space.webm');
  assert.equal(safeFileName('মহাকাশের তথ্য', 'mp4'), 'মহাকাশের-তথ্য.mp4');
  assert.equal(safeFileName('///', 'webm'), 'video.webm');
});

test('transition alphas ramp 0..1 and shrink for short scenes', () => {
  assert.equal(incomingAlpha(0, 5), 0);
  assert.equal(incomingAlpha(5, 5), 1);
  assert.equal(incomingAlpha(0.3, 0.6), 1.0 * Math.min(1, 0.3 / 0.2));
  assert.equal(outroAlpha(5, 5), 0);
  assert.equal(outroAlpha(0, 5), 1);
});

test('mergeIntervals joins close speech, duckEnvelope is ascending and bounded', () => {
  assert.deepEqual(mergeIntervals([{ start: 5, end: 6 }, { start: 0, end: 1 }, { start: 1.2, end: 2 }], 0.5), [{ start: 0, end: 2 }, { start: 5, end: 6 }]);
  const env = duckEnvelope([{ start: 0, end: 2 }, { start: 2.1, end: 4 }, { start: 8, end: 9 }], 10);
  for (let i = 1; i < env.length; i++) assert.ok(env[i].t > env[i - 1].t);
  assert.ok(env.every((p) => p.t >= 0 && p.t <= 10));
  assert.equal(env[0].gain, 0.28);
  assert.ok(env.some((p) => p.gain === 0.09));
  assert.deepEqual(duckEnvelope([], 10), [{ t: 0, gain: 0.28 }]);
});

test('subtitle font scales with output size', () => {
  assert.ok(subtitleFontPx('classic', 1080, 1920) > subtitleFontPx('classic', 720, 1280));
});
