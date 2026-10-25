import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripCodeFences } from '../api/_lib/llm.js';

test('stripCodeFences removes ```json fences', () => {
  const input = '```json\n{"a":1}\n```';
  assert.equal(stripCodeFences(input), '{"a":1}');
});

test('stripCodeFences removes bare ``` fences', () => {
  const input = '```\n{"a":1}\n```';
  assert.equal(stripCodeFences(input), '{"a":1}');
});

test('stripCodeFences leaves unfenced JSON untouched', () => {
  const input = '{"a":1}';
  assert.equal(stripCodeFences(input), '{"a":1}');
});

test('stripCodeFences trims surrounding whitespace', () => {
  const input = '  \n{"a":1}\n  ';
  assert.equal(stripCodeFences(input), '{"a":1}');
});
