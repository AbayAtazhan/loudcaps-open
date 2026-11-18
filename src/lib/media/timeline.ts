import type { Cut } from "@/lib/captions/types";

/**
 * Mapping between the source video's time and the exported video's time.
 * `cuts` are sorted, non-overlapping ranges of source time that are removed.
 */

export function keptRanges(cuts: Cut[], duration: number): Cut[] {
  const kept: Cut[] = [];
  let at = 0;
  for (const cut of cuts) {
    if (cut.start > at) kept.push({ start: at, end: Math.min(cut.start, duration) });
    at = Math.max(at, cut.end);
  }
  if (at < duration) kept.push({ start: at, end: duration });
  return kept.filter((r) => r.end - r.start > 1e-4);
}

export function cutTotal(cuts: Cut[], duration: number): number {
  let total = 0;
  for (const cut of cuts) total += Math.max(0, Math.min(cut.end, duration) - cut.start);
  return total;
}

export function toOutputTime(cuts: Cut[], t: number): number {
  let removed = 0;
  for (const cut of cuts) {
    if (t <= cut.start) break;
    removed += Math.min(t, cut.end) - cut.start;
  }
  return t - removed;
}

export function toSourceTime(cuts: Cut[], tOut: number): number {
  let t = tOut;
  for (const cut of cuts) {
    if (cut.start <= t) t += cut.end - cut.start;
    else break;
  }
  return t;
}

/** If `t` falls inside a cut, returns where playback should jump to. */
export function skipTarget(cuts: Cut[], t: number): number | null {
  for (const cut of cuts) {
    if (t < cut.start - 0.001) return null;
    if (t < cut.end - 0.02) return cut.end;
  }
  return null;
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  return `${m}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
}
