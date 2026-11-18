"use client";

import { Pause, Play, Redo2, Undo2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ensureFont, glyphsOf, onFontsChanged } from "@/lib/captions/fonts";
import { type FrameSource, activePageIndex } from "@/lib/captions/render";
import { aspectRatio, cutsFor, renderScene } from "@/lib/captions/scene";
import { PEAK_RATE } from "@/lib/project";
import { cutTotal, formatTime, skipTarget, toOutputTime } from "@/lib/media/timeline";
import { player, useStudio } from "@/lib/store";

export function Stage() {
  const url = useStudio((s) => s.url);
  const meta = useStudio((s) => s.meta);
  const aspect = useStudio((s) => s.doc.frame.aspect);
  const font = useStudio((s) => s.doc.style.font);
  const weight = useStudio((s) => s.doc.style.weight);
  const italic = useStudio((s) => s.doc.style.italic);
  const glyphs = useStudio((s) => glyphsOf(s.doc.pages) + s.doc.fx.hook.text);

  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const dirty = useRef(true);
  const drag = useRef<{ y: number; start: number; moved: boolean } | null>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [paused, setPaused] = useState(true);
  const ratio = meta ? aspectRatio(meta, aspect) : 9 / 16;

  useEffect(() => {
    ensureFont(font, weight, italic, glyphs);
  }, [font, weight, italic, glyphs]);

  // Fit the preview inside the available space at the output's aspect ratio.
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const measure = () => {
      const maxW = el.clientWidth - 24;
      const maxH = el.clientHeight - 24;
      let w = maxW;
      let h = maxW / ratio;
      if (h > maxH) {
        h = maxH;
        w = maxH * ratio;
      }
      setBox({ w: Math.max(0, Math.floor(w)), h: Math.max(0, Math.floor(h)) });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [ratio]);

  useEffect(() => {
    const c = canvas.current;
    if (!c || !box.w || !box.h) return;
    const scale = Math.min(window.devicePixelRatio || 1, 1600 / Math.max(box.w, box.h));
    c.width = Math.max(2, Math.round(box.w * scale));
    c.height = Math.max(2, Math.round(box.h * scale));
    dirty.current = true;
  }, [box]);

  useEffect(() => {
    const c = canvas.current;
    const v = video.current;
    const ctx = c?.getContext("2d", { alpha: false });
    if (!c || !v || !ctx) return;
    player.video = v;
    const mark = () => {
      dirty.current = true;
    };
    const unsubscribe = useStudio.subscribe(mark);
    const offFonts = onFontsChanged(mark);
    v.addEventListener("seeked", mark);
    v.addEventListener("loadeddata", mark);
    const source: FrameSource = {
      get width() {
        return v.videoWidth;
      },
      get height() {
        return v.videoHeight;
      },
      draw: (target, sx, sy, sw, sh, dx, dy, dw, dh) => target.drawImage(v, sx, sy, sw, sh, dx, dy, dw, dh),
    };
    let frame = 0;
    let last = -1;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const { doc, meta: info, activePage } = useStudio.getState();
      if (!info) return;
      const cuts = cutsFor(doc, info.duration);
      let t = v.currentTime;
      if (!v.paused) {
        // Jump cuts: skip over removed ranges while playing.
        const jump = skipTarget(cuts, t);
        if (jump !== null) {
          if (jump >= info.duration - 0.05) v.pause();
          else {
            v.currentTime = jump;
            t = jump;
          }
        }
      }
      if (!dirty.current && v.paused && t === last) return;
      dirty.current = false;
      last = t;
      const outDuration = info.duration - cutTotal(cuts, info.duration);
      renderScene(ctx, v.readyState >= 2 ? source : null, c.width, c.height, t, toOutputTime(cuts, t), outDuration, doc);
      const index = activePageIndex(doc.pages, t - doc.offset);
      if (index !== activePage) useStudio.setState({ activePage: index });
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      unsubscribe();
      offFonts();
      v.removeEventListener("seeked", mark);
      v.removeEventListener("loadeddata", mark);
      player.video = null;
    };
  }, []);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={wrap} className="relative flex min-h-0 flex-1 items-center justify-center">
        <canvas
          ref={canvas}
          style={{ width: box.w, height: box.h }}
          className="cursor-pointer touch-none rounded-xl bg-black shadow-[0_20px_60px_rgba(0,0,0,0.6)]"
          aria-label="Video preview. Click to play or pause, drag to move the captions."
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { y: e.clientY, start: useStudio.getState().doc.style.y, moved: false };
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || !box.h) return;
            const dy = e.clientY - d.y;
            if (!d.moved && Math.abs(dy) < 5) return;
            d.moved = true;
            useStudio.getState().setStyle({ y: Math.min(0.94, Math.max(0.06, d.start + dy / box.h)) }, "drag-y");
          }}
          onPointerUp={() => {
            if (drag.current && !drag.current.moved) player.toggle();
            drag.current = null;
          }}
        />
        {paused && box.w > 0 && (
          <div className="pointer-events-none absolute flex h-16 w-16 items-center justify-center rounded-full bg-black/55 text-paper backdrop-blur">
            <Play size={28} className="ml-1" fill="currentColor" />
          </div>
        )}
        {url && (
          <video
            ref={video}
            src={url}
            playsInline
            preload="auto"
            className="pointer-events-none absolute h-px w-px opacity-0"
            onPlay={() => setPaused(false)}
            onPause={() => setPaused(true)}
          />
        )}
      </div>
      <Transport paused={paused} />
    </div>
  );
}

function Transport({ paused }: { paused: boolean }) {
  const meta = useStudio((s) => s.meta);
  const peaks = useStudio((s) => s.peaks);
  const doc = useStudio((s) => s.doc);
  const canUndo = useStudio((s) => s.past.length > 0);
  const canRedo = useStudio((s) => s.future.length > 0);
  const bar = useRef<HTMLDivElement>(null);
  const wave = useRef<HTMLCanvasElement>(null);
  const head = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const [width, setWidth] = useState(0);
  const duration = meta?.duration ?? 0;
  const cuts = cutsFor(doc, duration);

  useEffect(() => {
    const el = bar.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Waveform, with the ranges removed by jump cuts dimmed.
  useEffect(() => {
    const c = wave.current;
    if (!c || !width || !duration) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = width * dpr;
    c.height = 44 * dpr;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    const step = 3 * dpr;
    let loudest = 0.05;
    if (peaks) for (let i = 0; i < peaks.length; i++) if (peaks[i] > loudest) loudest = peaks[i];
    for (let x = 0; x < c.width; x += step) {
      const t0 = (x / c.width) * duration;
      const t1 = ((x + step) / c.width) * duration;
      let level = 0;
      if (peaks) {
        const to = Math.min(peaks.length, Math.ceil(t1 * PEAK_RATE));
        for (let i = Math.floor(t0 * PEAK_RATE); i < to; i++) if (peaks[i] > level) level = peaks[i];
      }
      const removed = cuts.some((cut) => t0 >= cut.start && t1 <= cut.end);
      const h = Math.max(2 * dpr, (level / loudest) * c.height * 0.9);
      ctx.fillStyle = removed ? "rgba(255,46,136,0.45)" : "rgba(246,243,236,0.55)";
      ctx.fillRect(x, (c.height - h) / 2, step - dpr, h);
    }
  }, [peaks, width, duration, cuts]);

  // The playhead and clock move every frame, so they are updated without re-rendering React.
  useEffect(() => {
    let frame = 0;
    const tick = () => {
      frame = requestAnimationFrame(tick);
      const t = player.video?.currentTime ?? 0;
      if (head.current && duration) head.current.style.transform = `translateX(${(t / duration) * width}px)`;
      if (clock.current) {
        clock.current.textContent = `${formatTime(toOutputTime(cuts, t))} / ${formatTime(duration - cutTotal(cuts, duration))}`;
      }
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [cuts, duration, width]);

  const seek = (clientX: number) => {
    const rect = bar.current?.getBoundingClientRect();
    if (rect && rect.width) player.seek(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * duration);
  };

  return (
    <div className="flex items-center gap-3 border-t border-edge bg-coal px-3 py-2">
      <button
        type="button"
        onClick={() => player.toggle()}
        aria-label={paused ? "Play" : "Pause"}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-paper text-ink transition hover:scale-105"
      >
        {paused ? <Play size={18} className="ml-0.5" fill="currentColor" /> : <Pause size={18} fill="currentColor" />}
      </button>
      <div
        ref={bar}
        className="relative h-11 min-w-0 flex-1 cursor-pointer touch-none overflow-hidden rounded-md bg-ink"
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          seek(e.clientX);
        }}
        onPointerMove={(e) => e.buttons === 1 && seek(e.clientX)}
      >
        <canvas ref={wave} className="h-full w-full" />
        <div ref={head} className="pointer-events-none absolute inset-y-0 left-0 w-0.5 bg-loud" />
      </div>
      <span ref={clock} className="hidden w-[84px] shrink-0 text-right text-xs tabular-nums text-fog sm:block" />
      <div className="flex shrink-0">
        <button type="button" aria-label="Undo" disabled={!canUndo} onClick={() => useStudio.getState().undo()} className="rounded-md p-2 text-fog hover:text-paper disabled:opacity-30">
          <Undo2 size={18} />
        </button>
        <button type="button" aria-label="Redo" disabled={!canRedo} onClick={() => useStudio.getState().redo()} className="rounded-md p-2 text-fog hover:text-paper disabled:opacity-30">
          <Redo2 size={18} />
        </button>
      </div>
    </div>
  );
}
