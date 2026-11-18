"use client";

import { Download, Lock, Upload } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Logo } from "@/components/Logo";
import { Button, Segmented, Select, cx } from "@/components/ui";
import { LANGUAGES, MODELS } from "@/lib/asr/client";
import type { Step } from "@/lib/project";
import { useStudio } from "@/lib/store";
import { BatchStudio } from "./BatchStudio";
import { ExportDialog } from "./Dialogs";
import { Panels } from "./Panels";
import { Stage } from "./Stage";

/** For values that are read once from the browser and never change. */
const noSubscription = () => () => {};

export default function Studio() {
  const phase = useStudio((s) => s.phase);

  useEffect(() => {
    useStudio.getState().init();
    // Handy when debugging in the console; stripped from production builds.
    if (process.env.NODE_ENV === "development") {
      Promise.all([import("@/lib/media/export"), import("@/lib/captions/scene"), import("mediabunny")]).then(([exporter, scene, mediabunny]) => {
        Object.assign(window, { __loudcaps: { useStudio, ...exporter, ...scene, mediabunny } });
      });
      import("@/lib/selftest").then((m) => m.maybeRun());
    }
  }, []);

  useEffect(() => {
    if (phase !== "ready") return;
    const warn = (e: BeforeUnloadEvent) => {
      if (useStudio.getState().draftStatus !== "saved") e.preventDefault();
    };
    const keys = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest("input, select, textarea, button, [role=dialog], [contenteditable]")) return;
      if (e.code === "Space") {
        e.preventDefault();
        import("@/lib/store").then((m) => m.player.toggle());
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) useStudio.getState().redo();
        else useStudio.getState().undo();
      }
    };
    window.addEventListener("beforeunload", warn);
    window.addEventListener("keydown", keys);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("keydown", keys);
    };
  }, [phase]);

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-ink text-paper">
      <TopBar />
      {phase === "idle" && <Start />}
      {phase === "working" && <Working />}
      {phase === "ready" && (
        <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
          <Stage />
          <Panels />
        </div>
      )}
      <ExportDialog />
    </div>
  );
}

function TopBar() {
  const phase = useStudio((s) => s.phase);
  const ready = phase === "ready";
  const name = useStudio((s) => s.meta?.name);
  const draftStatus = useStudio((s) => s.draftStatus);
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-edge px-3 sm:px-4">
      <Link href="/" aria-label="LoudCaps home">
        <Logo />
      </Link>
      {ready && <span className="hidden min-w-0 flex-1 truncate text-sm text-fog sm:block">{name}</span>}
      <div className="ml-auto flex items-center gap-2">
        {ready && <span role="status" className="text-xs text-fog" title="The video and edits are stored on this device">{{
          checking: "", empty: "", saving: "Saving…", saved: "Draft saved", unavailable: "Draft unavailable",
        }[draftStatus]}</span>}
        <BatchStudio />
        {ready && (
          <>
            <Button
              size="sm"
              variant="quiet"
              onClick={() => window.confirm("Start over? This deletes the current local draft and its video from this browser.") && useStudio.getState().reset()}
            >
              New
            </Button>
            <Button size="sm" variant="loud" onClick={() => useStudio.setState({ exportOpen: true })}>
              <Download size={14} /> Export
            </Button>
          </>
        )}
      </div>
    </header>
  );
}

function Start() {
  const error = useStudio((s) => s.error);
  const language = useStudio((s) => s.language);
  const model = useStudio((s) => s.model);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const canExport = useSyncExternalStore(noSubscription, () => typeof VideoEncoder !== "undefined", () => true);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) useStudio.getState().load(file);
  };

  return (
    <main className="flex flex-1 items-center justify-center overflow-y-auto p-4">
      <div className="w-full max-w-xl">
        <h1 className="display text-center text-5xl sm:text-6xl">
          Drop a <span className="inline-block -rotate-2 bg-loud px-2 text-ink">video.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-md text-center text-fog">Free, no watermark, no account. The first run downloads a speech model.</p>

        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            pick(e.dataTransfer.files);
          }}
          className={cx(
            "mt-8 flex w-full flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-12 transition",
            over ? "border-loud bg-loud/10" : "border-edge bg-coal hover:border-fog",
          )}
        >
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-loud text-ink">
            <Upload size={24} />
          </span>
          <span className="text-lg font-semibold">Choose a video or drop it here</span>
          <span className="text-sm text-fog">MP4, MOV or WebM</span>
        </button>
        <input ref={input} type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv" className="hidden" onChange={(e) => pick(e.target.files)} />

        {error && (
          <p role="alert" className="mt-4 rounded-lg bg-pink/10 p-3 text-sm text-pink">
            {error}
          </p>
        )}
        {!canExport && (
          <p className="mt-4 rounded-lg bg-loud/10 p-3 text-sm text-loud">
            This browser can caption your video but can&apos;t export it. For MP4 export use a recent Chrome, Edge, Safari or Firefox.
          </p>
        )}

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <Select label="Spoken language" value={language} onChange={(v) => useStudio.setState({ language: v })}>
            {LANGUAGES.map(([code, label]) => (
              <option key={code} value={code}>
                {label}
              </option>
            ))}
          </Select>
          <div>
            <p className="mb-1 text-xs text-fog">Speech model</p>
            <Segmented label="Speech model" value={model} onChange={(v) => useStudio.setState({ model: v })} options={MODELS.map((m) => [m.id, m.name] as const)} />
          </div>
        </div>
        <p className="mt-2 text-xs text-fog">{MODELS.find((m) => m.id === model)?.note} One-time download of about {MODELS.find((m) => m.id === model)?.size}, then it is saved on this device.</p>

        <p className="mt-8 flex items-center justify-center gap-2 text-xs text-fog">
          <Lock size={13} /> Your video never leaves this device. Everything runs in your browser.
        </p>
      </div>
    </main>
  );
}

const STEPS: [Step, string, string][] = [
  ["read", "Reading your video", ""],
  ["audio", "Pulling out the audio", ""],
  ["model", "Getting the speech model", "Downloaded once, then kept on this device."],
  ["transcribe", "Listening for every word", "Runs on your device, so speed depends on it."],
];

function Working() {
  const step = useStudio((s) => s.step);
  const progress = useStudio((s) => s.progress);
  const at = STEPS.findIndex(([key]) => key === step);
  return (
    <main className="flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <h1 className="display text-4xl">{STEPS[at][1]}</h1>
        <p className="mt-2 min-h-5 text-sm text-fog">{STEPS[at][2]}</p>
        <div className="mt-6 h-3 overflow-hidden rounded-full bg-coal">
          <div className="h-full rounded-full bg-loud transition-[width] duration-200" style={{ width: `${Math.max(4, Math.round(progress * 100))}%` }} />
        </div>
        <ol className="mt-6 space-y-2 text-sm">
          {STEPS.map(([key, label], i) => (
            <li key={key} className={cx("flex items-center gap-2", i < at ? "text-fog" : i === at ? "text-paper" : "text-edge")}>
              <span className={cx("h-1.5 w-1.5 rounded-full", i <= at ? "bg-loud" : "bg-edge")} />
              {label}
            </li>
          ))}
        </ol>
        <Button className="mt-8 w-full" onClick={() => useStudio.getState().cancel()}>
          Cancel
        </Button>
      </div>
    </main>
  );
}
