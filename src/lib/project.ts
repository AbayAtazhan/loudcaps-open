import { defaultModel, transcribe } from "@/lib/asr/client";
import { DEFAULT_FRAME, DEFAULT_FX } from "@/lib/captions/scene";
import { normalizeWords, segmentWords } from "@/lib/captions/segment";
import { DEFAULT_TEMPLATE_ID, getTemplate } from "@/lib/captions/templates";
import { type Doc, type VideoMeta, uid } from "@/lib/captions/types";
export const PEAK_RATE = 50;

export type Step = "read" | "audio" | "model" | "transcribe";
export type Project = { id: string; file: File; meta: VideoMeta; peaks: Float32Array; doc: Doc };
export type ProjectStyle = Pick<Doc, "style" | "templateId" | "frame">;

export function emptyDoc(): Doc {
  const template = getTemplate(DEFAULT_TEMPLATE_ID);
  return { pages: [], style: template.style, templateId: template.id, fx: DEFAULT_FX, frame: DEFAULT_FRAME, offset: 0 };
}

export async function prepareProject(file: File, options: {
  language: string;
  model: string;
  signal: AbortSignal;
  onProgress: (step: Step, ratio: number) => void;
  style?: ProjectStyle;
}): Promise<Project> {
  const { signal, onProgress } = options;
  onProgress("read", 0);
  const { extractAudio, probe, tightenWords } = await import("@/lib/media/media");
  signal.throwIfAborted();
  const meta = await probe(file);
  signal.throwIfAborted();
  if (!meta.hasAudio) throw new Error("This video has no decodable audio track.");
  if (meta.duration > 600) throw new Error("LoudCaps handles videos up to 10 minutes. Trim this one and try again.");
  onProgress("audio", 0);
  const { samples, peaks } = await extractAudio(file, (ratio) => onProgress("audio", ratio), signal);
  signal.throwIfAborted();
  const attempt = () => transcribe(samples.slice(), {
    model: options.model || defaultModel(),
    language: options.language,
    signal,
    onProgress: (step, ratio) => onProgress(step === "download" ? "model" : "transcribe", ratio),
  });
  onProgress("model", 0);
  const raw = await attempt().catch(() => {
    signal.throwIfAborted();
    onProgress("model", 0);
    return attempt();
  });
  signal.throwIfAborted();
  const words = tightenWords(normalizeWords(raw.map((word) => ({ id: uid(), ...word })), meta.duration), peaks);
  if (!words.length) throw new Error("No speech was found. Check the language setting, or try a clip with clearer audio.");
  const doc = { ...emptyDoc(), ...options.style };
  doc.pages = segmentWords(words, { wordsPerPage: doc.style.wordsPerPage });
  return { id: uid("project"), file, meta, peaks, doc };
}
