import { type Cut, type Page, pageEnd, pageStart, pageText } from "@/lib/captions/types";
import { skipTarget, toOutputTime } from "./timeline";

function stamp(seconds: number, separator: "," | "."): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const pad = (n: number, width = 2) => n.toString().padStart(width, "0");
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}${separator}${pad(ms % 1000, 3)}`;
}

/** Caption cues on the exported video's timeline, skipping anything that was cut out. */
function cues(pages: Page[], offset: number, cuts: Cut[]) {
  return pages
    .filter((p) => p.words.length > 0 && skipTarget(cuts, pageStart(p)) === null)
    .map((p) => ({
      start: toOutputTime(cuts, pageStart(p) + offset),
      end: toOutputTime(cuts, pageEnd(p) + offset),
      text: pageText(p),
    }))
    .filter((c) => c.end > c.start);
}

export function toSrt(pages: Page[], offset: number, cuts: Cut[]): string {
  return cues(pages, offset, cuts)
    .map((c, i) => `${i + 1}\n${stamp(c.start, ",")} --> ${stamp(c.end, ",")}\n${c.text}\n`)
    .join("\n");
}

export function toVtt(pages: Page[], offset: number, cuts: Cut[]): string {
  return `WEBVTT\n\n${cues(pages, offset, cuts)
    .map((c) => `${stamp(c.start, ".")} --> ${stamp(c.end, ".")}\n${c.text}\n`)
    .join("\n")}`;
}

export function toPlainText(pages: Page[]): string {
  return pages.map(pageText).join(" ");
}

export function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
