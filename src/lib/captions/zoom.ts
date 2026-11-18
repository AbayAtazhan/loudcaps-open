/* SPDX-License-Identifier: AGPL-3.0-only */
import { type Effects, type Page, pageStart } from "@/lib/captions/types";

type Key = { t: number; z: number };

/** Shortest time between two zoom changes. Faster than this reads as jitter. */
const MIN_INTERVAL = 2.4;
const cache = new WeakMap<Page[], { intensity: number; keys: Key[] }>();

function plan(pages: Page[], intensity: number): Key[] {
  const hit = cache.get(pages);
  if (hit?.intensity === intensity) return hit.keys;
  const levels = [1, 1.06 + 0.1 * intensity, 1, 1.1 + 0.16 * intensity];
  const keys: Key[] = [{ t: -Infinity, z: 1 }];
  let last = -Infinity;
  let level = 0;
  // Zoom changes land on the first word of a caption, so they feel like emphasis, not drift.
  for (const page of pages) {
    const t = pageStart(page);
    if (t - last < MIN_INTERVAL) continue;
    if (last !== -Infinity) {
      level = (level + 1) % levels.length;
      keys.push({ t, z: levels[level] });
    }
    last = t;
  }
  cache.set(pages, { intensity, keys });
  return keys;
}

export function zoomAt(pages: Page[], zoom: Effects["zoom"], t: number): number {
  const keys = plan(pages, zoom.intensity);
  let i = 0;
  while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
  if (!zoom.smooth || i === 0) return keys[i].z;
  const p = Math.min(1, (t - keys[i].t) / 0.3);
  const eased = p < 0.5 ? 4 * p * p * p : 1 - (-2 * p + 2) ** 3 / 2;
  return keys[i - 1].z + (keys[i].z - keys[i - 1].z) * eased;
}
