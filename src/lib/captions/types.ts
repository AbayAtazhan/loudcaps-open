/**
 * The caption document model.
 *
 * Everything the editor can change lives in a `Doc`. A `Doc` is plain JSON, so it
 * can be saved, restored, undone and handed to the renderer without conversion.
 * All times are seconds in the *source* video's timeline; jump cuts are applied
 * at render time rather than by rewriting word timings.
 */

export type Word = {
  id: string;
  text: string;
  start: number;
  end: number;
  /** A keyword the creator wants to stand out. Drawn in the style's emphasis colour. */
  emphasis?: boolean;
};

/** A group of words shown on screen together. */
export type Page = {
  id: string;
  words: Word[];
  /** `undefined` picks an emoji automatically, `null` means none, a string is the creator's choice. */
  emoji?: string | null;
};

/** A range of the source video that is removed from the output. */
export type Cut = { start: number; end: number };

export type TextCase = "upper" | "lower" | "none";
export type Entrance = "none" | "pop" | "fade" | "rise" | "drop" | "zoom" | "slide";

export type CaptionStyle = {
  font: string;
  weight: number;
  italic: boolean;
  /** Font size as a percentage of the frame's short side, so it scales with resolution. */
  size: number;
  textCase: TextCase;
  /** Letter spacing in em. */
  tracking: number;
  /** Line height as a multiple of the font size. */
  leading: number;
  /** Widest a caption block may get, as a fraction of the frame width. */
  maxWidth: number;
  /** Vertical centre of the caption block, as a fraction of the frame height. */
  y: number;
  wordsPerPage: number;
  maxLines: number;
  punctuation: boolean;

  color: string;
  /** Top-to-bottom gradient fill. Overrides `color` when set. */
  gradient: [string, string] | null;
  /** Colour of the word being spoken right now. */
  activeColor: string | null;
  /** Colour of words marked as emphasis. */
  emphasisColor: string | null;
  /** Colour of words that have already been spoken (the karaoke look). */
  spokenColor: string | null;
  /** How visible not-yet-spoken words are, from 0 (hidden) to 1 (fully shown). */
  upcomingOpacity: number;

  /** Outline. `width` is in em. */
  stroke: { color: string; width: number } | null;
  /** Drop shadow or glow. All values in em. */
  shadow: { color: string; blur: number; x: number; y: number } | null;
  /** Background plate behind the whole page or behind each line. Values in em. */
  box: { color: string; radius: number; padX: number; padY: number; scope: "page" | "line" } | null;
  /** Highlight plate that slides behind the word being spoken. Values in em. */
  activeBox: { color: string; radius: number; padX: number; padY: number } | null;
  /** How much the word being spoken grows. 1 means no growth. */
  activeScale: number;

  entrance: Entrance;
  /** Whether the entrance animates the whole page at once or each word as it is spoken. */
  entranceScope: "page" | "word";
  /** Tilt in degrees. Alternates direction on every page. */
  tilt: number;
  /** `sweep` fills the active word left to right as it is spoken. */
  fill: "instant" | "sweep";
  /** Scale every line to the same width for a blocky, poster-like stack. */
  fitLines: boolean;
  /** Stroke drawn under the word being spoken. `thickness` in em. */
  underline: { color: string; thickness: number } | null;
  glitch: boolean;
  /** Blinking block cursor after the last revealed word. */
  cursor: boolean;
};

export type Pace = "natural" | "fast" | "extra";

export type Effects = {
  emoji: { enabled: boolean; size: number };
  hook: { enabled: boolean; text: string; duration: number; color: string; background: string };
  progress: { enabled: boolean; color: string; position: "top" | "bottom" };
  zoom: { enabled: boolean; intensity: number; smooth: boolean };
  cuts: { enabled: boolean; pace: Pace };
};

export type Aspect = "source" | "9:16" | "4:5" | "1:1" | "16:9";

export type Frame = {
  aspect: Aspect;
  /** `cover` crops to fill; `blur` fits the whole picture over a blurred copy of itself. */
  fit: "cover" | "blur";
  /** Crop position from -1 (left/top) to 1 (right/bottom). */
  panX: number;
  panY: number;
};

export type Doc = {
  pages: Page[];
  style: CaptionStyle;
  templateId: string;
  fx: Effects;
  frame: Frame;
  /** Shifts every caption earlier (negative) or later (positive), in seconds. */
  offset: number;
};

export type Template = {
  id: string;
  name: string;
  /** One line describing when to reach for it. */
  blurb: string;
  style: CaptionStyle;
};

export type VideoMeta = {
  name: string;
  size: number;
  width: number;
  height: number;
  duration: number;
  fps: number;
  hasAudio: boolean;
};

let counter = 0;
/** Short unique id. Collision-free within a session, which is all a document needs. */
export function uid(prefix = "w"): string {
  counter = (counter + 1) % 0xffffff;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function pageStart(page: Page): number {
  return page.words[0]?.start ?? 0;
}

export function pageEnd(page: Page): number {
  return page.words[page.words.length - 1]?.end ?? 0;
}

export function pageText(page: Page): string {
  return joinWords(page.words.map((w) => w.text));
}

const NO_SPACE_SCRIPT = /[぀-ヿ㐀-䶿一-鿿豈-﫿฀-๿က-႟຀-໿]/;

/** Languages written without spaces (Chinese, Japanese, Thai, ...) must not get one inserted. */
export function needsSpace(before: string, after: string): boolean {
  if (!before || !after) return false;
  return !(NO_SPACE_SCRIPT.test(before.slice(-1)) && NO_SPACE_SCRIPT.test(after[0]));
}

export function joinWords(texts: string[]): string {
  let out = "";
  for (let i = 0; i < texts.length; i++) {
    if (i > 0 && needsSpace(texts[i - 1], texts[i])) out += " ";
    out += texts[i];
  }
  return out;
}
