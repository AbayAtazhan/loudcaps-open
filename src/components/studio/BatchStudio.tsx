"use client";

import { FolderOpen, Layers } from "lucide-react";
import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Button, Modal, Select } from "@/components/ui";
import { retimeWords } from "@/lib/captions/segment";
import { DEFAULT_TEMPLATE_ID, TEMPLATES } from "@/lib/captions/templates";
import { pageStart, pageText, uid, type Page } from "@/lib/captions/types";
import { exportPlan, renderProject, standardFrameRate } from "@/lib/media/project-export";
import { download } from "@/lib/media/subtitles";
import { formatTime } from "@/lib/media/timeline";
import { prepareProject, type Project, type Step } from "@/lib/project";
import { useStudio } from "@/lib/store";
import { applyVocabulary, batchFilename, parseVocabulary, presetStyle, readPresets, savePresets, type ClientPreset } from "@/lib/batch";

type Result = { name: string; blob?: Blob };
type Clip = { id: string; file: File; project?: Project; error?: string; result?: Result };
type Progress = { id: string; stage: string; ratio: number };
type DirectoryPicker = (options: { mode: "readwrite" }) => Promise<FileSystemDirectoryHandle>;
const labels: Record<Step, string> = {
  read: "Reading video", audio: "Reading audio", model: "Loading speech model", transcribe: "Captioning",
};
const inputStyle = "w-full rounded-lg border border-edge bg-ink px-3 py-2 text-sm focus-visible:outline-loud";

function outputPicker() {
  return (window as Window & { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker?.bind(window);
}

export function BatchStudio() {
  const phase = useStudio((state) => state.phase);
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<ClientPreset[]>([]);
  const [presetId, setPresetId] = useState("");
  const [clips, setClips] = useState<Clip[]>([]);
  const [reviewId, setReviewId] = useState("");
  const [progress, setProgress] = useState<Progress | null>(null);
  const [busy, setBusy] = useState<"caption" | "render" | null>(null);
  const [error, setError] = useState("");
  const [folder, setFolder] = useState("");
  const [presetReady, setPresetReady] = useState(false);
  const [editing, setEditing] = useState(false);
  const task = useRef<AbortController | null>(null);
  const files = useRef<HTMLInputElement>(null);
  const sourceFolder = useRef<HTMLInputElement>(null);
  const firstOpen = useRef(false);

  useEffect(() => {
    if (!clips.some((clip) => !clip.result?.name || clip.result.blob)) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [clips]);

  async function show() {
    setOpen(true);
    if (firstOpen.current) return;
    firstOpen.current = true;
    try {
      const saved = await readPresets();
      if (saved?.length) {
        setPresets(saved);
        setPresetId(saved[0].id);
      }
    } catch {
      setError("Could not read saved client presets from this browser.");
    } finally {
      setPresetReady(true);
    }
  }

  const changeClip = (id: string, update: Partial<Clip>) => {
    setClips((list) => list.map((clip) => clip.id === id ? { ...clip, ...update } : clip));
  };

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    const videos = selected.filter((file) => file.type.startsWith("video/") || /\.(mp4|mov|m4v|webm|mkv)$/i.test(file.name));
    setError(videos.length || !selected.length ? "" : "No supported videos were found.");
    setClips((items) => [
      ...items,
      ...videos.map((file) => ({ id: uid("clip"), file })),
    ]);
  }

  async function editPresets(next: ClientPreset[], selected: string) {
    try {
      await savePresets(next);
      setPresets(next);
      setPresetId(selected);
      setEditing(false);
      setError("");
    } catch {
      setError("Could not save the client presets in this browser.");
    }
  }

  async function run(mode: "caption" | "render", toFolder = false) {
    if (task.current) return;
    const controller = new AbortController();
    const { signal } = controller;
    task.current = controller;
    setBusy(mode);
    setError("");
    try {
      let directory: FileSystemDirectoryHandle | undefined;
      if (toFolder) {
        const pick = outputPicker();
        if (!pick) throw new Error("Folder export is unavailable in this browser.");
        const parent = await pick({ mode: "readwrite" });
        const label = `LoudCaps-${uid("batch")}`;
        directory = await parent.getDirectoryHandle(label, { create: true });
        setFolder(label);
      }
      const preset = presets.find((item) => item.id === presetId);
      const words = parseVocabulary(preset?.vocabulary ?? "");
      const { model, language } = useStudio.getState();
      for (const [index, clip] of clips.entries()) {
        signal.throwIfAborted();
        if (mode === "caption" && clip.project) continue;
        if (mode === "render" && (!clip.project || (clip.result && !directory))) continue;
        changeClip(clip.id, { error: undefined });
        try {
          if (mode === "caption") {
            const project = await prepareProject(clip.file, {
              model, language, signal, style: preset?.styling,
              onProgress: (step, ratio) => setProgress({ id: clip.id, stage: labels[step], ratio }),
            });
            signal.throwIfAborted();
            project.doc.pages = applyVocabulary(project.doc.pages, words);
            changeClip(clip.id, { project });
          } else if (clip.project) {
            const { file, doc, meta } = clip.project;
            const name = batchFilename(file, index);
            setProgress({ id: clip.id, stage: "Rendering", ratio: 0 });
            const plan = exportPlan(doc, meta, 1080, standardFrameRate(meta));
            const blob = clip.result?.blob ?? await renderProject(file, plan, signal, (ratio) => {
              setProgress({ id: clip.id, stage: "Rendering", ratio });
            });
            signal.throwIfAborted();
            if (directory) {
              const handle = await directory.getFileHandle(name, { create: true });
              const writable = await handle.createWritable();
              try {
                await writable.write(blob);
                await writable.close();
              } catch (writeError) {
                await writable.abort().catch(() => {});
                throw writeError;
              }
            }
            changeClip(clip.id, { result: directory ? { name } : { name, blob } });
          }
        } catch (clipError) {
          if (signal.aborted) throw clipError;
          changeClip(clip.id, { error: clipError instanceof Error ? clipError.message : "This clip could not be processed." });
        }
      }
    } catch (runError) {
      if (!signal.aborted && !(runError instanceof DOMException && runError.name === "AbortError")) {
        setError(runError instanceof Error ? runError.message : "The batch stopped unexpectedly.");
      }
    } finally {
      task.current = null;
      setBusy(null);
      setProgress(null);
    }
  }

  const selected = clips.find((clip) => clip.id === reviewId);
  const reviewedProject = selected?.project;
  const setPage = (page: Page, text: string) => {
    if (!selected || !reviewedProject || text === pageText(page)) return;
    const words = retimeWords(page, text);
    const end = page.words.at(-1)?.end ?? 0;
    // A longer replacement must fit inside the original cue.
    const start = pageStart(page);
    const ratio = Math.min(1, (end - start) / Math.max(0.001, (words.at(-1)?.end ?? end) - start));
    const timed = words.map((word) => ({
      ...word, start: start + (word.start - start) * ratio, end: start + (word.end - start) * ratio,
    }));
    const pages = reviewedProject.doc.pages.flatMap((existing) => {
      if (existing.id !== page.id) return [existing];
      return timed.length ? [{ ...page, words: timed }] : [];
    });
    changeClip(selected.id, { project: { ...reviewedProject, doc: { ...reviewedProject.doc, pages } }, result: undefined });
  };

  return (
    <>
      <Button size="sm" variant="quiet" disabled={phase === "working"} onClick={show}><Layers size={15} /> Batch</Button>
      <Modal open={open} onClose={() => { if (!task.current) setOpen(false); }} title="Batch captions" wide>
        <div className="space-y-5">
          <fieldset disabled={busy !== null || !presetReady} className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Select label="Client preset" value={presetId} onChange={(value) => { setPresetId(value); setEditing(false); }}>
                  <option value="">Default style</option>
                  {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
                </Select>
              </div>
              <Button size="sm" onClick={() => { setPresetId(""); setEditing(true); }}>New preset</Button>
              {presetId && <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>}
            </div>
            {editing && <PresetEditor key={presetId} preset={presets.find((item) => item.id === presetId)}
              currentAvailable={phase === "ready"}
              onCancel={() => setEditing(false)}
              onSave={(preset) => editPresets([...presets.filter((item) => item.id !== preset.id), preset], preset.id)}
              onDelete={(id) => editPresets(presets.filter((item) => item.id !== id), "")}
            />}
            <input ref={files} type="file" accept="video/*,.mp4,.mov,.m4v,.webm,.mkv" multiple className="hidden" aria-label="Batch videos" onChange={addFiles} />
            <input ref={sourceFolder} type="file" {...{ webkitdirectory: "" }} multiple className="hidden" aria-label="Batch source folder" onChange={addFiles} />
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => files.current?.click()}>Add videos</Button>
              <Button onClick={() => sourceFolder.current?.click()}>Add folder</Button>
            </div>
          </fieldset>
          {error && <p role="alert" className="text-sm text-pink">{error}</p>}
          {clips.length > 0 && (
            <div className="space-y-3">
              <ul className="divide-y divide-edge rounded-lg border border-edge">
                {clips.map((clip) => (
                  <li key={clip.id} className="flex flex-wrap items-center gap-2 p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold" title={clip.file.name}>{clip.file.name}</p>
                      <p className="text-xs text-fog">
                        {progress?.id === clip.id
                          ? `${progress.stage} ${Math.round(progress.ratio * 100)}%`
                          : clip.error ? "Failed" : clip.result ? "Exported" : clip.project ? "Ready to review" : "Queued"}
                      </p>
                      {clip.error && <p className="text-xs text-pink">{clip.error}</p>}
                    </div>
                    {clip.project && <Button size="sm" disabled={!!busy} onClick={() => setReviewId(reviewId === clip.id ? "" : clip.id)}>Review</Button>}
                    {clip.result?.blob && <DownloadResult result={clip.result} />}
                    <Button size="sm" variant="quiet" disabled={!!busy} onClick={() => setClips((items) => items.filter((item) => item.id !== clip.id))}>Remove</Button>
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-2">
                <Button variant="loud" disabled={!!busy || clips.every((clip) => clip.project)} onClick={() => run("caption")}>Caption queue</Button>
                <Button disabled={!!busy || !clips.some((clip) => clip.project && !clip.result)} onClick={() => run("render")}>Render MP4s</Button>
                {typeof window !== "undefined" && outputPicker() && (
                  <Button disabled={!!busy || !clips.some((clip) => clip.project)} onClick={() => run("render", true)}><FolderOpen size={15} /> Export to folder</Button>
                )}
                {busy && <Button onClick={() => task.current?.abort()}>Cancel</Button>}
              </div>
              <p className="text-xs text-fog">The batch stays open in this tab. Download or save each finished video before leaving.</p>
              {folder && <p className="text-xs text-fog">Folder for the latest export: {folder}</p>}
              {reviewedProject && !busy && <BatchReview key={reviewedProject.id} project={reviewedProject} onEdit={setPage} />}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}

function DownloadResult({ result }: { result: Result }) {
  return <Button size="sm" onClick={() => { if (result.blob) download(result.blob, result.name); }}>Download MP4</Button>;
}

function PresetEditor({ preset, currentAvailable, onCancel, onSave, onDelete }: {
  preset?: ClientPreset;
  currentAvailable: boolean;
  onCancel: () => void;
  onSave: (preset: ClientPreset) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [name, setName] = useState(preset?.name ?? "");
  const [style, setStyle] = useState(preset ? "saved" : currentAvailable ? "current" : DEFAULT_TEMPLATE_ID);
  const [vocabulary, setVocabulary] = useState(preset?.vocabulary ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim() || busy) return;
    try {
      parseVocabulary(vocabulary);
    } catch (invalid) {
      setError(invalid instanceof Error ? invalid.message : "The vocabulary is invalid.");
      return;
    }
    setError("");
    setBusy(true);
    await onSave({
      id: preset?.id ?? uid("client"),
      name: name.trim(),
      styling: style === "saved" && preset ? preset.styling : presetStyle(style, useStudio.getState().doc),
      vocabulary,
    });
    setBusy(false);
  };
  return (
    <div className="space-y-3 rounded-lg border border-edge p-3">
      <label className="block text-xs text-fog">Client name
        <input className={inputStyle} value={name} maxLength={80} onChange={(event) => setName(event.target.value)} />
      </label>
      <Select label="Caption style" value={style} onChange={setStyle}>
        {preset && <option value="saved">Saved client style</option>}
        {currentAvailable && <option value="current">Copy current studio style and framing</option>}
        {TEMPLATES.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}
      </Select>
      <label className="block text-xs text-fog">Vocabulary replacements (one per line)
        <textarea className={inputStyle} rows={3} placeholder="logcaps = LoudCaps" value={vocabulary} onChange={(event) => setVocabulary(event.target.value)} />
      </label>
      {error && <p role="alert" className="text-xs text-pink">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="loud" disabled={busy || !name.trim()} onClick={save}>Save preset</Button>
        <Button size="sm" disabled={busy} onClick={onCancel}>Cancel</Button>
        {preset && <Button size="sm" variant="quiet" disabled={busy} onClick={() => void onDelete(preset.id)}>Delete preset</Button>}
      </div>
    </div>
  );
}

function BatchReview({ project, onEdit }: { project: Project; onEdit: (page: Page, text: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (!video.current) return;
    const element = video.current;
    const url = URL.createObjectURL(project.file);
    element.src = url;
    return () => {
      element.removeAttribute("src");
      element.load();
      URL.revokeObjectURL(url);
    };
  }, [project.file]);

  return (
    <div className="grid gap-4 border-t border-edge pt-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
      <div>
        <p className="mb-2 break-all text-sm font-semibold">{project.file.name}</p>
        <video ref={video} controls playsInline className="max-h-64 w-full rounded-lg bg-ink" />
      </div>
      <div className="max-h-64 space-y-2 overflow-auto">
        {project.doc.pages.map((page) => (
          <div key={page.id} className="flex items-start gap-2">
            <Button size="sm" onClick={() => { if (video.current) video.current.currentTime = pageStart(page); }}>{formatTime(pageStart(page))}</Button>
            <textarea aria-label={`Caption at ${formatTime(pageStart(page))}`} rows={1} className={inputStyle}
              defaultValue={pageText(page)} onBlur={(event) => onEdit(page, event.target.value)} />
          </div>
        ))}
      </div>
    </div>
  );
}
