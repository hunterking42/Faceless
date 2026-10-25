import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitIntoChunks, buildCues, cueAt, estimateDuration } from '../public/js/render/subtitles.js';

test('splits on English and Bengali sentence ends', () => {
  const chunks = splitIntoChunks('Hello there. How are you? আমি ভালো আছি। তুমি কেমন আছো?');
  assert.deepEqual(chunks.map((c) => c.text), ['Hello there.', 'How are you?', 'আমি ভালো আছি।', 'তুমি কেমন আছো?']);
});

test('long sentences are split into balanced chunks', () => {
  const chunks = splitIntoChunks('one two three four five six seven eight nine ten', 7);
  assert.equal(chunks.length, 2);
  assert.deepEqual(chunks.map((c) => c.text.split(' ').length), [5, 5]);
});

test('cues are contiguous and span the full duration', () => {
  const cues = buildCues('Space is big. Really, really big and very very empty indeed my friend.', 6);
  assert.equal(cues[0].start, 0);
  assert.equal(cues.at(-1).end, 6);
  for (let i = 1; i < cues.length; i++) assert.equal(cues[i].start, cues[i - 1].end);
});

test('longer chunks get more time', () => {
  const cues = buildCues('Hi. This sentence is considerably longer than the first.', 10);
  assert.ok(cues[1].end - cues[1].start > cues[0].end - cues[0].start);
});

test('empty text or zero duration yields no cues', () => {
  assert.deepEqual(buildCues('', 5), []);
  assert.deepEqual(buildCues('Hello', 0), []);
});

test('cueAt finds the active cue', () => {
  const cues = buildCues('First part. Second part.', 4);
  assert.equal(cueAt(cues, 0.1).text, 'First part.');
  assert.equal(cueAt(cues, 3.9).text, 'Second part.');
  assert.equal(cueAt(cues, 4), null);
});

test('estimateDuration has a floor and is slower for Bengali', () => {
  assert.equal(estimateDuration('Hi', 'en'), 1.5);
  const text = 'one two three four five six seven eight nine ten';
  assert.ok(estimateDuration(text, 'bn') > estimateDuration(text, 'en'));
});
