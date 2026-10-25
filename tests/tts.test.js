import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSsml, pickEdgeVoice, secMsGec, parseAudioFrame } from '../api/_lib/edgeTts.js';
import { pcmToWav, parseSampleRate } from '../api/_lib/geminiTts.js';
import { synthesize, TtsUnavailableError } from '../api/_lib/tts.js';

test('buildSsml escapes XML special characters', () => {
  const ssml = buildSsml({ text: `Tom & "Jerry" <3 it's`, voice: 'en-US-AriaNeural', locale: 'en-US' });
  assert.ok(ssml.includes('Tom &amp; &quot;Jerry&quot; &lt;3 it&apos;s'));
  assert.ok(!ssml.includes('<3'));
});

test('pickEdgeVoice selects by language and gender, defaulting to English', () => {
  assert.equal(pickEdgeVoice('bn', 'female').name, 'bn-BD-NabanitaNeural');
  assert.equal(pickEdgeVoice('bn', 'male').name, 'bn-BD-PradeepNeural');
  assert.equal(pickEdgeVoice('xx').name, 'en-US-AriaNeural');
});

test('secMsGec is a stable uppercase sha256 within a 5-minute window', () => {
  const t = Date.UTC(2026, 0, 1, 12, 0, 10);
  const a = secMsGec(t);
  assert.match(a, /^[0-9A-F]{64}$/);
  assert.equal(secMsGec(t + 60_000), a);
  assert.notEqual(secMsGec(t + 10 * 60_000), a);
});

test('parseAudioFrame extracts audio and ignores other frames', () => {
  const header = Buffer.from('X-RequestId:1\r\nPath:audio\r\n');
  const len = Buffer.alloc(2);
  len.writeUInt16BE(header.length);
  const frame = Buffer.concat([len, header, Buffer.from([1, 2, 3])]);
  assert.deepEqual([...parseAudioFrame(frame)], [1, 2, 3]);

  const other = Buffer.from('Path:turn.start\r\n');
  const len2 = Buffer.alloc(2);
  len2.writeUInt16BE(other.length);
  assert.equal(parseAudioFrame(Buffer.concat([len2, other, Buffer.from([9])])), null);
  assert.equal(parseAudioFrame(Buffer.alloc(1)), null);
});

test('pcmToWav writes a valid 44-byte header', () => {
  const pcm = Buffer.alloc(48000); // 1s at 24kHz 16-bit mono
  const wav = pcmToWav(pcm, 24000);
  assert.equal(wav.length, 44 + pcm.length);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.equal(wav.readUInt32LE(24), 24000);
  assert.equal(wav.readUInt32LE(28), 48000);
  assert.equal(wav.readUInt32LE(40), pcm.length);
});

test('parseSampleRate reads the rate from the mime type', () => {
  assert.equal(parseSampleRate('audio/L16;codec=pcm;rate=16000'), 16000);
  assert.equal(parseSampleRate(''), 24000);
});

test('synthesize falls back when the first provider fails', async () => {
  const providers = [
    { name: 'a', mime: 'audio/mpeg', run: async () => { throw new Error('boom'); } },
    { name: 'b', mime: 'audio/wav', run: async () => Buffer.from([1]) },
  ];
  const out = await synthesize({}, providers);
  assert.equal(out.provider, 'b');
  assert.equal(out.mime, 'audio/wav');
});

test('synthesize treats empty audio as failure and throws when all fail', async () => {
  const providers = [
    { name: 'a', mime: 'x', run: async () => Buffer.alloc(0) },
    { name: 'b', mime: 'x', run: async () => { throw new Error('no'); } },
  ];
  await assert.rejects(() => synthesize({}, providers), TtsUnavailableError);
});
