import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/lib/captions/templates";
import { displayText, normalizeWords, retimeWords, segmentWords } from "@/lib/captions/segment";
import { type Word, joinWords } from "@/lib/captions/types";
import { toSrt } from "@/lib/media/subtitles";
import { cutTotal, keptRanges, skipTarget, toOutputTime, toSourceTime } from "@/lib/media/timeline";

/** Words spoken back to back, 0.3s each, starting at `from`. */
const speak = (text: string, from = 0): Word[] =>
  text.split(" ").map((t, i) => ({ id: `${from}-${i}`, text: t, start: from + i * 0.3, end: from + (i + 1) * 0.3 }));

describe("normalizeWords", () => {
  it("orders words, removes overlaps and drops empties", () => {
    const words = normalizeWords(
      [
        { id: "b", text: " world ", start: 0.4, end: 0.9 },
        { id: "a", text: "hello", start: 0, end: 0.6 },
        { id: "c", text: "  ", start: 1, end: 1.2 },
      ],
      10,
    );
    expect(words.map((w) => w.text)).toEqual(["hello", "world"]);
    expect(words[0].end).toBeLessThanOrEqual(words[1].start);
  });

  it("gives zero-length words a real duration and keeps them inside the clip", () => {
    const [word] = normalizeWords([{ id: "a", text: "hi", start: 2, end: 2 }], 2.1);
    expect(word.end).toBeGreaterThan(word.start);
    expect(word.end).toBeLessThanOrEqual(2.1);
  });
});

describe("segmentWords", () => {
  it("spreads a phrase evenly instead of leaving one word over", () => {
    const pages = segmentWords(speak("one two three four five six seven"), { wordsPerPage: 3, maxChars: 99 });
    expect(pages.map((p) => p.words.length)).toEqual([3, 2, 2]);
  });

  it("never lets a caption run across a sentence end or a long pause", () => {
    const words = [...speak("Stop now."), ...speak("Then go", 3)];
    const pages = segmentWords(words, { wordsPerPage: 6 });
    expect(pages.map((p) => joinWords(p.words.map((w) => w.text)))).toEqual(["Stop now.", "Then go"]);
  });

  it("splits a page whose text would be too long", () => {
    const pages = segmentWords(speak("extraordinarily complicated terminology"), { wordsPerPage: 3, maxChars: 20 });
    expect(pages.length).toBeGreaterThan(1);
  });
});

describe("text handling", () => {
  it("strips punctuation and applies case without erasing symbol-only words", () => {
    expect(displayText("Hello,", "upper", false)).toBe("HELLO");
    expect(displayText("don't", "none", false)).toBe("don't");
    expect(displayText("...", "none", false)).toBe("...");
  });

  it("keeps timings when the word count is unchanged and shares them out when it isn't", () => {
    const page = { id: "p", words: speak("teh cat") };
    expect(retimeWords(page, "the cat")[0].start).toBe(0);
    const three = retimeWords(page, "the big cat");
    expect(three).toHaveLength(3);
    expect(three[0].start).toBe(0);
    expect(three[2].end).toBeCloseTo(0.6);
  });

  it("does not insert spaces between Chinese or Japanese characters", () => {
    expect(joinWords(["你", "好"])).toBe("你好");
    expect(joinWords(["hello", "world"])).toBe("hello world");
  });
});

describe("jump cuts and time mapping", () => {
  const pages = segmentWords([...speak("first part"), ...speak("second part", 3)], { wordsPerPage: 3 });
  const cuts = [{ start: 0.68, end: 2.92 }, { start: 3.76, end: 5 }];

  it("maps source time to output time and back", () => {
    const removed = cutTotal(cuts, 5);
    expect(toOutputTime(cuts, 5)).toBeCloseTo(5 - removed);
    for (const t of [0, 0.3, 3.1, 3.5]) expect(toSourceTime(cuts, toOutputTime(cuts, t))).toBeCloseTo(t);
    expect(skipTarget(cuts, 1.5)).toBe(cuts[0].end);
    expect(skipTarget(cuts, 0.2)).toBeNull();
    expect(keptRanges(cuts, 5).reduce((sum, r) => sum + r.end - r.start, 0)).toBeCloseTo(5 - removed);
  });

  it("writes subtitles on the cut timeline", () => {
    const srt = toSrt(pages, 0, cuts);
    expect(srt).toContain("1\n00:00:00,000 --> 00:00:00,600\nfirst part");
    expect(srt).toContain("second part");
    expect(srt).not.toContain("00:00:03");
  });
});

it("offers all 18 caption templates with unique IDs", () => {
  expect(TEMPLATES).toHaveLength(18);
  expect(new Set(TEMPLATES.map((template) => template.id)).size).toBe(18);
});
