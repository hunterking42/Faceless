import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/clone.js';

const realFetch = globalThis.fetch;
let n = 0;
const mkReq = (method, body, query = {}) => ({ method, body, query, headers: { 'x-forwarded-for': `10.0.0.${++n}` } });
function mkRes() {
  return {
    code: 0, headers: {}, payload: undefined,
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.code = c; return this; },
    json(o) { this.payload = o; return this; },
    send(b) { this.payload = b; return this; },
  };
}
const good = () => ({ text: 'Hello there', language: 'en', consent: true, mime: 'audio/webm;codecs=opus', sample: Buffer.from('abc').toString('base64') });

beforeEach(() => { process.env.HF_SPACE_URL = 'https://space.example'; process.env.HF_TOKEN = 'hf_secret'; });
afterEach(() => { globalThis.fetch = realFetch; delete process.env.HF_SPACE_URL; delete process.env.HF_TOKEN; });

test('rejects without explicit consent', async () => {
  for (const consent of [undefined, false, 'true', 1]) {
    const res = mkRes();
    await handler(mkReq('POST', { ...good(), consent }), res);
    assert.equal(res.code, 400);
    assert.match(res.payload.error, /permission/);
  }
});

test('validates method, text length, mime, base64 and size', async () => {
  let res = mkRes(); await handler(mkReq('PUT', {}), res); assert.equal(res.code, 405);
  res = mkRes(); await handler(mkReq('POST', { ...good(), text: 'x'.repeat(301) }), res); assert.equal(res.code, 400);
  res = mkRes(); await handler(mkReq('POST', { ...good(), mime: 'video/mp4' }), res); assert.equal(res.code, 400);
  res = mkRes(); await handler(mkReq('POST', { ...good(), sample: 'not base64!!' }), res); assert.equal(res.code, 400);
  res = mkRes(); await handler(mkReq('POST', { ...good(), sample: Buffer.alloc(3_000_001).toString('base64') }), res); assert.equal(res.code, 400);
});

test('503 with a clear message when the Space is not configured', async () => {
  delete process.env.HF_SPACE_URL;
  const res = mkRes(); await handler(mkReq('POST', good()), res);
  assert.equal(res.code, 503);
  assert.match(res.payload.error, /not configured/);
});

test('forwards to the Space with the token and returns audio', async () => {
  let seen;
  globalThis.fetch = async (url, opts) => { seen = { url, opts }; return new Response(Buffer.from([7, 8, 9]), { status: 200 }); };
  const res = mkRes(); await handler(mkReq('POST', good()), res);
  assert.equal(res.code, 200);
  assert.equal(res.headers['Content-Type'], 'audio/wav');
  assert.deepEqual([...res.payload], [7, 8, 9]);
  assert.equal(seen.url, 'https://space.example/clone');
  assert.equal(seen.opts.headers.Authorization, 'Bearer hf_secret');
  assert.equal(seen.opts.body.get('language'), 'en');
});

test('maps upstream failures without leaking upstream bodies or the token', async () => {
  const cases = [[422, 422, /not supported/], [503, 503, /busy/], [500, 502, /failed/]];
  for (const [up, code, re] of cases) {
    globalThis.fetch = async () => new Response('secret upstream detail hf_secret', { status: up });
    const res = mkRes(); await handler(mkReq('POST', good()), res);
    assert.equal(res.code, code);
    assert.match(res.payload.error, re);
    assert.ok(!JSON.stringify(res.payload).includes('hf_secret'));
  }
  globalThis.fetch = async () => { throw new Error('timeout hf_secret'); };
  const res = mkRes(); await handler(mkReq('POST', good()), res);
  assert.equal(res.code, 503);
  assert.ok(!JSON.stringify(res.payload).includes('hf_secret'));
});

test('wake reports readiness', async () => {
  globalThis.fetch = async () => new Response('ok', { status: 200 });
  let res = mkRes(); await handler(mkReq('GET'), res);
  assert.deepEqual(res.payload, { ready: true });
  globalThis.fetch = async () => { throw new Error('sleeping'); };
  res = mkRes(); await handler(mkReq('GET'), res);
  assert.deepEqual(res.payload, { ready: false });
});
