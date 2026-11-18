"use client";

import { create } from "zustand";
import { defaultModel } from "@/lib/asr/client";
import { resegment } from "@/lib/captions/segment";
import { getTemplate } from "@/lib/captions/templates";
import { readDraft, removeDraft, saveDraft, saveEdit } from "@/lib/draft";
import { type CaptionStyle, type Doc, type Effects, type Frame, type Page, type VideoMeta, type Word, uid } from "@/lib/captions/types";
import { emptyDoc, prepareProject, type Project, type Step } from "@/lib/project";

export type Tab = "captions" | "style" | "effects";
type DraftStatus = "checking" | "empty" | "saving" | "saved" | "unavailable";

const HISTORY_LIMIT = 80;
/** Rapid changes of the same kind (dragging a slider) collapse into one undo step. */
const MERGE_WINDOW = 900;

type Studio = {
  phase: "idle" | "working" | "ready";
  projectId: string | null;
  draftStatus: DraftStatus;
  step: Step;
  progress: number;
  error: string | null;
  file: File | null;
  url: string | null;
  meta: VideoMeta | null;
  peaks: Float32Array | null;
  language: string;
  model: string;
  doc: Doc;
  past: Doc[];
  future: Doc[];
  activePage: number;
  selected: string | null;
  tab: Tab;
  exportOpen: boolean;

  init(): void;
  load(file: File): Promise<void>;
  cancel(): void;
  reset(): void;
  update(change: (doc: Doc) => Doc, merge?: string): void;
  undo(): void;
  redo(): void;
  applyTemplate(id: string): void;
  setStyle(patch: Partial<CaptionStyle>, merge?: string): void;
  setFx<K extends keyof Effects>(key: K, patch: Partial<Effects[K]>, merge?: string): void;
  setFrame(patch: Partial<Frame>, merge?: string): void;
  editWord(id: string, text: string): void;
  toggleEmphasis(id: string): void;
  splitBefore(id: string): void;
  mergeWithNext(pageId: string): void;
  setEmoji(pageId: string, emoji: string | null | undefined): void;
};

let controller: AbortController | null = null;
let initialized = false;
let draftWrite = 0;

function projectState(project: Project) {
  return {
    phase: "ready" as const, projectId: project.id, file: project.file,
    url: URL.createObjectURL(project.file), meta: project.meta, peaks: project.peaks,
    doc: project.doc,
    past: [], future: [], activePage: -1, selected: null, tab: "captions" as const,
  };
}

function trackDraftWrite(write: Promise<boolean>) {
  const revision = ++draftWrite;
  useStudio.setState({ draftStatus: "saving" });
  const finish = (status: DraftStatus) => {
    if (draftWrite === revision) useStudio.setState({ draftStatus: status });
  };
  void write.then((changed) => finish(changed ? "saved" : "unavailable"), () => finish("unavailable"));
}
let mergeKey: string | null = null;
let mergeAt = 0;

const mapWords = (pages: Page[], fn: (word: Word) => Word[]): Page[] =>
  pages.map((p) => ({ ...p, words: p.words.flatMap(fn) })).filter((p) => p.words.length > 0);

export const useStudio = create<Studio>((set, get) => ({
  phase: "idle",
  projectId: null,
  draftStatus: "checking",
  step: "read",
  progress: 0,
  error: null,
  file: null,
  url: null,
  meta: null,
  peaks: null,
  language: "auto",
  model: "",
  doc: emptyDoc(),
  past: [],
  future: [],
  activePage: -1,
  selected: null,
  tab: "captions",
  exportOpen: false,

  init() {
    if (initialized) return;
    initialized = true;
    if (!get().model) set({ model: defaultModel() });
    void readDraft().then((project) => {
      if (get().draftStatus !== "checking" || get().phase !== "idle") return;
      if (project) set({ ...projectState(project), draftStatus: "saved" });
      else set({ draftStatus: "empty" });
    }, () => {
      if (get().draftStatus === "checking") set({ draftStatus: "unavailable" });
    });
  },

  async load(file) {
    controller?.abort();
    controller = new AbortController();
    const { signal } = controller;
    set({ phase: "working", draftStatus: get().draftStatus === "checking" ? "empty" : get().draftStatus, step: "read", progress: 0, error: null });
    try {
      const project = await prepareProject(file, {
        model: get().model,
        language: get().language,
        signal,
        onProgress: (step, progress) => {
          if (!signal.aborted) set({ step, progress });
        },
      });
      signal.throwIfAborted();
      const previous = get().url;
      if (previous) URL.revokeObjectURL(previous);
      mergeKey = null;
      set(projectState(project));
      trackDraftWrite(saveDraft(project));
    } catch (error) {
      if (signal.aborted) return;
      set({ phase: "idle", error: error instanceof Error ? error.message : "Something went wrong reading that video." });
    }
  },

  cancel() {
    controller?.abort();
    set({ phase: "idle", error: null });
  },

  reset() {
    controller?.abort();
    const { projectId, url } = get();
    if (url) URL.revokeObjectURL(url);
    mergeKey = null;
    const revision = ++draftWrite;
    set({ phase: "idle", projectId: null, draftStatus: "empty", file: null, url: null, meta: null, peaks: null, doc: emptyDoc(), past: [], future: [], error: null, selected: null, exportOpen: false });
    if (projectId) void removeDraft(projectId).catch(() => {
      if (draftWrite === revision) set({ error: "Could not delete the local draft. Clear this site's data in your browser to remove it." });
    });
  },

  update(change, merge) {
    const { doc, past } = get();
    const next = change(doc);
    if (next === doc) return;
    const now = Date.now();
    const merged = !!merge && merge === mergeKey && now - mergeAt < MERGE_WINDOW;
    mergeKey = merge ?? null;
    mergeAt = now;
    set({ doc: next, past: merged ? past : [...past.slice(-HISTORY_LIMIT), doc], future: [] });
  },

  undo() {
    const { past, future, doc } = get();
    if (!past.length) return;
    mergeKey = null;
    set({ doc: past[past.length - 1], past: past.slice(0, -1), future: [doc, ...future] });
  },

  redo() {
    const { past, future, doc } = get();
    if (!future.length) return;
    mergeKey = null;
    set({ doc: future[0], past: [...past, doc], future: future.slice(1) });
  },

  applyTemplate(id) {
    const template = getTemplate(id);
    get().update((doc) => ({
      ...doc,
      templateId: template.id,
      style: template.style,
      pages:
        template.style.wordsPerPage === doc.style.wordsPerPage
          ? doc.pages
          : resegment(doc.pages, { wordsPerPage: template.style.wordsPerPage }),
    }));
  },

  setStyle(patch, merge) {
    get().update((doc) => {
      const style = { ...doc.style, ...patch };
      const reflow = patch.wordsPerPage !== undefined && patch.wordsPerPage !== doc.style.wordsPerPage;
      return { ...doc, style, pages: reflow ? resegment(doc.pages, { wordsPerPage: style.wordsPerPage }) : doc.pages };
    }, merge);
  },

  setFx(key, patch, merge) {
    get().update((doc) => ({ ...doc, fx: { ...doc.fx, [key]: { ...doc.fx[key], ...patch } } }), merge);
  },

  setFrame(patch, merge) {
    get().update((doc) => ({ ...doc, frame: { ...doc.frame, ...patch } }), merge);
  },

  editWord(id, text) {
    const tokens = text.trim().split(/\s+/).filter(Boolean);
    get().update((doc) => ({
      ...doc,
      pages: mapWords(doc.pages, (word) => {
        if (word.id !== id) return [word];
        if (tokens.length <= 1) return tokens.length ? [{ ...word, text: tokens[0] }] : [];
        // Several words typed into one: share its time span between them.
        const span = (word.end - word.start) / tokens.length;
        return tokens.map((token, i) => ({
          id: i === 0 ? word.id : uid(),
          text: token,
          start: word.start + span * i,
          end: word.start + span * (i + 1),
          emphasis: word.emphasis,
        }));
      }),
    }));
  },

  toggleEmphasis(id) {
    get().update((doc) => ({
      ...doc,
      pages: mapWords(doc.pages, (word) => (word.id === id ? [{ ...word, emphasis: !word.emphasis }] : [word])),
    }));
  },

  splitBefore(id) {
    get().update((doc) => ({
      ...doc,
      pages: doc.pages.flatMap((page) => {
        const at = page.words.findIndex((w) => w.id === id);
        if (at <= 0) return [page];
        return [
          { ...page, words: page.words.slice(0, at) },
          { id: uid("p"), words: page.words.slice(at) },
        ];
      }),
    }));
  },

  mergeWithNext(pageId) {
    get().update((doc) => {
      const at = doc.pages.findIndex((p) => p.id === pageId);
      if (at < 0 || at >= doc.pages.length - 1) return doc;
      const merged = { ...doc.pages[at], words: [...doc.pages[at].words, ...doc.pages[at + 1].words] };
      return { ...doc, pages: [...doc.pages.slice(0, at), merged, ...doc.pages.slice(at + 2)] };
    });
  },

  setEmoji(pageId, emoji) {
    get().update((doc) => ({ ...doc, pages: doc.pages.map((p) => (p.id === pageId ? { ...p, emoji } : p)) }));
  },
}));

useStudio.subscribe((state, previous) => {
  if (state.projectId && state.projectId === previous.projectId && state.doc !== previous.doc) {
    trackDraftWrite(saveEdit(state.projectId, state.doc));
  }
});


/** The one <video> element behind the preview, so any panel can seek or play it. */
export const player = {
  video: null as HTMLVideoElement | null,
  seek(t: number) {
    const v = this.video;
    if (v) v.currentTime = Math.max(0, Math.min(t, Number.isFinite(v.duration) ? v.duration : t));
  },
  toggle() {
    const v = this.video;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  },
};
