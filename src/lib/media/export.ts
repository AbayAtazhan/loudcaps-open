import {
  ALL_FORMATS,
  AudioBufferSink,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Input,
  type InputAudioTrack,
  type InputVideoTrack,
  Mp4OutputFormat,
  Output,
  Quality,
  VideoSampleSink,
  canEncodeAudio,
  getFirstEncodableVideoCodec,
} from "mediabunny";
import { renderScene } from "@/lib/captions/scene";
import type { Cut, Doc } from "@/lib/captions/types";
import { cutTotal, keptRanges, toSourceTime } from "./timeline";

export type ExportOptions = {
  file: Blob;
  doc: Doc;
  duration: number;
  cuts: Cut[];
  width: number;
  height: number;
  fps: number;
  onProgress: (ratio: number) => void;
  signal: AbortSignal;
};

const cancelled = () => new DOMException("Export cancelled", "AbortError");
/** Fade applied at every cut so jump cuts don't click. */
const FADE = 0.006;

/**
 * Renders the document to an H.264/AAC MP4 entirely in the browser: frames are
 * decoded, painted with captions on a canvas, re-encoded with the device's
 * hardware encoder and muxed. Nothing is uploaded.
 */
export async function exportVideo(o: ExportOptions): Promise<Blob> {
  const { width: W, height: H, fps, cuts, signal } = o;
  const input = new Input({ source: new BlobSource(o.file), formats: ALL_FORMATS });
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target });

  try {
    const video = await input.getPrimaryVideoTrack();
    if (!video) throw new Error("No video track found.");
    const audio = await input.getPrimaryAudioTrack();

    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("Could not create a drawing surface for the export.");

    const quality = new Quality({ bitrate: Math.round(W * H * 0.1 * 30 * (fps / 30) ** 0.6) });
    const codec = await getFirstEncodableVideoCodec(["avc"], { width: W, height: H, quality, frameRate: fps });
    if (!codec) {
      throw new Error(
        "This browser can't encode H.264 video at this size. Pick a lower resolution, or use a recent Chrome, Edge or Safari.",
      );
    }
    const videoSource = new CanvasSource(canvas, { codec, quality, keyFrameInterval: 2 });
    output.addVideoTrack(videoSource, { frameRate: fps });

    let audioSource: AudioBufferSource | null = null;
    if (audio && (await audio.canDecode())) {
      if (!(await canEncodeAudio("aac"))) {
        const { registerAacEncoder } = await import("@mediabunny/aac-encoder");
        registerAacEncoder();
      }
      // Always write 48 kHz stereo: every AAC encoder and every platform accepts it,
      // whereas mono or low-rate sources (voice memos, screen recordings) are often refused.
      audioSource = new AudioBufferSource({
        codec: "aac",
        quality: new Quality({ bitrate: 160_000 }),
        transform: { sampleRate: 48_000, numberOfChannels: 2 },
      });
      output.addAudioTrack(audioSource);
    }

    await output.start();
    const outDuration = Math.max(1 / fps, o.duration - cutTotal(cuts, o.duration));
    // Both tracks must be fed side by side: each `add` waits for the other track to keep up.
    await Promise.all([
      writeVideo(video, videoSource, ctx, o, outDuration),
      audio && audioSource ? writeAudio(audio, audioSource, keptRanges(cuts, o.duration), signal) : null,
    ]);
    await output.finalize();
    if (!target.buffer) throw new Error("The export produced no data.");
    return new Blob([target.buffer], { type: "video/mp4" });
  } catch (error) {
    await output.cancel().catch(() => {});
    throw error;
  } finally {
    input.dispose();
  }
}

async function writeVideo(
  track: InputVideoTrack,
  source: CanvasSource,
  ctx: CanvasRenderingContext2D,
  o: ExportOptions,
  outDuration: number,
) {
  const { width: W, height: H, fps, cuts, doc } = o;
  const frames = Math.max(1, Math.round(outDuration * fps));
  const first = await track.getFirstTimestamp();
  const sourceTime = (i: number) => Math.max(first, toSourceTime(cuts, i / fps));
  function* stamps() {
    for (let i = 0; i < frames; i++) yield sourceTime(i);
  }
  let i = 0;
  for await (const sample of new VideoSampleSink(track).samplesAtTimestamps(stamps())) {
    if (o.signal.aborted) {
      sample?.close();
      throw cancelled();
    }
    const tOut = i / fps;
    renderScene(
      ctx,
      sample && {
        width: sample.displayWidth,
        height: sample.displayHeight,
        draw: (c, sx, sy, sw, sh, dx, dy, dw, dh) => sample.draw(c, sx, sy, sw, sh, dx, dy, dw, dh),
      },
      W,
      H,
      sourceTime(i),
      tOut,
      outDuration,
      doc,
    );
    sample?.close();
    await source.add(tOut, 1 / fps);
    i++;
    if (i % 4 === 0 || i === frames) o.onProgress(i / frames);
  }
  source.close();
}

function silence(seconds: number, rate: number, channels: number): AudioBuffer {
  return new AudioBuffer({ length: Math.max(1, Math.round(seconds * rate)), numberOfChannels: channels, sampleRate: rate });
}

function slice(buffer: AudioBuffer, from: number, to: number, fadeIn: boolean, fadeOut: boolean): AudioBuffer {
  if (from === 0 && to === buffer.length && !fadeIn && !fadeOut) return buffer;
  const out = new AudioBuffer({ length: to - from, numberOfChannels: buffer.numberOfChannels, sampleRate: buffer.sampleRate });
  const ramp = Math.min(out.length, Math.round(FADE * buffer.sampleRate));
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c).slice(from, to);
    if (fadeIn) for (let i = 0; i < ramp; i++) data[i] *= i / ramp;
    if (fadeOut) for (let i = 0; i < ramp; i++) data[data.length - 1 - i] *= i / ramp;
    out.copyToChannel(data, c);
  }
  return out;
}

async function writeAudio(track: InputAudioTrack, source: AudioBufferSource, kept: Cut[], signal: AbortSignal) {
  const sink = new AudioBufferSink(track);
  let rate = await track.getSampleRate();
  let channels = await track.getNumberOfChannels();
  for (let k = 0; k < kept.length; k++) {
    const range = kept[k];
    let at = range.start;
    for await (const { buffer, timestamp } of sink.buffers(range.start, range.end)) {
      if (signal.aborted) throw cancelled();
      rate = buffer.sampleRate;
      channels = buffer.numberOfChannels;
      const from = Math.max(at, timestamp);
      const to = Math.min(range.end, timestamp + buffer.length / rate);
      if (to <= from) continue;
      // Keep audio locked to the picture: fill any hole in the source with silence.
      if (from - at > 0.002) await source.add(silence(from - at, rate, channels));
      const a = Math.max(0, Math.round((from - timestamp) * rate));
      const b = Math.min(buffer.length, Math.round((to - timestamp) * rate));
      if (b > a) {
        const startsRange = from - range.start < 0.001 && k > 0;
        const endsRange = range.end - to < 0.001 && k < kept.length - 1;
        await source.add(slice(buffer, a, b, startsRange, endsRange));
      }
      at = to;
    }
    if (range.end - at > 0.002) await source.add(silence(range.end - at, rate, channels));
  }
  source.close();
}
