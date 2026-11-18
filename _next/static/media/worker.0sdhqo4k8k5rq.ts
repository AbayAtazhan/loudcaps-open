/**
 * Speech recognition worker. Runs Whisper on the visitor's own device through
 * WebAssembly, so the audio never leaves the browser.
 */
type SpeechRuntime = Pick<typeof import("@huggingface/transformers"), "Tensor" | "env" | "pipeline">;
/** Load the pinned browser distribution at runtime, alongside the ONNX downloads. */
const runtimeUrl = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2";
let runtime: Promise<SpeechRuntime> | undefined;

function speechRuntime(): Promise<SpeechRuntime> {
  return (runtime ??= import(/* webpackIgnore: true */ runtimeUrl));
}

const RATE = 16000;
/** Whisper reads at most 30 seconds at a time; stay under it and cut at quiet moments. */
const WINDOW = 28 * RATE;
const SEARCH_FROM = 18 * RATE;

type Chunk = { text: string; timestamp: [number | null, number | null] };
type Recognizer = ((audio: Float32Array, options: Record<string, unknown>) => Promise<{ text: string; chunks?: Chunk[] }>) & {
  processor: (audio: Float32Array) => Promise<{ input_features: unknown }>;
  model: ((inputs: Record<string, unknown>) => Promise<{ logits: { data: Float32Array; dims: number[] } }>) & {
    generation_config?: { lang_to_id?: Record<string, number>; decoder_start_token_id?: number };
  };
};
export type RawWord = { text: string; start: number; end: number };
export type WorkerRequest = { type: "transcribe"; audio: Float32Array; model: string; language: string };
export type WorkerReply =
  | { type: "download"; ratio: number }
  | { type: "progress"; ratio: number }
  | { type: "result"; words: RawWord[] }
  | { type: "error"; message: string };

const reply = (message: WorkerReply) => (self as unknown as { postMessage(m: WorkerReply): void }).postMessage(message);

let recognizer: Recognizer | null = null;
let loaded = "";

async function load(model: string): Promise<Recognizer> {
  if (recognizer && loaded === model) return recognizer;
  const { env, pipeline } = await speechRuntime();
  env.allowLocalModels = false;
  // Threads need cross-origin isolation (see next.config.ts and public/_headers).
  const wasm = (env.backends.onnx as { wasm?: { numThreads?: number } }).wasm;
  if (wasm) wasm.numThreads = self.crossOriginIsolated ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1)) : 1;

  const files = new Map<string, { loaded: number; total: number }>();
  const created = await pipeline("automatic-speech-recognition", model, {
    dtype: "q8",
    device: "wasm",
    progress_callback: (p: { status?: string; file?: string; loaded?: number; total?: number }) => {
      if (p.status !== "progress" || !p.file || !p.total) return;
      files.set(p.file, { loaded: p.loaded ?? 0, total: p.total });
      let done = 0;
      let total = 0;
      for (const f of files.values()) {
        done += f.loaded;
        total += f.total;
      }
      reply({ type: "download", ratio: total ? done / total : 0 });
    },
  });
  recognizer = created as unknown as Recognizer;
  loaded = model;
  return recognizer;
}

/** Splits long audio at the quietest moment near the end of each window, so no word is cut in half. */
function planWindows(audio: Float32Array): [number, number][] {
  const windows: [number, number][] = [];
  const frame = RATE / 50;
  let start = 0;
  while (audio.length - start > WINDOW) {
    let best = start + WINDOW;
    let quietest = Infinity;
    for (let at = start + SEARCH_FROM; at + frame <= start + WINDOW; at += frame) {
      let energy = 0;
      for (let i = at; i < at + frame; i++) energy += audio[i] * audio[i];
      if (energy < quietest) {
        quietest = energy;
        best = at + frame / 2;
      }
    }
    windows.push([start, best]);
    start = best;
  }
  if (audio.length - start > RATE * 0.1) windows.push([start, audio.length]);
  return windows;
}

function isSilent(chunk: Float32Array): boolean {
  let peak = 0;
  for (let i = 0; i < chunk.length; i += 8) {
    const v = Math.abs(chunk[i]);
    if (v > peak) peak = v;
  }
  return peak < 0.004;
}

/**
 * Asks Whisper which language is being spoken. Its first prediction after the
 * start token is a language tag, so one decoder step over the loudest window is enough.
 */
async function detectLanguage(recognize: Recognizer, audio: Float32Array): Promise<string> {
  try {
    const config = recognize.model.generation_config;
    const languages = config?.lang_to_id;
    const start = config?.decoder_start_token_id;
    if (!languages || start === undefined) return "en";
    const { Tensor } = await speechRuntime();
    const { input_features } = await recognize.processor(audio);
    const { logits } = await recognize.model({
      input_features,
      decoder_input_ids: new Tensor("int64", BigInt64Array.from([BigInt(start)]), [1, 1]),
    });
    const vocab = logits.dims[logits.dims.length - 1];
    const scores = logits.data.subarray(logits.data.length - vocab);
    let best = "en";
    let top = -Infinity;
    for (const [token, id] of Object.entries(languages)) {
      if (scores[id] > top) {
        top = scores[id];
        best = token.replace(/[<|>]/g, "");
      }
    }
    return best;
  } catch {
    return "en";
  }
}

/** Whisper writes things like [Music] or (applause) for non-speech. Those are not captions. */
const NON_SPEECH = /^[\[(♪*].*[\])♪*]$|^♪+$/;

async function transcribe(request: WorkerRequest) {
  const recognize = await load(request.model);
  reply({ type: "progress", ratio: 0 });
  const words: RawWord[] = [];
  const windows = planWindows(request.audio);
  let language = request.language;
  if (language === "auto") {
    const speech = windows.find(([a, b]) => !isSilent(request.audio.subarray(a, b)));
    language = speech ? await detectLanguage(recognize, request.audio.subarray(speech[0], speech[1])) : "en";
  }
  for (const [from, to] of windows) {
    const chunk = request.audio.subarray(from, to);
    if (!isSilent(chunk)) {
      const result = await recognize(chunk, {
        return_timestamps: "word",
        language,
        task: "transcribe",
      });
      const base = from / RATE;
      for (const c of result.chunks ?? []) {
        const text = c.text.trim();
        const [start, end] = c.timestamp;
        if (!text || start === null || NON_SPEECH.test(text)) continue;
        words.push({ text, start: base + start, end: base + (end ?? start + 0.3) });
      }
    }
    reply({ type: "progress", ratio: to / request.audio.length });
  }
  reply({ type: "result", words });
}

self.addEventListener("message", (event: MessageEvent<WorkerRequest>) => {
  if (event.data?.type !== "transcribe") return;
  transcribe(event.data).catch((error: unknown) => {
    reply({ type: "error", message: error instanceof Error ? error.message : String(error) });
  });
});
