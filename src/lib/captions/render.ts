import { fontEpoch, fontString } from "./fonts";
import { displayText } from "./segment";
import {
  type CaptionStyle,
  type Effects,
  type Entrance,
  type Frame,
  type Page,
  type Word,
  needsSpace,
  pageEnd,
  pageStart,
} from "./types";

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const cubicOut = (p: number) => 1 - (1 - p) ** 3;
const backOut = (p: number) => 1 + 2.9 * (p - 1) ** 3 + 1.9 * (p - 1) ** 2;
const bounceOut = (p: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (p < 1 / d) return n * p * p;
  if (p < 2 / d) return n * (p -= 1.5 / d) * p + 0.75;
  if (p < 2.5 / d) return n * (p -= 2.25 / d) * p + 0.9375;
  return n * (p -= 2.625 / d) * p + 0.984375;
};

/* ------------------------------------------------------------------ timing */

/** A caption stays up this long after its last word, unless the next one arrives sooner. */
const LINGER = 0.35;
/** Gaps shorter than this are bridged, so captions don't flicker off between phrases. */
const BRIDGE = 0.9;

type Timeline = { starts: Float64Array; ends: Float64Array };
const timelines = new WeakMap<Page[], Timeline>();

function timeline(pages: Page[]): Timeline {
  let tl = timelines.get(pages);
  if (!tl) {
    const n = pages.length;
    tl = { starts: new Float64Array(n), ends: new Float64Array(n) };
    for (let i = 0; i < n; i++) {
      tl.starts[i] = pageStart(pages[i]);
      const last = pageEnd(pages[i]);
      const next = i + 1 < n ? pageStart(pages[i + 1]) : Infinity;
      tl.ends[i] = next - last <= BRIDGE ? next : last + LINGER;
    }
    timelines.set(pages, tl);
  }
  return tl;
}

/** Index of the page on screen at time `t`, or -1 when nothing is showing. */
export function activePageIndex(pages: Page[], t: number): number {
  const { starts, ends } = timeline(pages);
  let lo = 0;
  let hi = starts.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found >= 0 && t < ends[found] ? found : -1;
}

/* ------------------------------------------------------------------ layout */

type LaidWord = { word: Word; text: string; x: number; w: number; line: number };
type Line = { x: number; w: number; top: number; h: number; mid: number; baseline: number; px: number };
type Layout = {
  words: LaidWord[];
  lines: Line[];
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
  px: number;
  style: CaptionStyle;
  W: number;
  H: number;
  epoch: number;
};

const layouts = new WeakMap<Page, Layout>();

function setFont(ctx: Ctx2D, style: CaptionStyle, px: number) {
  ctx.font = fontString(style.font, style.weight, style.italic, px);
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${(style.tracking * px).toFixed(2)}px`;
}

/** Splits words into exactly `count` lines so the widest line is as narrow as possible. */
function partition(widths: number[], gaps: number[], count: number): { breaks: number[]; widest: number } {
  const n = widths.length;
  const prefix = [0];
  for (let i = 0; i < n; i++) prefix.push(prefix[i] + widths[i] + (i > 0 ? gaps[i] : 0));
  const span = (a: number, b: number) => prefix[b] - prefix[a] - (a > 0 ? gaps[a] : 0);
  const best = (a: number, k: number): { breaks: number[]; widest: number } => {
    if (k === 1) return { breaks: [a], widest: span(a, n) };
    let out = { breaks: [a], widest: Infinity };
    for (let b = a + 1; b <= n - (k - 1); b++) {
      const rest = best(b, k - 1);
      const widest = Math.max(span(a, b), rest.widest);
      if (widest < out.widest) out = { breaks: [a, ...rest.breaks], widest };
    }
    return out;
  };
  return best(0, Math.min(count, n));
}

function layoutPage(ctx: Ctx2D, page: Page, style: CaptionStyle, W: number, H: number): Layout {
  const epoch = fontEpoch();
  const hit = layouts.get(page);
  if (hit && hit.style === style && hit.W === W && hit.H === H && hit.epoch === epoch) return hit;

  const texts = page.words.map((w) => displayText(w.text, style.textCase, style.punctuation));
  const maxW = style.maxWidth * W;
  let px = (style.size / 100) * Math.min(W, H);
  let widths: number[] = [];
  let gaps: number[] = [];
  let fit = { breaks: [0], widest: 0 };

  // Use as few lines as fit; if even the maximum overflows, shrink the type until it fits.
  for (let attempt = 0; attempt < 14; attempt++) {
    setFont(ctx, style, px);
    const space = ctx.measureText(" ").width;
    widths = texts.map((t) => ctx.measureText(t).width);
    gaps = texts.map((t, i) => (i > 0 && needsSpace(texts[i - 1], t) ? space : 0));
    for (let k = 1; k <= Math.max(1, style.maxLines); k++) {
      fit = partition(widths, gaps, k);
      if (fit.widest <= maxW) break;
    }
    if (fit.widest <= maxW) break;
    px *= 0.92;
  }
  const capRatio = (ctx.measureText("H").actualBoundingBoxAscent || px * 0.7) / px;

  const target = Math.min(maxW, fit.widest);
  const specs = fit.breaks.map((a, i) => {
    const b = fit.breaks[i + 1] ?? texts.length;
    let w = 0;
    for (let j = a; j < b; j++) w += widths[j] + (j > a ? gaps[j] : 0);
    const scale = style.fitLines && w > 0 ? clamp(target / w, 0.55, 2.6) : 1;
    return { a, b, w: w * scale, scale };
  });
  const blockW = Math.max(...specs.map((s) => s.w));
  const blockH = specs.reduce((sum, s) => sum + px * s.scale * style.leading, 0);
  const margin = H * 0.04;
  const cy = clamp(style.y * H, blockH / 2 + margin, H - blockH / 2 - margin);

  const lines: Line[] = [];
  const words: LaidWord[] = [];
  let top = cy - blockH / 2;
  specs.forEach((s, li) => {
    const lpx = px * s.scale;
    const h = lpx * style.leading;
    const mid = top + h / 2;
    const x0 = (W - s.w) / 2;
    lines.push({ x: x0, w: s.w, top, h, mid, baseline: mid + (capRatio * lpx) / 2, px: lpx });
    let x = x0;
    for (let j = s.a; j < s.b; j++) {
      if (j > s.a) x += gaps[j] * s.scale;
      const w = widths[j] * s.scale;
      words.push({ word: page.words[j], text: texts[j], x, w, line: li });
      x += w;
    }
    top += h;
  });

  const layout: Layout = {
    words,
    lines,
    x: (W - blockW) / 2,
    y: cy - blockH / 2,
    w: blockW,
    h: blockH,
    cx: W / 2,
    cy,
    px,
    style,
    W,
    H,
    epoch,
  };
  layouts.set(page, layout);
  return layout;
}

/* --------------------------------------------------------------- animation */

/** `a` alpha, `s` scale, `dx`/`dy` offset in em. */
type Motion = { a: number; s: number; dx: number; dy: number };
const STILL: Motion = { a: 1, s: 1, dx: 0, dy: 0 };
const DURATION: Record<Entrance, number> = {
  none: 0,
  pop: 0.16,
  fade: 0.14,
  rise: 0.18,
  drop: 0.34,
  zoom: 0.16,
  slide: 0.16,
};

function entrance(kind: Entrance, elapsed: number, index: number): Motion {
  const d = DURATION[kind];
  if (!d || elapsed >= d) return STILL;
  const p = clamp01(elapsed / d);
  switch (kind) {
    case "pop":
      return { a: Math.min(1, p * 2.5), s: 0.7 + 0.3 * backOut(p), dx: 0, dy: 0 };
    case "fade":
      return { a: p, s: 1, dx: 0, dy: 0 };
    case "rise":
      return { a: p, s: 1, dx: 0, dy: (1 - cubicOut(p)) * 0.45 };
    case "drop":
      return { a: Math.min(1, p * 3), s: 1, dx: 0, dy: -(1 - bounceOut(p)) * 0.9 };
    case "zoom":
      return { a: Math.min(1, p * 2), s: 1.5 - 0.5 * cubicOut(p), dx: 0, dy: 0 };
    case "slide":
      return { a: Math.min(1, p * 2), s: 1, dx: (1 - cubicOut(p)) * 1.1 * (index % 2 ? 1 : -1), dy: 0 };
    default:
      return STILL;
  }
}

function plate(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fill();
}

/* ----------------------------------------------------------------- captions */

const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';

/**
 * Draws the caption for time `t`. Used unchanged by the live preview and the
 * exporter, which is what makes the export match what the creator saw.
 */
export function drawCaptions(
  ctx: Ctx2D,
  W: number,
  H: number,
  t: number,
  pages: Page[],
  style: CaptionStyle,
  emoji?: (index: number) => string | null,
  emojiSize = 1.4,
): void {
  const index = activePageIndex(pages, t);
  if (index < 0 || !pages[index].words.length) return;
  const L = layoutPage(ctx, pages[index], style, W, H);
  const start = L.words[0].word.start;
  let active = 0;
  for (let i = 0; i < L.words.length; i++) {
    if (L.words[i].word.start <= t) active = i;
    else break;
  }
  const activeStart = L.words[active].word.start;
  const perWord = style.entranceScope === "word";
  const page = perWord ? STILL : entrance(style.entrance, t - start, index);

  ctx.save();
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.lineJoin = "round";
  ctx.miterLimit = 2;
  ctx.translate(L.cx + page.dx * L.px, L.cy + page.dy * L.px);
  if (style.tilt) ctx.rotate(((style.tilt * Math.PI) / 180) * (index % 2 ? -1 : 1));
  if (page.s !== 1) ctx.scale(page.s, page.s);
  ctx.translate(-L.cx, -L.cy);

  if (style.box) {
    const b = style.box;
    ctx.globalAlpha = page.a;
    ctx.fillStyle = b.color;
    if (b.scope === "page") {
      plate(ctx, L.x - b.padX * L.px, L.y - b.padY * L.px, L.w + 2 * b.padX * L.px, L.h + 2 * b.padY * L.px, b.radius * L.px);
    } else {
      for (const line of L.lines) {
        const h = line.px * (1.08 + 2 * b.padY);
        plate(ctx, line.x - b.padX * line.px, line.mid - h / 2, line.w + 2 * b.padX * line.px, h, b.radius * line.px);
      }
    }
  }

  if (style.activeBox) {
    const b = style.activeBox;
    const rect = (i: number) => {
      const w = L.words[i];
      const line = L.lines[w.line];
      const h = line.px * (1.04 + 2 * b.padY);
      return { x: w.x - b.padX * line.px, y: line.mid - h / 2, w: w.w + 2 * b.padX * line.px, h, r: b.radius * line.px };
    };
    const to = rect(active);
    const k = cubicOut(clamp01((t - activeStart) / 0.1));
    const from = active > 0 ? rect(active - 1) : to;
    ctx.globalAlpha = page.a * (active > 0 ? 1 : k);
    ctx.fillStyle = b.color;
    plate(
      ctx,
      from.x + (to.x - from.x) * k,
      from.y + (to.y - from.y) * k,
      from.w + (to.w - from.w) * k,
      from.h + (to.h - from.h) * k,
      to.r,
    );
  }

  // Work out how each word looks right now.
  const looks = L.words.map((w, i) => {
    const state = i < active ? "spoken" : i === active ? "active" : "upcoming";
    let alpha = state === "upcoming" ? style.upcomingOpacity : 1;
    let motion = STILL;
    if (perWord && state !== "upcoming") {
      motion = entrance(style.entrance, t - w.word.start, i);
      alpha *= motion.a;
    }
    let scale = motion.s;
    if (style.activeScale !== 1) {
      const grow = style.activeScale - 1;
      if (state === "active") scale *= 1 + grow * cubicOut(clamp01((t - w.word.start) / 0.09));
      else if (i === active - 1) scale *= 1 + grow * (1 - clamp01((t - activeStart) / 0.09));
    }
    let color = style.color;
    if (w.word.emphasis && style.emphasisColor) color = style.emphasisColor;
    if (state === "spoken" && style.spokenColor) color = style.spokenColor;
    if (state === "active" && style.activeColor && style.fill !== "sweep") color = style.activeColor;
    return { state, alpha: alpha * page.a, scale, dx: motion.dx, dy: motion.dy, color };
  });

  const each = (fn: (w: LaidWord, line: Line, look: (typeof looks)[number]) => void) => {
    L.words.forEach((w, i) => {
      const look = looks[i];
      if (look.alpha <= 0.004) return;
      const line = L.lines[w.line];
      ctx.save();
      ctx.globalAlpha = look.alpha;
      if (look.scale !== 1 || look.dx || look.dy) {
        const cx = w.x + w.w / 2;
        ctx.translate(cx + look.dx * line.px, line.mid + look.dy * line.px);
        ctx.scale(look.scale, look.scale);
        ctx.translate(-cx, -line.mid);
      }
      setFont(ctx, style, line.px);
      fn(w, line, look);
      ctx.restore();
    });
  };
  const applyShadow = (px: number) => {
    if (!style.shadow) return;
    ctx.shadowColor = style.shadow.color;
    ctx.shadowBlur = style.shadow.blur * px;
    ctx.shadowOffsetX = style.shadow.x * px;
    ctx.shadowOffsetY = style.shadow.y * px;
  };

  // Outlines first, so a word's outline never covers its neighbour's fill.
  if (style.stroke) {
    const stroke = style.stroke;
    each((w, line) => {
      applyShadow(line.px);
      ctx.strokeStyle = stroke.color;
      ctx.lineWidth = stroke.width * line.px * 2;
      ctx.strokeText(w.text, w.x, line.baseline);
    });
  }

  each((w, line, look) => {
    if (style.glitch) {
      const jolt = 0.035 + 0.07 * Math.max(0, 1 - (t - start) / 0.14) * Math.abs(Math.sin(t * 97));
      ctx.fillStyle = "#00F0FF";
      ctx.fillText(w.text, w.x - jolt * line.px, line.baseline);
      ctx.fillStyle = "#FF2D95";
      ctx.fillText(w.text, w.x + jolt * line.px, line.baseline + jolt * 0.4 * line.px);
    }
    if (!style.stroke) applyShadow(line.px);
    if (style.gradient) {
      const g = ctx.createLinearGradient(0, line.mid - line.px * 0.45, 0, line.mid + line.px * 0.45);
      g.addColorStop(0, style.gradient[0]);
      g.addColorStop(1, style.gradient[1]);
      ctx.fillStyle = look.state === "active" && style.activeColor ? look.color : g;
    } else ctx.fillStyle = look.color;
    ctx.fillText(w.text, w.x, line.baseline);

    if (style.fill === "sweep" && look.state === "active" && style.activeColor) {
      const span = Math.max(0.05, w.word.end - w.word.start);
      ctx.shadowColor = "transparent";
      ctx.beginPath();
      ctx.rect(w.x - line.px * 0.1, line.top - line.px, (w.w + line.px * 0.2) * clamp01((t - w.word.start) / span), line.h + line.px * 2);
      ctx.clip();
      ctx.fillStyle = style.activeColor;
      ctx.fillText(w.text, w.x, line.baseline);
    }
  });

  const current = L.words[active];
  const currentLine = L.lines[current.line];
  if (style.underline) {
    const grow = cubicOut(clamp01((t - activeStart) / 0.12));
    ctx.globalAlpha = page.a;
    ctx.strokeStyle = style.underline.color;
    ctx.lineWidth = style.underline.thickness * currentLine.px;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(current.x, currentLine.baseline + currentLine.px * 0.16);
    ctx.lineTo(current.x + current.w * grow, currentLine.baseline + currentLine.px * 0.13);
    ctx.stroke();
  }
  if (style.cursor && (t * 2.2) % 1 < 0.6) {
    ctx.globalAlpha = page.a;
    ctx.fillStyle = style.activeColor ?? style.color;
    ctx.fillRect(current.x + current.w + currentLine.px * 0.14, currentLine.mid - currentLine.px * 0.42, currentLine.px * 0.5, currentLine.px * 0.84);
  }

  const glyph = emoji?.(index);
  if (glyph) {
    const size = emojiSize * L.px;
    const pad = style.box ? style.box.padY * L.px : 0;
    const above = L.y - pad - size * 0.62;
    const y = above - size / 2 > H * 0.03 ? above : L.y + L.h + pad + size * 0.62;
    const pop = backOut(clamp01((t - start) / 0.22));
    ctx.globalAlpha = Math.min(1, (t - start) / 0.08);
    ctx.shadowColor = "rgba(0,0,0,0.35)";
    ctx.shadowBlur = size * 0.12;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = size * 0.04;
    ctx.font = `${(size * (0.6 + 0.4 * pop)).toFixed(1)}px ${EMOJI_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#fff";
    ctx.fillText(glyph, L.cx, y);
  }
  ctx.restore();
}

/* ------------------------------------------------------------------- extras */

/** The title card shown over the first seconds of the video. */
export function drawHook(ctx: Ctx2D, W: number, H: number, tOut: number, hook: Effects["hook"], style: CaptionStyle) {
  const text = hook.text.trim();
  if (!hook.enabled || !text || tOut < 0 || tOut >= hook.duration) return;
  const px = Math.min(W, H) * 0.058;
  ctx.save();
  ctx.font = fontString(style.font, style.weight, false, px);
  if ("letterSpacing" in ctx) ctx.letterSpacing = "0px";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > W * 0.78) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  lines.push(line);

  const lineH = px * 1.5;
  const fadeOut = clamp01((hook.duration - tOut) / 0.25);
  const pop = backOut(clamp01(tOut / 0.22));
  const cy = H * 0.16 + (lines.length * lineH) / 2;
  ctx.translate(W / 2, cy);
  ctx.scale(0.8 + 0.2 * pop, 0.8 + 0.2 * pop);
  ctx.translate(-W / 2, -cy);
  ctx.globalAlpha = Math.min(1, tOut / 0.1) * fadeOut;
  lines.forEach((l, i) => {
    const y = H * 0.16 + lineH * (i + 0.5);
    const w = ctx.measureText(l).width + px * 1.1;
    ctx.fillStyle = hook.background;
    plate(ctx, W / 2 - w / 2, y - lineH * 0.47, w, lineH * 0.94, px * 0.28);
    ctx.fillStyle = hook.color;
    ctx.fillText(l, W / 2, y + px * 0.04);
  });
  ctx.restore();
}

export function drawProgress(ctx: Ctx2D, W: number, H: number, ratio: number, bar: Effects["progress"]) {
  if (!bar.enabled) return;
  const h = Math.max(3, Math.round(Math.min(W, H) * 0.011));
  const y = bar.position === "top" ? 0 : H - h;
  ctx.save();
  ctx.fillStyle = "rgba(255,255,255,0.22)";
  ctx.fillRect(0, y, W, h);
  ctx.fillStyle = bar.color;
  ctx.fillRect(0, y, W * clamp01(ratio), h);
  ctx.restore();
}

/* -------------------------------------------------------------------- video */

/** Anything that can paint a region of a video frame: a <video> element or a decoded sample. */
export type FrameSource = {
  width: number;
  height: number;
  draw(ctx: Ctx2D, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void;
};

let scratch: OffscreenCanvas | HTMLCanvasElement | null = null;

function drawCover(ctx: Ctx2D, src: FrameSource, W: number, H: number, panX: number, panY: number, zoom: number) {
  const base = Math.max(W / src.width, H / src.height);
  const bw = W / base;
  const bh = H / base;
  const bx = (src.width - bw) * (0.5 + clamp(panX, -1, 1) / 2);
  const by = (src.height - bh) * (0.5 + clamp(panY, -1, 1) / 2);
  const sw = bw / zoom;
  const sh = bh / zoom;
  // Zoom towards a point slightly above centre, where faces usually are.
  src.draw(ctx, bx + (bw - sw) * 0.5, by + (bh - sh) * 0.42, sw, sh, 0, 0, W, H);
}

export function drawVideo(ctx: Ctx2D, src: FrameSource, W: number, H: number, frame: Frame, zoom: number) {
  if (!src.width || !src.height) return;
  const sameShape = Math.abs(src.width / src.height - W / H) < 0.01;
  if (frame.fit !== "blur" || sameShape) {
    drawCover(ctx, src, W, H, frame.panX, frame.panY, zoom);
    return;
  }
  // Fit the whole picture over a blurred, darkened copy of itself.
  const bw = 48;
  const bh = Math.max(8, Math.round((bw * H) / W));
  if (!scratch) {
    scratch = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(bw, bh) : document.createElement("canvas");
  }
  if (scratch.width !== bw || scratch.height !== bh) {
    scratch.width = bw;
    scratch.height = bh;
  }
  drawCover(scratch.getContext("2d") as Ctx2D, src, bw, bh, 0, 0, 1.1);
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  if ("filter" in ctx) ctx.filter = `blur(${Math.round(Math.min(W, H) * 0.02)}px)`;
  ctx.drawImage(scratch, -W * 0.05, -H * 0.05, W * 1.1, H * 1.1);
  if ("filter" in ctx) ctx.filter = "none";
  ctx.fillStyle = "rgba(0,0,0,0.4)";
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
  const scale = Math.min(W / src.width, H / src.height) * zoom;
  const dw = src.width * scale;
  const dh = src.height * scale;
  src.draw(ctx, 0, 0, src.width, src.height, (W - dw) / 2, (H - dh) / 2, dw, dh);
}
