// Builds the audio track for a render: narration scheduled on the timeline plus
// optional music, mixed into a MediaStream that MediaRecorder records alongside
// the canvas. Callers never learn which voice mode produced a scene's audio.
import { duckEnvelope } from './ducking.js';

async function decode(ctx, url) {
  const buf = await (await fetch(url)).arrayBuffer();
  return ctx.decodeAudioData(buf);
}

/**
 * @param {AudioContext} ctx
 * @param {{start:number,end:number,duration:number,scene:object,hasVoice:boolean}[]} items
 * @param {number} total
 * @param {{ musicBlob?: Blob|null, musicVolume?: number, duck?: boolean }} options
 * @returns {Promise<{ stream: MediaStream, start: (when:number)=>void, stop: ()=>void }>}
 */
export async function createAudioMixer(ctx, items, total, { musicBlob = null, musicVolume = 1, duck = true } = {}) {
  const dest = ctx.createMediaStreamDestination();
  const master = ctx.createGain();
  master.connect(dest);

  const voices = [];
  for (const item of items) {
    if (!item.hasVoice) continue;
    voices.push({ item, buffer: await decode(ctx, item.scene.audio.blobUrl) });
  }

  let music = null;
  if (musicBlob) {
    const buffer = await ctx.decodeAudioData(await musicBlob.arrayBuffer());
    music = { buffer };
  }

  const sources = [];
  const lastItem = items[items.length - 1];

  return {
    stream: dest.stream,
    /** Schedules everything relative to `when` (an AudioContext time). */
    start(when) {
      for (const { item, buffer } of voices) {
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(master);
        src.start(when + item.start);
        sources.push(src);
      }
      if (music) {
        const src = ctx.createBufferSource();
        src.buffer = music.buffer;
        src.loop = true;
        const gain = ctx.createGain();
        const points = duck
          ? duckEnvelope(voices.map(({ item }) => ({ start: item.start, end: item.start + item.scene.audio.durationSec })), total)
          : [{ t: 0, gain: 0.28 }];
        gain.gain.setValueAtTime(points[0].gain * musicVolume, when);
        for (const p of points.slice(1)) gain.gain.linearRampToValueAtTime(p.gain * musicVolume, when + p.t);
        src.connect(gain).connect(master);
        src.start(when);
        sources.push(src);
      }
      // Short fade-out so the file doesn't end on a hard click.
      if (lastItem) {
        const tailStart = total - Math.min(0.35, lastItem.duration / 3);
        master.gain.setValueAtTime(1, when + tailStart);
        master.gain.linearRampToValueAtTime(0, when + total);
      }
    },
    stop() {
      for (const s of sources) {
        try {
          s.stop();
        } catch {
          /* already stopped */
        }
      }
      sources.length = 0;
      master.disconnect();
    },
  };
}
