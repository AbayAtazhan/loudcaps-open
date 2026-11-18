import { createStore, get, set } from "idb-keyval";
import { DEFAULT_FRAME } from "@/lib/captions/scene";
import { getTemplate } from "@/lib/captions/templates";
import type { Doc, Page } from "@/lib/captions/types";
import type { ProjectStyle } from "@/lib/project";

export type ClientPreset = {
  id: string;
  name: string;
  styling: ProjectStyle;
  vocabulary: string;
};

const store = createStore("loudcaps-agency", "settings");

export const readPresets = () => get<ClientPreset[]>("client-presets-v1", store);
export const savePresets = (presets: ClientPreset[]) => set("client-presets-v1", presets, store);

export function presetStyle(templateId: string, current: Doc): ProjectStyle {
  if (templateId === "current") {
    const { templateId, style, frame } = current;
    return { templateId, style, frame };
  }
  const template = getTemplate(templateId);
  return { templateId: template.id, style: template.style, frame: DEFAULT_FRAME };
}

function vocabularyKey(text: string): string {
  return text.normalize("NFKC").toLowerCase();
}

export function parseVocabulary(text: string): Map<string, string> {
  const dictionary = new Map<string, string>();
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const split = line.indexOf("=");
    const from = line.slice(0, split).trim();
    const to = line.slice(split + 1).trim();
    if (split < 1 || !/^[\p{L}\p{N}][\p{L}\p{N}\p{M}'’-]*$/u.test(from) || !to) {
      throw new Error(`Vocabulary line ${index + 1} must look like “loudcaps = LoudCaps”.`);
    }
    dictionary.set(vocabularyKey(from), to);
  }
  return dictionary;
}

export function applyVocabulary(pages: Page[], dictionary: Map<string, string>): Page[] {
  if (!dictionary.size) return pages;
  return pages.map((page) => ({
    ...page,
    words: page.words.map((word) => {
      const parts = /^([^\p{L}\p{N}\p{M}]*)([\p{L}\p{N}](?:.*[\p{L}\p{N}\p{M}])?)([^\p{L}\p{N}\p{M}]*)$/u.exec(word.text);
      if (!parts) return word;
      const replacement = dictionary.get(vocabularyKey(parts[2]));
      return replacement === undefined ? word : { ...word, text: parts[1] + replacement + parts[3] };
    }),
  }));
}

export function batchFilename(file: File, position: number): string {
  const stem = file.name.replace(/\.[^.]+$/, "").replace(/[<>:"/\\|?*\x00-\x1f]/g, "-").trim().slice(0, 120) || "video";
  return `${String(position + 1).padStart(2, "0")}-${stem}-loudcaps.mp4`;
}
