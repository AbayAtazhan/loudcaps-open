"use client";

import { Download, Share2 } from "lucide-react";
import { useRef, useState } from "react";
import { Button, Modal, Segmented } from "@/components/ui";
import { exportPlan, renderProject, standardFrameRate } from "@/lib/media/project-export";
import { download, toPlainText, toSrt, toVtt } from "@/lib/media/subtitles";
import { site } from "@/lib/site";
import { useStudio } from "@/lib/store";

const now = () => performance.now();

type ExportState =
  | { kind: "options" }
  | { kind: "rendering"; ratio: number }
  | { kind: "done"; blob: Blob; seconds: number; name: string; plan: ReturnType<typeof exportPlan> }
  | { kind: "error"; message: string };

export function ExportDialog() {
  const open = useStudio((s) => s.exportOpen);
  const meta = useStudio((s) => s.meta);
  const doc = useStudio((s) => s.doc);
  const file = useStudio((s) => s.file);
  const [size, setSize] = useState("1080");
  const [rate, setRate] = useState("base");
  const [state, setState] = useState<ExportState>({ kind: "options" });
  const abort = useRef<AbortController | null>(null);

  if (!meta || !file) return null;
  // Keep 24/25 fps footage at its own rate instead of padding it to 30.
  const baseFps = standardFrameRate(meta);
  const fps = rate === "60" ? 60 : baseFps;
  const shortSide = Number(size);
  const stem = meta.name.replace(/\.[^.]+$/, "") || "video";

  const close = () => {
    abort.current?.abort();
    abort.current = null;
    useStudio.setState({ exportOpen: false });
    setState({ kind: "options" });
  };

  const run = async () => {
    const plan = exportPlan(doc, meta, shortSide, fps);
    const controller = new AbortController();
    abort.current = controller;
    setState({ kind: "rendering", ratio: 0 });
    const started = now();
    try {
      const blob = await renderProject(file, plan, controller.signal, (ratio) => {
        if (abort.current === controller && !controller.signal.aborted) setState({ kind: "rendering", ratio });
      });
      if (abort.current !== controller) return;
      controller.signal.throwIfAborted();
      const name = `${stem}-loudcaps.mp4`;
      setState({ kind: "done", blob, seconds: (now() - started) / 1000, name, plan });
      download(blob, name);
    } catch (error) {
      if (abort.current !== controller) return;
      if (controller.signal.aborted) setState({ kind: "options" });
      else setState({ kind: "error", message: error instanceof Error ? error.message : "The export failed." });
    }
  };

  const text = (content: string, name: string, type: string) => download(new Blob([content], { type }), name);
  const shareFile = state.kind === "done" ? new File([state.blob], state.name, { type: "video/mp4" }) : null;
  const canShare = !!shareFile && typeof navigator.canShare === "function" && navigator.canShare({ files: [shareFile] });

  return (
    <Modal open={open} onClose={close} title={state.kind === "done" ? "Saved." : "Export"}>
      {state.kind === "options" && (
        <div className="space-y-4">
          <div>
            <p className="mb-1.5 text-xs text-fog">Resolution</p>
            <Segmented
              label="Resolution"
              value={size}
              onChange={setSize}
              options={[
                ["720", "720p"],
                ["1080", "1080p"],
                ["2160", "4K"],
              ]}
            />
          </div>
          <div>
            <p className="mb-1.5 text-xs text-fog">Frame rate</p>
            <Segmented
              label="Frame rate"
              value={rate}
              onChange={setRate}
              options={[
                ["base", `${baseFps} fps`],
                ["60", "60 fps"],
              ]}
            />
          </div>
          <Button variant="loud" className="w-full" onClick={run}>
            <Download size={16} /> Export MP4
          </Button>
          <p className="text-center text-xs text-fog">Rendered on this device. Nothing is uploaded.</p>
        </div>
      )}

      {state.kind === "rendering" && (
        <div className="space-y-4">
          <div className="h-3 overflow-hidden rounded-full bg-ink">
            <div className="h-full rounded-full bg-loud transition-[width] duration-150" style={{ width: `${Math.round(state.ratio * 100)}%` }} />
          </div>
          <p className="text-sm text-fog">Rendering {Math.round(state.ratio * 100)}%. Keep this tab open.</p>
          <Button className="w-full" onClick={() => abort.current?.abort()}>
            Cancel
          </Button>
        </div>
      )}

      {state.kind === "done" && (
        <div className="space-y-3">
          <p className="text-sm text-fog">
            {state.name} · {(state.blob.size / 1048576).toFixed(1)} MB · rendered in {state.seconds.toFixed(1)}s
          </p>
          <div className="flex gap-2">
            <Button variant="loud" className="flex-1" onClick={() => download(state.blob, state.name)}>
              <Download size={16} /> Download again
            </Button>
            {canShare && shareFile && (
              <Button className="flex-1" onClick={() => navigator.share({ files: [shareFile] }).catch(() => {})}>
                <Share2 size={16} /> Share
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button size="sm" className="flex-1" onClick={() => text(toSrt(state.plan.doc.pages, state.plan.doc.offset, state.plan.cuts), `${stem}.srt`, "application/x-subrip")}>
              SRT
            </Button>
            <Button size="sm" className="flex-1" onClick={() => text(toVtt(state.plan.doc.pages, state.plan.doc.offset, state.plan.cuts), `${stem}.vtt`, "text/vtt")}>
              VTT
            </Button>
            <Button size="sm" className="flex-1" onClick={() => text(toPlainText(state.plan.doc.pages), `${stem}.txt`, "text/plain")}>
              Transcript
            </Button>
          </div>
          <p className="pt-2 text-center text-xs text-fog">
            LoudCaps is free and open source.{" "}
            <a href={site.repo} target="_blank" rel="noreferrer" className="text-paper underline underline-offset-2">
              Star it on GitHub
            </a>{" "}
            if it saved you a subscription.
          </p>
        </div>
      )}

      {state.kind === "error" && (
        <div className="space-y-4">
          <p className="rounded-lg bg-pink/10 p-3 text-sm text-pink">{state.message}</p>
          <Button className="w-full" onClick={() => setState({ kind: "options" })}>
            Back
          </Button>
        </div>
      )}
    </Modal>
  );
}
