import { ensureFont, glyphsOf } from "@/lib/captions/fonts";
import { cutsFor, frameSize } from "@/lib/captions/scene";
import type { Doc, VideoMeta } from "@/lib/captions/types";

export function standardFrameRate(meta: VideoMeta): number {
  return meta.fps >= 20 && meta.fps <= 30 ? Math.round(meta.fps) : 30;
}

export function exportPlan(doc: Doc, meta: VideoMeta, shortSide: number, fps: number) {
  const dimensions = frameSize(meta, doc.frame.aspect, shortSide);
  return {
    doc,
    cuts: cutsFor(doc, meta.duration),
    duration: meta.duration,
    ...dimensions,
    fps,
  };
}

export async function renderProject(file: Blob, plan: ReturnType<typeof exportPlan>, signal: AbortSignal, onProgress: (ratio: number) => void) {
  const { style, pages, fx } = plan.doc;
  const [{ exportVideo }] = await Promise.all([
    import("./export"),
    ensureFont(style.font, style.weight, style.italic, glyphsOf(pages) + fx.hook.text),
  ]);
  signal.throwIfAborted();
  return exportVideo({ ...plan, file, onProgress, signal });
}
