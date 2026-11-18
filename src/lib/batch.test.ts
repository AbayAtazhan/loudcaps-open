import { describe, expect, it } from "vitest";
import { planCuts } from "./captions/cuts";
import { applyVocabulary, batchFilename, parseVocabulary } from "./batch";

describe("batch exports", () => {
  const pages = [{
    id: "1",
    words: [
      { id: "first", text: "“logcaps,”", start: 0.1, end: 0.5 },
      { id: "second", text: "test", start: 2, end: 2.4 },
    ],
  }];

  it("keeps punctuation and timings when applying client vocabulary", () => {
    expect(applyVocabulary(pages, parseVocabulary("LogCaps = LoudCaps\r\n"))[0].words[0])
      .toEqual({ ...pages[0].words[0], text: "“LoudCaps,”" });
    expect(pages[0].words[0].text).toBe("“logcaps,”");
    expect(() => parseVocabulary("a bad rule")).toThrow("Vocabulary line 1");
  });

  it("uses the exact video timeline for both cut and uncut subtitles", async () => {
    const { emptyDoc } = await import("@/lib/project");
    const { exportPlan } = await import("@/lib/media/project-export");
    const { toSrt } = await import("@/lib/media/subtitles");
    const doc = { ...emptyDoc(), pages };
    doc.fx = { ...doc.fx, cuts: { enabled: true, pace: "fast" } };
    const meta = { duration: 3, width: 1080, height: 1920, fps: 30, size: 1, name: "test.mp4", hasAudio: true };
    const cut = exportPlan(doc, meta, 2160, 60);
    const uncut = exportPlan({ ...doc, fx: { ...doc.fx, cuts: { ...doc.fx.cuts, enabled: false } } }, meta, 1080, 30);
    expect(planCuts(pages, 3, "fast")).toHaveLength(2);
    expect(cut).toMatchObject({ width: 2160, height: 3840, fps: 60 });
    expect(cut.cuts).toHaveLength(2);
    expect(uncut).toMatchObject({ cuts: [], width: 1080, height: 1920, fps: 30 });
    expect(toSrt(uncut.doc.pages, uncut.doc.offset, uncut.cuts)).toContain("00:00:02,400");
    expect(toSrt(cut.doc.pages, cut.doc.offset, cut.cuts)).not.toContain("00:00:02,400");
  });

  it("gives duplicate filenames distinct, filesystem-safe output names", () => {
    const file = new File([], "client:clip?.mov");
    expect(batchFilename(file, 0)).toBe("01-client-clip--loudcaps.mp4");
    expect(batchFilename(file, 1)).toBe("02-client-clip--loudcaps.mp4");
  });
});
