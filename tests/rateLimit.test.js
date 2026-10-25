import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rateLimit } from '../api/_lib/rateLimit.js';

test('rateLimit allows requests under the max', () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < 3; i++) {
    const result = rateLimit(key, { max: 3, windowMs: 60_000 });
    assert.equal(result.allowed, true);
  }
});

test('rateLimit blocks requests over the max', () => {
  const key = `test-${Math.random()}`;
  for (let i = 0; i < 3; i++) rateLimit(key, { max: 3, windowMs: 60_000 });
  const result = rateLimit(key, { max: 3, windowMs: 60_000 });
  assert.equal(result.allowed, false);
  assert.ok(result.retryAfterSec > 0);
});
