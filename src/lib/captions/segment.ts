import { type Page, type Word, needsSpace, uid } from "./types";

/** A pause this long between two words always starts a new page. */
const PAUSE_BREAK = 0.6;
const SENTENCE_END = /[.!?…。！？]["'”’)]*$/;
const CLAUSE_END = /[,;:，、；：]["'”’)]*$/;
const MIN_WORD = 0.05;

/**
 * Cleans up raw speech-recognition timings so the renderer can trust them:
 * words are in order, never overlap, never have zero length, and stay inside the clip.
 */
export function normalizeWords(raw: Word[], duration: number): Word[] {
  const limit = duration > 0 ? duration : Infinity;
  const words = raw
    .map((w) => ({ ...w, text: w.text.trim() }))
    .filter((w) => w.text.length > 0 && Number.isFinite(w.start))
    .sort((a, b) => a.start - b.start);

  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    w.start = Math.max(0, Math.min(w.start, limit));
    if (!Number.isFinite(w.end) || w.end <= w.start) w.end = w.start + 0.25;
    if (i > 0) {
      const prev = words[i - 1];
      if (w.start < prev.start + MIN_WORD) w.start = prev.start + MIN_WORD;
      if (prev.end > w.start) prev.end = w.start;
    }
    if (w.end < w.start + MIN_WORD) w.end = w.start + MIN_WORD;
    // Recognisers sometimes stretch a word across the silence that follows it.
    if (w.end - w.start > 1.6) w.end = w.start + Math.min(1.6, 0.25 + w.text.length * 0.09);
    w.end = Math.min(w.end, limit);
    if (w.end <= w.start) w.start = Math.max(0, w.end - MIN_WORD);
  }
  return words;
}

/** Splits `n` items into groups of at most `size`, as evenly as possible (7 by 3 gives 3,2,2). */
function balancedSizes(n: number, size: number): number[] {
  const groups = Math.ceil(n / size);
  const base = Math.floor(n / groups);
  let extra = n % groups;
  const sizes: number[] = [];
  for (let i = 0; i < groups; i++) {
    sizes.push(base + (extra > 0 ? 1 : 0));
    extra--;
  }
  return sizes;
}

function charLength(words: Word[]): number {
  let n = 0;
  for (let i = 0; i < words.length; i++) {
    n += words[i].text.length;
    if (i > 0 && needsSpace(words[i - 1].text, words[i].text)) n++;
  }
  return n;
}

export type SegmentOptions = {
  wordsPerPage: number;
  /** Soft cap on characters per page, so three long words don't overflow the frame. */
  maxChars?: number;
};

/**
 * Groups words into the pages shown on screen.
 *
 * Pages never straddle a sentence end or a long pause, because a caption that
 * lingers across a pause reads as out of sync. Inside a phrase, words are spread
 * evenly so the last page isn't a lonely leftover word.
 */
export function segmentWords(words: Word[], options: SegmentOptions): Page[] {
  const perPage = Math.max(1, Math.round(options.wordsPerPage));
  const maxChars = options.maxChars ?? Math.max(14, perPage * 9);

  // 1. Break into phrases at sentence ends and pauses.
  const phrases: Word[][] = [];
  let current: Word[] = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    current.push(word);
    const next = words[i + 1];
    const pause = next ? next.start - word.end : Infinity;
    const clauseBreak = CLAUSE_END.test(word.text) && current.length >= Math.min(perPage, 2) && perPage > 1;
    if (!next || pause >= PAUSE_BREAK || SENTENCE_END.test(word.text) || (clauseBreak && pause >= 0.18)) {
      phrases.push(current);
      current = [];
    }
  }
  if (current.length) phrases.push(current);

  // 2. Spread each phrase over evenly sized pages, splitting further if a page is too long.
  const pages: Page[] = [];
  for (const phrase of phrases) {
    let cursor = 0;
    for (const size of balancedSizes(phrase.length, perPage)) {
      const group = phrase.slice(cursor, cursor + size);
      cursor += size;
      for (const part of splitByChars(group, maxChars)) {
        pages.push({ id: uid("p"), words: part });
      }
    }
  }
  return pages;
}

function splitByChars(group: Word[], maxChars: number): Word[][] {
  if (group.length <= 1 || charLength(group) <= maxChars) return [group];
  const mid = Math.ceil(group.length / 2);
  return [...splitByChars(group.slice(0, mid), maxChars), ...splitByChars(group.slice(mid), maxChars)];
}

/** Re-flows existing pages for a new words-per-page setting, keeping edits made to the words. */
export function resegment(pages: Page[], options: SegmentOptions): Page[] {
  return segmentWords(
    pages.flatMap((p) => p.words),
    options,
  );
}

/**
 * Applies edited text to a page. If the word count is unchanged the timings are
 * kept exactly; otherwise the page's time span is shared out by word length,
 * which is close to how long each word takes to say.
 */
export function retimeWords(page: Page, text: string): Word[] {
  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];
  if (tokens.length === page.words.length) {
    return page.words.map((w, i) => ({ ...w, text: tokens[i] }));
  }
  const start = page.words[0].start;
  const end = page.words[page.words.length - 1].end;
  const weights = tokens.map((t) => t.length + 1.5);
  const total = weights.reduce((a, b) => a + b, 0);
  const span = Math.max(end - start, tokens.length * MIN_WORD);
  let t = start;
  return tokens.map((token, i) => {
    const length = (weights[i] / total) * span;
    const word: Word = { id: uid(), text: token, start: t, end: t + length };
    t += length;
    return word;
  });
}

const TRIM_PUNCTUATION = /^[\s"“”‘’«»(\[]+|[\s.,!?;:…"“”’»)\]。，、！？；：]+$/g;

/** Text as it is drawn: punctuation optionally stripped, case applied. */
export function displayText(text: string, textCase: "upper" | "lower" | "none", punctuation: boolean): string {
  let out = text;
  if (!punctuation) {
    const stripped = out.replace(TRIM_PUNCTUATION, "");
    // Keep the original if stripping would erase it ("—", "...").
    if (stripped.length > 0) out = stripped;
  }
  if (textCase === "upper") return out.toLocaleUpperCase();
  if (textCase === "lower") return out.toLocaleLowerCase();
  return out;
}
