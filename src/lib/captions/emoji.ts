/* SPDX-License-Identifier: AGPL-3.0-only */
import type { Page } from "@/lib/captions/types";

const RULES = `
💰 money cash dollar dollars rich wealth wealthy paid pay profit profits revenue income salary million millions billion
🔥 fire hot viral lit crazy insane wild
🧠 brain think thinking mind smart learn learning idea ideas knowledge psychology
⏰ time clock minutes hours late early deadline
❤️ love heart loved loving favorite
😂 funny laugh laughing hilarious joke lol
😱 shocked shocking scary terrifying unbelievable
🚀 launch launched grow growth growing scale rocket startup faster
📈 increase increased sales chart stocks market up
📉 decrease drop dropped crash crashed down lost
🎯 goal goals target focus exactly precise
💡 tip tips trick tricks hack hacks secret secrets
👀 look watch see saw seen eyes notice
🎬 video videos film edit editing content clip clips
📱 phone iphone app apps tiktok instagram mobile scroll scrolling
💻 computer laptop code coding software website online
🎵 music song songs sound audio beat
📚 book books read reading study studying school college
💪 strong strength gym workout muscle power fitness
🏆 win winner winning won best champion success successful
❌ wrong mistake mistakes never stop bad worst fail failed failure
✅ right correct yes done finished perfect
⚠️ warning careful danger dangerous risk
🤔 why how question wonder maybe
🙏 thank thanks please grateful
🎉 party celebrate congrats congratulations birthday
😴 sleep sleeping tired bed rest
🍔 food eat eating hungry burger lunch dinner
☕ coffee morning breakfast
🍕 pizza
🌍 world earth global country countries travel
🏠 home house room
🚗 car cars drive driving
✈️ flight fly flying plane airport trip
👑 king queen boss legend
💎 value valuable premium quality luxury diamond
🤝 deal partner partners team together
📧 email emails inbox
🛒 buy bought shop shopping store customer customers
🆓 free
🤯 mindblowing genius incredible
😎 cool easy
👇 below here link comment comments
1️⃣ first one
`;

const LOOKUP = new Map<string, string>();
for (const line of RULES.trim().split("\n")) {
  const [glyph, ...keywords] = line.trim().split(/\s+/);
  for (const k of keywords) LOOKUP.set(k, glyph);
}

function match(page: Page): string | null {
  for (const word of page.words) {
    const key = word.text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    const hit = LOOKUP.get(key) ?? (key.endsWith("s") ? LOOKUP.get(key.slice(0, -1)) : undefined);
    if (hit) return hit;
  }
  return null;
}

const cache = new WeakMap<Page[], (string | null)[]>();

/**
 * Returns a lookup from page index to the emoji shown above it. A creator's own
 * choice always wins. Automatic picks never repeat back to back and never land on
 * two pages in a row, because an emoji on every caption stops meaning anything.
 */
export function emojiPicker(pages: Page[]): (index: number) => string | null {
  let picks = cache.get(pages);
  if (!picks) {
    picks = [];
    let lastGlyph: string | null = null;
    let lastAuto = -2;
    for (let i = 0; i < pages.length; i++) {
      const manual = pages[i].emoji;
      if (manual !== undefined) {
        picks.push(manual || null);
        continue;
      }
      const auto = match(pages[i]);
      if (auto && auto !== lastGlyph && i - lastAuto > 1) {
        picks.push(auto);
        lastGlyph = auto;
        lastAuto = i;
      } else picks.push(null);
    }
    cache.set(pages, picks);
  }
  const resolved = picks;
  return (index) => resolved[index] ?? null;
}
