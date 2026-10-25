import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requireString, requireLanguage, ValidationError, parseBody } from '../api/_lib/validate.js';

test('requireString trims and accepts valid input', () => {
  assert.equal(requireString('  hello  ', { field: 'x', maxLen: 10 }), 'hello');
});

test('requireString rejects empty string', () => {
  assert.throws(() => requireString('   ', { field: 'x', maxLen: 10 }), ValidationError);
});

test('requireString rejects too-long input', () => {
  assert.throws(() => requireString('a'.repeat(300), { field: 'topic', maxLen: 200 }), ValidationError);
});

test('requireString rejects non-string', () => {
  assert.throws(() => requireString(42, { field: 'x', maxLen: 10 }), ValidationError);
});

test('requireLanguage accepts bn and en', () => {
  assert.equal(requireLanguage('bn'), 'bn');
  assert.equal(requireLanguage('EN'), 'en');
});

test('requireLanguage rejects unsupported language', () => {
  assert.throws(() => requireLanguage('fr'), ValidationError);
});

test('parseBody passes through object bodies', () => {
  assert.deepEqual(parseBody({ body: { a: 1 } }), { a: 1 });
});

test('parseBody parses string JSON bodies', () => {
  assert.deepEqual(parseBody({ body: '{"a":1}' }), { a: 1 });
});

test('parseBody rejects invalid JSON strings', () => {
  assert.throws(() => parseBody({ body: '{not json' }), ValidationError);
});

test('parseBody returns empty object for missing body', () => {
  assert.deepEqual(parseBody({ body: null }), {});
});
