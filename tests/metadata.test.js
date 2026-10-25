import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMetadata, isValidMetadata, buildMetadataPrompt, META_LIMITS } from '../api/_lib/metadata.js';
import { buildCredits, composeDescription } from '../public/js/credits.js';
import handler from '../api/metadata.js';

function fakeRes() {
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
  return res;
}

test('isValidMetadata checks required fields', () => {
  assert.equal(isValidMetadata({ title: 'a', description: 'b', tags: [] }), true);
  assert.equal(isValidMetadata({ title: '', description: 'b', tags: [] }), false);
  assert.equal(isValidMetadata({ title: 'a', description: 'b' }), false);
  assert.equal(isValidMetadata(null), false);
});

test('normalizeMetadata enforces title, tag and hashtag limits', () => {
  const out = normalizeMetadata({
    title: 'x'.repeat(300),
    description: 'd',
    tags: ['#Space', 'space', ' Mars  rover ', '', 'y'.repeat(100), ...Array.from({ length: 40 }, (_, i) => `tag${i}`)],
    hashtags: ['space', '#Mars', '#a b', '#four', '#five'],
  });
  assert.equal(Array.from(out.title).length, META_LIMITS.titleMax);
  assert.equal(out.tags[0], 'Space');
  assert.ok(!out.tags.slice(1).some((t) => t.toLowerCase() === 'space'));
  assert.ok(out.tags.includes('Mars rover'));
  assert.ok(out.tags.every((t) => Array.from(t).length <= META_LIMITS.tagMax));
  assert.ok(out.tags.length <= META_LIMITS.tagCountMax);
  assert.deepEqual(out.hashtags, ['#space', '#Mars', '#ab']);
});

test('normalizeMetadata counts Bengali by characters, not UTF-16 units', () => {
  const out = normalizeMetadata({ title: 'ক'.repeat(150), description: 'ঠিক', tags: [] });
  assert.equal(Array.from(out.title).length, META_LIMITS.titleMax);
});

test('prompt carries the language and forbids invented facts', () => {
  const { user } = buildMetadataPrompt({ title: 'T', language: 'bn', narration: 'n' });
  assert.match(user, /Bengali/);
  assert.match(user, /Do not add facts/);
});

test('buildCredits dedupes photographers and adds AI disclosure', () => {
  const scenes = [
    { media: { photographer: 'Ann', pexelsUrl: 'https://pexels.com/a' } },
    { media: { photographer: 'Ann', pexelsUrl: 'https://pexels.com/a' } },
    { media: { photographer: 'Bo', pexelsUrl: 'https://pexels.com/b' } },
    { media: null },
  ];
  const text = buildCredits(scenes);
  assert.equal(text.match(/Ann/g).length, 1);
  assert.match(text, /Bo/);
  assert.match(text, /AI tools/);
  assert.equal(buildCredits([{ media: null }], { includeAiDisclosure: false }), '');
});

test('composeDescription skips empty parts', () => {
  assert.equal(composeDescription({ description: ' hi ', hashtags: ['#a', '#b'], credits: '' }), 'hi\n\n#a #b');
});

test('/api/metadata rejects bad method and bad input without calling an LLM', async () => {
  let res = fakeRes();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.code, 405);

  res = fakeRes();
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '9.9.9.1' }, body: { title: 'T', language: 'fr', scenes: ['a'] } }, res);
  assert.equal(res.code, 400);

  res = fakeRes();
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '9.9.9.2' }, body: { title: 'T', language: 'en', scenes: [] } }, res);
  assert.equal(res.code, 400);

  res = fakeRes();
  await handler({ method: 'POST', headers: { 'x-forwarded-for': '9.9.9.3' }, body: { title: 'T', language: 'en', scenes: [123] } }, res);
  assert.equal(res.code, 400);
});
