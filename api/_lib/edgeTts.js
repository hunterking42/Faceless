// Edge TTS over the Read Aloud websocket. This is an unofficial endpoint and
// may break or block datacenter IPs (CLAUDE.md §10), so /api/tts falls back
// to Gemini TTS when this fails.
import { createHash, randomUUID } from 'node:crypto';

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const CHROMIUM_VERSION = '130.0.2849.68';
const WS_URL = 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1';
const OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';
const TIMEOUT_MS = 15_000;

export const EDGE_VOICES = {
  bn: { female: 'bn-BD-NabanitaNeural', male: 'bn-BD-PradeepNeural', locale: 'bn-BD' },
  en: { female: 'en-US-AriaNeural', male: 'en-US-GuyNeural', locale: 'en-US' },
};

export function pickEdgeVoice(language, gender = 'female') {
  const set = EDGE_VOICES[language] || EDGE_VOICES.en;
  return { name: gender === 'male' ? set.male : set.female, locale: set.locale };
}

function escapeXml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSsml({ text, voice, locale }) {
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
    `<voice name='${voice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeXml(text)}</prosody></voice>` +
    `</speak>`
  );
}

// The service rejects requests without a time-windowed token (5-minute buckets,
// Windows file-time ticks).
export function secMsGec(nowMs = Date.now()) {
  const WIN_EPOCH_OFFSET_SEC = 11644473600;
  let seconds = Math.floor(nowMs / 1000) + WIN_EPOCH_OFFSET_SEC;
  seconds -= seconds % 300;
  const ticks = BigInt(seconds) * 10_000_000n;
  return createHash('sha256').update(`${ticks}${TRUSTED_CLIENT_TOKEN}`, 'ascii').digest('hex').toUpperCase();
}

/** Returns the audio payload of a binary frame, or null for non-audio frames. */
export function parseAudioFrame(buf) {
  if (buf.length < 2) return null;
  const headerLen = buf.readUInt16BE(0);
  if (buf.length < 2 + headerLen) return null;
  const headers = buf.subarray(2, 2 + headerLen).toString('utf8');
  if (!headers.includes('Path:audio')) return null;
  return buf.subarray(2 + headerLen);
}

function timestamp() {
  return new Date().toISOString();
}

/** @returns {Promise<Buffer>} MP3 audio */
export async function synthesizeEdge({ text, language, gender }) {
  const { default: WebSocket } = await import('ws');
  const { name, locale } = pickEdgeVoice(language, gender);
  const connectionId = randomUUID().replace(/-/g, '');
  const url =
    `${WS_URL}?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&ConnectionId=${connectionId}` +
    `&Sec-MS-GEC=${secMsGec()}&Sec-MS-GEC-Version=1-${CHROMIUM_VERSION}`;

  return new Promise((resolve, reject) => {
    const chunks = [];
    let settled = false;
    const ws = new WebSocket(url, {
      headers: {
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
        Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
        'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_VERSION.split('.')[0]}.0.0.0 Safari/537.36 Edg/${CHROMIUM_VERSION.split('.')[0]}.0.0.0`,
      },
    });

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* already closed */
      }
      err ? reject(err) : resolve(value);
    };

    const timer = setTimeout(() => finish(new Error('Edge TTS timed out')), TIMEOUT_MS);

    ws.on('open', () => {
      const config = { context: { synthesis: { audio: {
        metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' },
        outputFormat: OUTPUT_FORMAT,
      } } } };
      ws.send(
        `X-Timestamp:${timestamp()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${JSON.stringify(config)}\r\n`
      );
      ws.send(
        `X-RequestId:${randomUUID().replace(/-/g, '')}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${timestamp()}Z\r\nPath:ssml\r\n\r\n` +
          buildSsml({ text, voice: name, locale })
      );
    });

    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        const audio = parseAudioFrame(Buffer.from(data));
        if (audio && audio.length) chunks.push(audio);
      } else if (data.toString().includes('Path:turn.end')) {
        const audio = Buffer.concat(chunks);
        audio.length ? finish(null, audio) : finish(new Error('Edge TTS returned no audio'));
      }
    });

    ws.on('error', (err) => finish(err));
    ws.on('close', () => finish(new Error('Edge TTS connection closed early')));
  });
}
