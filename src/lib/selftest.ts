/**
 * Development-only end-to-end check, never included in production builds.
 *
 *   /studio/?selftest=<clip url>[,<clip url>]&report=<url>[&aacfallback=1][&model=<id>]
 *
 * Captions each clip, exports it twice (baseline, then with every effect), re-reads
 * both files, samples frame colours to check orientation, and posts a JSON report.
 * `aacfallback=1` hides the browser's own audio encoder for the first export, to
 * prove the bundled AAC encoder works where native AAC encoding is missing.
 */
import { ALL_FORMATS, BlobSource, CanvasSink, Input } from "mediabunny";
import { cutsFor, frameSize } from "@/lib/captions/scene";
import { exportVideo } from "@/lib/media/export";
import { cutTotal } from "@/lib/media/timeline";
import { useStudio } from "@/lib/store";

type Rgb = number[];
const POINTS: [number, number][] = [
  [0.5, 0.12],
  [0.5, 0.88],
  [0.2, 0.3],
  [0.8, 0.3],
];

async function inspect(blob: Blob) {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    return {
      vcodec: v && (await v.getCodec()),
      w: v && (await v.getDisplayWidth()),
      h: v && (await v.getDisplayHeight()),
      vdur: v && +(await v.computeDuration()).toFixed(2),
      acodec: a && (await a.getCodec()),
      arate: a && (await a.getSampleRate()),
      ach: a && (await a.getNumberOfChannels()),
      adur: a && +(await a.computeDuration()).toFixed(2),
    };
  } finally {
    input.dispose();
  }
}

/** Colours at relative points of a frame, as the browser itself displays it (its own rotation handling is the reference). */
function sampleFrame(blob: Blob, t: number): Promise<Rgb[] | string> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(blob);
    const done = (result: Rgb[] | string) => {
      clearTimeout(timer);
      URL.revokeObjectURL(url);
      resolve(result);
    };
    const timer = setTimeout(() => done("timeout"), 20000);
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    video.onerror = () => done("error");
    video.onloadedmetadata = () => {
      video.currentTime = t;
    };
    video.onseeked = () => {
      const c = document.createElement("canvas");
      c.width = video.videoWidth;
      c.height = video.videoHeight;
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return done("no canvas");
      ctx.drawImage(video, 0, 0);
      done(POINTS.map(([x, y]) => Array.from(ctx.getImageData(Math.floor(x * c.width), Math.floor(y * c.height), 1, 1).data.slice(0, 3))));
    };
    video.src = url;
  });
}

/** Colours of an exported frame. Exports carry no rotation flag, so decoding them directly is a fair check. */
async function sampleExport(blob: Blob, t: number): Promise<Rgb[] | string> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryVideoTrack();
    const frame = track && (await new CanvasSink(track).getCanvas(t));
    if (!frame) return "no frame";
    const c = frame.canvas;
    const ctx = c.getContext("2d") as CanvasRenderingContext2D | null;
    if (!ctx) return "no canvas";
    return POINTS.map(([x, y]) => Array.from(ctx.getImageData(Math.floor(x * c.width), Math.floor(y * c.height), 1, 1).data.slice(0, 3)));
  } finally {
    input.dispose();
  }
}

function show(data: unknown) {
  let el = document.getElementById("selftest");
  if (!el) {
    el = document.createElement("pre");
    el.id = "selftest";
    el.style.cssText = "position:fixed;left:8px;bottom:8px;z-index:999;max-width:70vw;max-height:45vh;overflow:auto;background:#000d;color:#3dff7a;font:11px monospace;padding:8px;white-space:pre-wrap";
    document.body.appendChild(el);
  }
  el.textContent += `${JSON.stringify(data).slice(0, 500)}\n\n`;
}

/** React runs effects twice in development; two runs would cancel each other's work. */
let started = false;

export async function maybeRun() {
  const params = new URLSearchParams(location.search);
  const clips = params.get("selftest")?.split(",").filter(Boolean);
  if (!clips?.length || started) return;
  started = true;
  const report = params.get("report");
  const send = async (data: Record<string, unknown>) => {
    show(data);
    if (!report) return;
    const body = JSON.stringify({ browser: navigator.userAgent, isolated: self.crossOriginIsolated, ...data });
    await fetch(report, { method: "POST", mode: "no-cors", body, keepalive: body.length < 60000 }).catch(() => {});
  };
  const model = params.get("model");
  if (model) useStudio.setState({ model });
  let fallback = params.get("aacfallback") === "1";
  const global = window as unknown as { AudioEncoder?: unknown };

  for (const url of clips) {
    const name = url.split("/").pop() ?? "clip.mp4";
    try {
      const file = new File([await (await fetch(url)).blob()], name, { type: "video/mp4" });
      const started = performance.now();
      await useStudio.getState().load(file);
      const state = useStudio.getState();
      if (state.phase !== "ready" || !state.meta) {
        await send({ clip: name, stage: "caption", step: state.step, error: state.error ?? state.phase });
        continue;
      }
      const meta = state.meta;
      const captionMs = Math.round(performance.now() - started);
      const words = state.doc.pages.flatMap((p) => p.words);
      const exports: Record<string, unknown>[] = [];
      for (const mode of ["baseline", "effects"] as const) {
        if (mode === "effects") {
          const { setFx } = useStudio.getState();
          setFx("cuts", { enabled: true });
          setFx("zoom", { enabled: true });
          setFx("emoji", { enabled: true });
          setFx("hook", { enabled: true, text: "Self test" });
          setFx("progress", { enabled: true });
        }
        const doc = useStudio.getState().doc;
        const cuts = cutsFor(doc, meta.duration);
        const { width, height } = frameSize(meta, doc.frame.aspect, 1080);
        const saved = global.AudioEncoder;
        if (fallback) global.AudioEncoder = undefined;
        const t0 = performance.now();
        try {
          const blob = await exportVideo({ file, doc, duration: meta.duration, cuts, width, height, fps: 30, signal: new AbortController().signal, onProgress: () => {} });
          exports.push({
            mode,
            aacFallback: fallback,
            ms: Math.round(performance.now() - t0),
            mb: +(blob.size / 1048576).toFixed(2),
            expectedDur: +(meta.duration - cutTotal(cuts, meta.duration)).toFixed(2),
            ...(await inspect(blob)),
            colors: mode === "baseline" ? await sampleExport(blob, 0.5) : undefined,
          });
        } catch (error) {
          exports.push({ mode, aacFallback: fallback, error: String(error) });
        } finally {
          if (fallback) {
            global.AudioEncoder = saved;
            fallback = false;
          }
        }
      }
      await send({
        clip: name,
        meta,
        captionMs,
        wordCount: words.length,
        text: state.doc.pages.map((p) => p.words.map((w) => w.text).join(" ")).join(" | "),
        first: words[0],
        last: words[words.length - 1],
        sourceColors: await sampleFrame(file, 0.5),
        exports,
      });
    } catch (error) {
      await send({ clip: name, error: String(error) });
    }
    useStudio.getState().reset();
  }
  await send({ done: true });
}
