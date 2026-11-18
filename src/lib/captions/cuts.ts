/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Cut, Pace, Page } from "@/lib/captions/types";

/** `gap`: pauses longer than this are cut. `keep`: breathing room left around speech. */
const PACES: Record<Pace, { gap: number; keep: number }> = {
  natural: { gap: 0.7, keep: 0.28 },
  fast: { gap: 0.42, keep: 0.16 },
  extra: { gap: 0.26, keep: 0.08 },
};

const cache = new WeakMap<Page[], { key: string; cuts: Cut[] }>();

/** Finds the silences between spoken words and returns the ranges to remove. */
export function planCuts(pages: Page[], duration: number, pace: Pace): Cut[] {
  const key = `${pace}|${duration}`;
  const hit = cache.get(pages);
  if (hit?.key === key) return hit.cuts;

  const { gap, keep } = PACES[pace];
  const words = pages.flatMap((p) => p.words);
  const cuts: Cut[] = [];
  if (words.length) {
    const first = words[0];
    if (first.start > gap) cuts.push({ start: 0, end: first.start - keep });
    for (let i = 0; i < words.length - 1; i++) {
      const pause = words[i + 1].start - words[i].end;
      if (pause > gap) cuts.push({ start: words[i].end + keep / 2, end: words[i + 1].start - keep / 2 });
    }
    const last = words[words.length - 1];
    if (duration - last.end > gap) cuts.push({ start: last.end + keep, end: duration });
  }
  const clean = cuts.filter((c) => c.end - c.start > 0.05);
  cache.set(pages, { key, cuts: clean });
  return clean;
}
