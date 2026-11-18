import type { RawWord, WorkerReply, WorkerRequest } from "./worker";

export const MODELS = [
  { id: "onnx-community/whisper-tiny_timestamped", name: "Fast", size: "67 MB", note: "Quickest. Great for clear speech." },
  { id: "onnx-community/whisper-base_timestamped", name: "Balanced", size: "103 MB", note: "Recommended for most videos." },
  { id: "onnx-community/whisper-small_timestamped", name: "Accurate", size: "275 MB", note: "Slower. Best for accents and noise." },
] as const;

export const LANGUAGES: [code: string, name: string][] = [
  ["auto", "Detect automatically"],
  ["en", "English"], ["es", "Spanish"], ["pt", "Portuguese"], ["fr", "French"], ["de", "German"],
  ["it", "Italian"], ["nl", "Dutch"], ["ru", "Russian"], ["uk", "Ukrainian"], ["kk", "Kazakh"],
  ["tr", "Turkish"], ["pl", "Polish"], ["ar", "Arabic"], ["hi", "Hindi"], ["ur", "Urdu"],
  ["bn", "Bengali"], ["id", "Indonesian"], ["ms", "Malay"], ["vi", "Vietnamese"], ["th", "Thai"],
  ["tl", "Tagalog"], ["zh", "Chinese"], ["ja", "Japanese"], ["ko", "Korean"], ["sv", "Swedish"],
  ["no", "Norwegian"], ["da", "Danish"], ["fi", "Finnish"], ["cs", "Czech"], ["sk", "Slovak"],
  ["ro", "Romanian"], ["hu", "Hungarian"], ["el", "Greek"], ["he", "Hebrew"], ["fa", "Persian"],
  ["bg", "Bulgarian"], ["sr", "Serbian"], ["hr", "Croatian"], ["uz", "Uzbek"], ["az", "Azerbaijani"],
  ["ka", "Georgian"], ["hy", "Armenian"], ["sw", "Swahili"], ["af", "Afrikaans"], ["ca", "Catalan"],
  ["ta", "Tamil"], ["te", "Telugu"], ["mr", "Marathi"], ["ne", "Nepali"], ["lt", "Lithuanian"],
  ["lv", "Latvian"], ["et", "Estonian"], ["sl", "Slovenian"],
];

/** Phones get the small model: it downloads faster and fits comfortably in memory. */
export function defaultModel(): string {
  if (typeof navigator === "undefined") return MODELS[1].id;
  const small = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
  return (small ? MODELS[0] : MODELS[1]).id;
}

let worker: Worker | null = null;

export type TranscribeOptions = {
  model: string;
  language: string;
  signal: AbortSignal;
  onProgress: (stage: "download" | "transcribe", ratio: number) => void;
};

/** Transcribes 16 kHz mono audio with word-level timestamps. The audio buffer is handed over to the worker. */
export function transcribe(audio: Float32Array<ArrayBuffer>, options: TranscribeOptions): Promise<RawWord[]> {
  return new Promise((resolve, reject) => {
    const current = (worker ??= new Worker(new URL("./worker.ts", import.meta.url), { type: "module" }));
    const stop = () => {
      current.removeEventListener("message", onMessage);
      current.removeEventListener("error", onError);
      options.signal.removeEventListener("abort", onAbort);
    };
    const kill = () => {
      stop();
      current.terminate();
      worker = null;
    };
    const onAbort = () => {
      kill();
      reject(new DOMException("Cancelled", "AbortError"));
    };
    const onError = (event: ErrorEvent) => {
      kill();
      reject(new Error(event.message || "The speech model stopped unexpectedly. Try the Fast model."));
    };
    const onMessage = ({ data }: MessageEvent<WorkerReply>) => {
      if (data.type === "download") options.onProgress("download", data.ratio);
      else if (data.type === "progress") options.onProgress("transcribe", data.ratio);
      else if (data.type === "result") {
        stop();
        resolve(data.words);
      } else {
        kill();
        reject(new Error(data.message));
      }
    };
    current.addEventListener("message", onMessage);
    current.addEventListener("error", onError);
    options.signal.addEventListener("abort", onAbort);
    const request: WorkerRequest = { type: "transcribe", audio, model: options.model, language: options.language };
    current.postMessage(request, [audio.buffer]);
  });
}
