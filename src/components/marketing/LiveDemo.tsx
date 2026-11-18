"use client";

import { useEffect, useRef, useState } from "react";
import { ensureFont } from "@/lib/captions/fonts";
import { drawCaptions } from "@/lib/captions/render";
import { segmentWords } from "@/lib/captions/segment";
import { getTemplate } from "@/lib/captions/templates";
import type { Page, Word } from "@/lib/captions/types";

const LINES = [
  ["Stop", "paying", "for", "captions"],
  ["This", "one", "is", "free"],
  ["No", "upload"],
  ["No", "watermark"],
  ["Runs", "on", "your", "device"],
  ["Make", "it", "loud"],
];
const KEYWORDS = new Set(["captions", "free", "loud"]);
const STYLES = ["loud", "highlighter", "karaoke", "comic", "boxed", "neon", "sticker"];

/** The demo script with made-up but natural word timings. */
function script(): { words: Word[]; length: number } {
  const words: Word[] = [];
  let t = 0.35;
  LINES.forEach((line, li) => {
    line.forEach((text, wi) => {
      const length = 0.2 + text.length * 0.035;
      const last = wi === line.length - 1;
      words.push({ id: `demo-${li}-${wi}`, text: last ? `${text}.` : text, start: t, end: t + length, emphasis: KEYWORDS.has(text) });
      t += length;
    });
    t += 0.3;
  });
  return { words, length: t + 0.6 };
}

function backdrop(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
  const base = ctx.createLinearGradient(0, 0, W, H);
  base.addColorStop(0, "#1c1a3d");
  base.addColorStop(1, "#3b1233");
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "lighter";
  ["rgba(120,90,255,0.35)", "rgba(255,60,140,0.28)", "rgba(40,170,255,0.25)"].forEach((color, i) => {
    const x = W * (0.5 + 0.35 * Math.sin(t * 0.4 + i * 2.1));
    const y = H * (0.35 + 0.25 * Math.cos(t * 0.33 + i * 1.7));
    const glow = ctx.createRadialGradient(x, y, 0, x, y, W * 0.75);
    glow.addColorStop(0, color);
    glow.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);
  });
  ctx.globalCompositeOperation = "source-over";
  // A presenter-shaped silhouette, so the frame reads as a talking-head video.
  ctx.fillStyle = "rgba(9,9,14,0.6)";
  ctx.beginPath();
  ctx.arc(W / 2, H * 0.34 + Math.sin(t * 1.3) * H * 0.004, W * 0.17, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.74, W * 0.44, H * 0.21, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function LiveDemo() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [name, setName] = useState("Loud");

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const { words, length } = script();
    const glyphs = words.map((w) => w.text).join("");
    const pages = new Map<string, Page[]>();
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const started = performance.now();
    let frame = 0;
    let visible = true;
    let shown = -1;

    const paint = () => {
      const elapsed = (performance.now() - started) / 1000;
      const index = still ? 0 : Math.floor(elapsed / length) % STYLES.length;
      const template = getTemplate(STYLES[index]);
      if (index !== shown) {
        shown = index;
        setName(template.name);
        ensureFont(template.style.font, template.style.weight, template.style.italic, glyphs + glyphs.toUpperCase());
      }
      let laid = pages.get(template.id);
      if (!laid) {
        laid = segmentWords(words, { wordsPerPage: template.style.wordsPerPage });
        pages.set(template.id, laid);
      }
      backdrop(ctx, c.width, c.height, elapsed);
      drawCaptions(ctx, c.width, c.height, still ? 1.2 : elapsed % length, laid, template.style);
    };
    const loop = () => {
      if (visible) paint();
      frame = requestAnimationFrame(loop);
    };
    const observer = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting));
    observer.observe(c);
    if (still) {
      paint();
      document.fonts.ready.then(paint);
    } else loop();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return (
    <figure className="relative mx-auto w-[min(300px,72vw)]">
      <div className="absolute inset-0 translate-x-4 translate-y-3 rotate-6 rounded-[2.6rem] bg-loud" aria-hidden />
      <div className="relative overflow-hidden rounded-[2.6rem] border-[9px] border-[#1b1b20] bg-black shadow-2xl">
        <canvas ref={canvas} width={600} height={1067} className="block aspect-[9/16] w-full" aria-label="Animated preview of LoudCaps caption styles" />
      </div>
      <figcaption className="mt-5 flex items-center justify-center gap-2 text-xs text-fog">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-mint" />
        Live render · style: <span className="font-semibold text-paper">{name}</span>
      </figcaption>
    </figure>
  );
}
