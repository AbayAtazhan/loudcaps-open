import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from "mediabunny";
import type { VideoMeta, Word } from "@/lib/captions/types";
import { PEAK_RATE } from "@/lib/project";

/** Sample rate the speech model expects. */
export const SPEECH_RATE = 16000;

export async function probe(file: File): Promise<VideoMeta> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const video = await input.getPrimaryVideoTrack().catch(() => null);
    if (!video) throw new Error("That file doesn't look like a video LoudCaps can read. Try an MP4, MOV or WebM.");
    if (!(await video.canDecode())) {
      throw new Error("Your browser can't decode this video's codec. Re-export it as an H.264 MP4 and try again.");
    }
    const audio = await input.getPrimaryAudioTrack();
    const [width, height, duration, fps] = await Promise.all([
      video.getDisplayWidth(),
      video.getDisplayHeight(),
      input.computeDuration(),
      video
        .computeFrameRateMetrics()
        .then((m) => m.bestGuessFrameRate)
        .catch(() => 30),
    ]);
    return {
      name: file.name,
      size: file.size,
      width,
      height,
      duration,
      fps: fps > 0 ? fps : 30,
      hasAudio: !!audio && (await audio.canDecode()),
    };
  } finally {
    input.dispose();
  }
}

async function resample(block: Float32Array<ArrayBuffer>, rate: number): Promise<Float32Array> {
  if (rate === SPEECH_RATE) return block;
  const length = Math.max(1, Math.round((block.length * SPEECH_RATE) / rate));
  const offline = new OfflineAudioContext(1, length, SPEECH_RATE);
  const buffer = offline.createBuffer(1, block.length, rate);
  buffer.copyToChannel(block, 0);
  const node = offline.createBufferSource();
  node.buffer = buffer;
  node.connect(offline.destination);
  node.start();
  return (await offline.startRendering()).getChannelData(0);
}

/**
 * Decodes the audio track to 16 kHz mono for the speech model. Samples are placed
 * by their timestamps, so the result stays in sync with the video even when the
 * audio track starts late.
 */
export async function extractAudio(
  file: File,
  onProgress: (ratio: number) => void,
  signal: AbortSignal,
): Promise<{ samples: Float32Array<ArrayBuffer>; peaks: Float32Array<ArrayBuffer> }> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) throw new Error("This video has no audio track, so there is nothing to caption.");
    const duration = Math.max(await input.computeDuration(), 0.1);
    const samples = new Float32Array(Math.ceil((duration + 0.5) * SPEECH_RATE));

    let parts: Float32Array[] = [];
    let partLength = 0;
    let blockStart = 0;
    let rate = 0;
    const flush = async () => {
      if (!partLength) return;
      const block = new Float32Array(partLength);
      let at = 0;
      for (const p of parts) {
        block.set(p, at);
        at += p.length;
      }
      const out = await resample(block, rate);
      const offset = Math.max(0, Math.round(blockStart * SPEECH_RATE));
      samples.set(out.subarray(0, Math.max(0, samples.length - offset)), Math.min(offset, samples.length));
      parts = [];
      partLength = 0;
    };

    for await (const { buffer, timestamp } of new AudioBufferSink(track).buffers()) {
      if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
      if (buffer.sampleRate !== rate || !partLength) {
        await flush();
        rate = buffer.sampleRate;
        blockStart = timestamp;
      }
      const mono = new Float32Array(buffer.length);
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const data = buffer.getChannelData(c);
        for (let i = 0; i < data.length; i++) mono[i] += data[i];
      }
      if (buffer.numberOfChannels > 1) for (let i = 0; i < mono.length; i++) mono[i] /= buffer.numberOfChannels;
      parts.push(mono);
      partLength += mono.length;
      // Resample in 20-second blocks to keep memory flat on long videos.
      if (partLength >= rate * 20) await flush();
      onProgress(Math.min(1, (timestamp + buffer.duration) / duration));
    }
    await flush();

    const hop = SPEECH_RATE / PEAK_RATE;
    const peaks = new Float32Array(Math.ceil(samples.length / hop));
    for (let i = 0; i < peaks.length; i++) {
      let max = 0;
      const end = Math.min(samples.length, (i + 1) * hop);
      for (let j = i * hop; j < end; j++) {
        const v = Math.abs(samples[j]);
        if (v > max) max = v;
      }
      peaks[i] = max;
    }
    return { samples, peaks };
  } finally {
    input.dispose();
  }
}

/**
 * Speech models tend to stretch a word across the silence that follows it. This
 * trims each word to where sound is actually present, which makes pauses visible
 * to the jump-cut planner and stops captions hanging around after speech ends.
 */
export function tightenWords(words: Word[], peaks: Float32Array): Word[] {
  if (!peaks.length) return words;
  const sorted = Float32Array.from(peaks).sort();
  const loud = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const threshold = Math.max(0.008, loud * 0.1);
  const minFrames = 3;
  /** Shortest a word may be on screen; anything briefer flashes instead of reading. */
  const minLength = 0.14;
  const out: Word[] = [];
  for (const word of words) {
    let a = Math.max(0, Math.floor(word.start * PEAK_RATE));
    let b = Math.min(peaks.length, Math.ceil(word.end * PEAK_RATE));
    while (b - a > minFrames && peaks[b - 1] < threshold) b--;
    while (b - a > minFrames && peaks[a] < threshold) a++;
    let start = Math.max(word.start, a / PEAK_RATE);
    const end = Math.min(word.end, b / PEAK_RATE);
    if (end - start < 0.05) {
      out.push(word);
      continue;
    }
    // The model often marks a phrase's last word late; pull its start back rather than let it flash.
    if (end - start < minLength) start = Math.max(out[out.length - 1]?.end ?? 0, end - minLength);
    out.push({ ...word, start, end });
  }
  return out;
}
