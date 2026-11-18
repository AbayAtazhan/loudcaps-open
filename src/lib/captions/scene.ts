import { planCuts } from "./cuts";
import { emojiPicker } from "./emoji";
import { zoomAt } from "./zoom";
import { type Ctx2D, type FrameSource, drawCaptions, drawHook, drawProgress, drawVideo } from "./render";
import type { Aspect, Cut, Doc, Effects, Frame, VideoMeta } from "./types";

export const DEFAULT_FX: Effects = {
  emoji: { enabled: false, size: 1.4 },
  hook: { enabled: false, text: "", duration: 3, color: "#0B0B0B", background: "#FFE600" },
  progress: { enabled: false, color: "#FFE600", position: "bottom" },
  zoom: { enabled: false, intensity: 0.5, smooth: true },
  cuts: { enabled: false, pace: "fast" },
};

export const DEFAULT_FRAME: Frame = { aspect: "source", fit: "cover", panX: 0, panY: 0 };

const NO_CUTS: Cut[] = [];

export function cutsFor(doc: Doc, duration: number): Cut[] {
  return doc.fx.cuts.enabled ? planCuts(doc.pages, duration, doc.fx.cuts.pace) : NO_CUTS;
}

/** Paints one complete frame: video, effects and captions. Shared by preview and export. */
export function renderScene(
  ctx: Ctx2D,
  source: FrameSource | null,
  W: number,
  H: number,
  tSource: number,
  tOutput: number,
  outDuration: number,
  doc: Doc,
): void {
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
  if (source) drawVideo(ctx, source, W, H, doc.frame, doc.fx.zoom.enabled ? zoomAt(doc.pages, doc.fx.zoom, tSource) : 1);
  drawProgress(ctx, W, H, outDuration > 0 ? tOutput / outDuration : 0, doc.fx.progress);
  drawHook(ctx, W, H, tOutput, doc.fx.hook, doc.style);
  drawCaptions(
    ctx,
    W,
    H,
    tSource - doc.offset,
    doc.pages,
    doc.style,
    doc.fx.emoji.enabled ? emojiPicker(doc.pages) : undefined,
    doc.fx.emoji.size,
  );
}

const RATIOS: Record<Exclude<Aspect, "source">, number> = { "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1, "16:9": 16 / 9 };

export function aspectRatio(meta: Pick<VideoMeta, "width" | "height">, aspect: Aspect): number {
  return aspect === "source" ? meta.width / Math.max(1, meta.height) : RATIOS[aspect];
}

/** Output dimensions for a given short side (720, 1080, 2160), rounded to even numbers as encoders require. */
export function frameSize(meta: Pick<VideoMeta, "width" | "height">, aspect: Aspect, shortSide: number) {
  const ratio = aspectRatio(meta, aspect);
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  return ratio <= 1
    ? { width: even(shortSide), height: even(shortSide / ratio) }
    : { width: even(shortSide * ratio), height: even(shortSide) };
}
