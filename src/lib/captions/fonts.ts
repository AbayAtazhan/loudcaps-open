import manifest from "./font-manifest.json";
import { sitePath } from "@/lib/site";
import type { Page } from "./types";

const glyphCache = new WeakMap<Page[], string>();

/** Every distinct character in the transcript, so only the font files it needs are fetched. */
export function glyphsOf(pages: Page[]): string {
  let glyphs = glyphCache.get(pages);
  if (glyphs === undefined) {
    const text = pages.flatMap((page) => page.words.map((word) => word.text)).join("");
    glyphs = [...new Set(text + text.toLocaleUpperCase() + text.toLocaleLowerCase())].join("");
    glyphCache.set(pages, glyphs);
  }
  return glyphs;
}

type Face = { weight: number; style: string; subset: string; range: string; file: string };
type Family = { weights: number[]; italics: number[]; faces: Face[] };

const FAMILIES = manifest as Record<string, Family>;

export const FONT_NAMES = Object.keys(FAMILIES);

export function weightsFor(font: string): number[] {
  return FAMILIES[font]?.weights ?? [400, 700];
}

const FALLBACK = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

export function fontString(font: string, weight: number, italic: boolean, px: number): string {
  return `${italic ? "italic " : ""}${weight} ${px.toFixed(2)}px "${font}", ${FALLBACK}`;
}

const registered = new Set<string>();
const listeners = new Set<() => void>();
let epoch = 0;

/** Increases whenever a font finishes loading, so cached text layouts know to re-measure. */
export function fontEpoch(): number {
  return epoch;
}

export function onFontsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * Makes a caption font usable on a canvas. Faces are registered per Unicode subset,
 * so passing the text that will be drawn loads only the files that text needs.
 */
export async function ensureFont(font: string, weight: number, italic = false, sample = "Aa"): Promise<void> {
  if (typeof document === "undefined") return;
  const family = FAMILIES[font];
  if (family && !registered.has(font)) {
    registered.add(font);
    for (const face of family.faces) {
      document.fonts.add(
        new FontFace(font, `url(${sitePath(`/fonts/${face.file}`)}) format("woff2")`, {
          weight: String(face.weight),
          style: face.style,
          unicodeRange: face.range,
        }),
      );
    }
  }
  try {
    await document.fonts.load(fontString(font, weight, italic, 32), sample || "Aa");
  } catch {
    // The canvas falls back to system fonts, which is better than failing.
  }
  epoch++;
  listeners.forEach((fn) => fn());
}
