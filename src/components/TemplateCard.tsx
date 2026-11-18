"use client";

import { useEffect, useRef, useState } from "react";
import { cx } from "@/components/ui";
import { ensureFont, onFontsChanged } from "@/lib/captions/fonts";
import { drawCaptions } from "@/lib/captions/render";
import { segmentWords } from "@/lib/captions/segment";
import type { CaptionStyle, Page, Template, Word } from "@/lib/captions/types";

const SAMPLE: Word[] = [
  { id: "s1", text: "Make", start: 0, end: 0.32 },
  { id: "s2", text: "it", start: 0.32, end: 0.56 },
  { id: "s3", text: "loud", start: 0.56, end: 1.05, emphasis: true },
];
const thumbs = new Map<string, { style: CaptionStyle; pages: Page[] }>();

/** A template's style, enlarged so it reads at thumbnail size. */
function thumbFor(template: Template) {
  let thumb = thumbs.get(template.id);
  if (!thumb) {
    const { style } = template;
    thumb = {
      style: { ...style, size: style.size * 2.25, y: 0.5, maxWidth: Math.min(0.92, style.maxWidth * 1.1) },
      pages: segmentWords(SAMPLE, { wordsPerPage: Math.min(3, style.wordsPerPage) }),
    };
    thumbs.set(template.id, thumb);
  }
  return thumb;
}

type TemplateCardProps = { template: Template } & (
  { href: string; onPick?: never; selected?: never } |
  { href?: never; onPick: () => void; selected: boolean }
);

export function TemplateCard({ template, selected, onPick, href }: TemplateCardProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const { style, pages } = thumbFor(template);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = 176 * dpr;
    c.height = 100 * dpr;
    const paint = (t: number) => {
      const g = ctx.createLinearGradient(0, 0, c.width, c.height);
      g.addColorStop(0, "#343848");
      g.addColorStop(1, "#16171d");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, c.width, c.height);
      drawCaptions(ctx, c.width, c.height, t, pages, style);
    };
    let frame = 0;
    const started = performance.now();
    const loop = () => {
      paint(((performance.now() - started) / 1000) % 1.5);
      frame = requestAnimationFrame(loop);
    };
    if (hover) loop();
    else paint(0.75);
    const off = onFontsChanged(() => !hover && paint(0.75));
    ensureFont(style.font, style.weight, style.italic, "Makeitloud MAKEITLOUD");
    return () => {
      cancelAnimationFrame(frame);
      off();
    };
  }, [template, hover]);

  const props = {
    onPointerEnter: () => setHover(true),
    onPointerLeave: () => setHover(false),
    title: template.blurb,
    className: cx("group relative overflow-hidden rounded-lg border-2 text-left transition", selected ? "border-loud" : "border-edge hover:border-fog"),
  };
  const content = (
    <>
      <canvas ref={canvas} className="block aspect-[176/100] w-full" />
      <span className="flex items-center justify-between gap-1 bg-ink px-2 py-1.5 text-xs font-semibold">
        {template.name}
      </span>
    </>
  );
  // A link to the editor performs a full navigation so its isolation headers apply.
  return href
    ? <a {...props} href={href}>{content}</a>
    : <button {...props} type="button" onClick={onPick} aria-pressed={selected}>{content}</button>;
}
