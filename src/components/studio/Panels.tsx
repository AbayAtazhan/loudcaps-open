"use client";

import { Highlighter, Pencil, Scissors, Trash2 } from "lucide-react";
import { memo, useEffect, useRef, useState } from "react";
import { ColorField, Section, Segmented, Select, Slider, Toggle, cx } from "@/components/ui";
import { planCuts } from "@/lib/captions/cuts";
import { TemplateCard } from "@/components/TemplateCard";
import { FONT_NAMES, weightsFor } from "@/lib/captions/fonts";
import { TEMPLATES } from "@/lib/captions/templates";
import { type Aspect, type CaptionStyle, type Entrance, type Pace, type Page, type TextCase, pageStart } from "@/lib/captions/types";
import { cutTotal, formatTime } from "@/lib/media/timeline";
import { type Tab, player, useStudio } from "@/lib/store";

const TABS: [Tab, string][] = [
  ["captions", "Captions"],
  ["style", "Style"],
  ["effects", "Effects"],
];

export function Panels() {
  const tab = useStudio((s) => s.tab);
  return (
    <aside className="flex min-h-0 flex-col border-t border-edge bg-coal max-lg:h-[46dvh] lg:w-[400px] lg:border-l lg:border-t-0">
      <nav className="flex shrink-0 border-b border-edge" role="tablist">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => useStudio.setState({ tab: key })}
            className={cx(
              "h-11 flex-1 border-b-2 text-sm font-semibold transition",
              tab === key ? "border-loud text-paper" : "border-transparent text-fog hover:text-paper",
            )}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === "captions" && <CaptionsPanel />}
        {tab === "style" && <StylePanel />}
        {tab === "effects" && <EffectsPanel />}
      </div>
    </aside>
  );
}

/* ----------------------------------------------------------------- captions */

function CaptionsPanel() {
  const pages = useStudio((s) => s.doc.pages);
  const active = useStudio((s) => s.activePage);
  const selected = useStudio((s) => s.selected);
  const wordsPerPage = useStudio((s) => s.doc.style.wordsPerPage);
  const offset = useStudio((s) => s.doc.offset);
  const list = useRef<HTMLDivElement>(null);

  // Follow along while the video plays.
  useEffect(() => {
    if (active < 0 || !player.video || player.video.paused) return;
    list.current?.children[active]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [active]);

  return (
    <>
      <Section title="Timing">
        <Slider
          label="Words per caption"
          value={wordsPerPage}
          min={1}
          max={8}
          step={1}
          onChange={(v) => useStudio.getState().setStyle({ wordsPerPage: v }, "words")}
        />
        <Slider
          label="Sync"
          value={offset}
          min={-0.5}
          max={0.5}
          step={0.02}
          format={(v) => (v === 0 ? "in sync" : `${v > 0 ? "+" : ""}${v.toFixed(2)}s`)}
          onChange={(v) => useStudio.getState().update((d) => ({ ...d, offset: v }), "offset")}
        />
      </Section>
      <p className="px-4 pt-3 text-xs text-fog">Tap a word to jump to it. Double-tap to fix it.</p>
      <div ref={list} className="p-2">
        {pages.map((page, i) => (
          <PageRow
            key={page.id}
            page={page}
            active={i === active}
            last={i === pages.length - 1}
            selected={page.words.some((w) => w.id === selected) ? selected : null}
          />
        ))}
      </div>
    </>
  );
}

const PageRow = memo(function PageRow({ page, active, last, selected }: { page: Page; active: boolean; last: boolean; selected: string | null }) {
  const [editing, setEditing] = useState<string | null>(null);
  const cancelled = useRef(false);
  const studio = useStudio.getState();
  const word = page.words.find((w) => w.id === selected);
  const tool = "flex h-7 items-center gap-1 rounded-md border border-edge px-2 text-xs text-fog hover:border-fog hover:text-paper disabled:opacity-30";

  return (
    <div className={cx("rounded-lg px-2 py-1.5", active && "bg-ink")}>
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => player.seek(pageStart(page))}
          className="mt-1 w-9 shrink-0 text-left text-[11px] tabular-nums text-fog hover:text-loud"
        >
          {formatTime(pageStart(page))}
        </button>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1">
          {page.words.map((w) =>
            editing === w.id ? (
              <input
                key={w.id}
                autoFocus
                defaultValue={w.text}
                aria-label="Edit word"
                size={Math.max(3, w.text.length + 1)}
                className="rounded bg-paper px-1.5 py-0.5 text-sm text-ink outline-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                  if (e.key === "Escape") {
                    cancelled.current = true;
                    e.currentTarget.blur();
                  }
                }}
                onBlur={(e) => {
                  if (!cancelled.current && e.target.value !== w.text) studio.editWord(w.id, e.target.value);
                  cancelled.current = false;
                  setEditing(null);
                }}
              />
            ) : (
              <button
                key={w.id}
                type="button"
                onClick={() => {
                  useStudio.setState({ selected: w.id });
                  player.seek(w.start + 0.01);
                }}
                onDoubleClick={() => setEditing(w.id)}
                className={cx(
                  "rounded px-1.5 py-0.5 text-sm transition",
                  w.id === selected ? "bg-loud text-ink" : w.emphasis ? "bg-loud/15 text-loud" : "text-paper hover:bg-edge",
                )}
              >
                {w.text}
              </button>
            ),
          )}
          {page.emoji && <span className="px-1 text-sm">{page.emoji}</span>}
        </div>
      </div>
      {word && !editing && (
        <div className="ml-11 mt-2 flex flex-wrap items-center gap-1">
          <button type="button" className={tool} onClick={() => setEditing(word.id)}>
            <Pencil size={13} /> Edit
          </button>
          <button type="button" className={cx(tool, word.emphasis && "border-loud text-loud")} onClick={() => studio.toggleEmphasis(word.id)}>
            <Highlighter size={13} /> Highlight
          </button>
          <button type="button" className={tool} disabled={page.words[0].id === word.id} onClick={() => studio.splitBefore(word.id)}>
            <Scissors size={13} /> Split
          </button>
          <button type="button" className={tool} disabled={last} onClick={() => studio.mergeWithNext(page.id)}>
            Join next
          </button>
          <button type="button" className={tool} aria-label="Delete word" onClick={() => studio.editWord(word.id, "")}>
            <Trash2 size={13} />
          </button>
          <input
            aria-label="Emoji for this caption"
            placeholder="🙂"
            defaultValue={page.emoji ?? ""}
            maxLength={8}
            className="h-7 w-10 rounded-md border border-edge bg-transparent text-center text-sm outline-none focus:border-loud"
            onBlur={(e) => {
              const value = e.target.value.trim();
              if (value !== (page.emoji ?? "")) studio.setEmoji(page.id, value || undefined);
            }}
          />
        </div>
      )}
    </div>
  );
});

/* -------------------------------------------------------------------- style */

const CASES: [TextCase, string][] = [
  ["upper", "AA"],
  ["none", "Aa"],
  ["lower", "aa"],
];
const ENTRANCES: [Entrance, string][] = [
  ["none", "None"],
  ["pop", "Pop"],
  ["fade", "Fade"],
  ["rise", "Rise"],
  ["drop", "Drop"],
  ["zoom", "Zoom"],
  ["slide", "Slide"],
];

function StylePanel() {
  const templateId = useStudio((s) => s.doc.templateId);
  const style = useStudio((s) => s.doc.style);
  const { setStyle, applyTemplate } = useStudio.getState();
  const set = (patch: Partial<CaptionStyle>, merge?: string) => setStyle(patch, merge);
  const weights = weightsFor(style.font);

  return (
    <>
      <Section title="Templates">
        <div className="grid grid-cols-2 gap-2">
          {TEMPLATES.map((t) => (
            <TemplateCard key={t.id} template={t} selected={t.id === templateId} onPick={() => applyTemplate(t.id)} />
          ))}
        </div>
      </Section>

      <Section title="Text">
        <div className="flex gap-2">
          <Select
            label="Font"
            value={style.font}
            onChange={(font) => {
              const available = weightsFor(font);
              set({ font, weight: available.includes(style.weight) ? style.weight : available[available.length - 1] });
            }}
          >
            {FONT_NAMES.map((f) => (
              <option key={f}>{f}</option>
            ))}
          </Select>
          <Select label="Weight" value={style.weight} onChange={(w) => set({ weight: Number(w) })}>
            {weights.map((w) => (
              <option key={w}>{w}</option>
            ))}
          </Select>
        </div>
        <Segmented label="Letter case" value={style.textCase} options={CASES} onChange={(textCase) => set({ textCase })} />
        <Slider label="Size" value={style.size} min={2.5} max={16} step={0.1} format={(v) => v.toFixed(1)} onChange={(size) => set({ size }, "size")} />
        <Slider label="Letter spacing" value={style.tracking} min={-0.05} max={0.2} step={0.005} format={(v) => v.toFixed(3)} onChange={(tracking) => set({ tracking }, "tracking")} />
        <label className="flex items-center justify-between text-xs text-fog">
          Keep punctuation
          <Toggle label="Keep punctuation" checked={style.punctuation} onChange={(punctuation) => set({ punctuation })} />
        </label>
      </Section>

      <Section title="Colour">
        <ColorField label="Text" value={style.color} onChange={(color) => set({ color, gradient: null }, "color")} />
        <ColorField label="Word being spoken" value={style.activeColor ?? style.color} onChange={(activeColor) => set({ activeColor }, "active")} />
        <ColorField label="Highlighted words" value={style.emphasisColor ?? "#FFE600"} onChange={(emphasisColor) => set({ emphasisColor }, "emphasis")} />
        <label className="flex items-center justify-between text-xs text-fog">
          Outline
          <Toggle label="Outline" checked={!!style.stroke} onChange={(on) => set({ stroke: on ? { color: "#000000", width: 0.1 } : null })} />
        </label>
        {style.stroke && (
          <>
            <ColorField label="Outline colour" value={style.stroke.color} onChange={(color) => set({ stroke: { ...style.stroke!, color } }, "stroke")} />
            <Slider label="Outline width" value={style.stroke.width} min={0.02} max={0.25} format={(v) => v.toFixed(2)} onChange={(width) => set({ stroke: { ...style.stroke!, width } }, "stroke-w")} />
          </>
        )}
        <label className="flex items-center justify-between text-xs text-fog">
          Shadow
          <Toggle label="Shadow" checked={!!style.shadow} onChange={(on) => set({ shadow: on ? { color: "rgba(0,0,0,0.6)", blur: 0.2, x: 0, y: 0.06 } : null })} />
        </label>
        <label className="flex items-center justify-between text-xs text-fog">
          Background box
          <Toggle
            label="Background box"
            checked={!!style.box}
            onChange={(on) => set({ box: on ? { color: "rgba(8,8,8,0.86)", radius: 0.3, padX: 0.5, padY: 0.2, scope: "line" } : null, leading: on ? 1.5 : 1.14 })}
          />
        </label>
        {style.box && <ColorField label="Box colour" value={style.box.color} onChange={(color) => set({ box: { ...style.box!, color } }, "box")} />}
      </Section>

      <Section title="Position">
        <Slider label="Height on screen" value={style.y} min={0.06} max={0.94} format={(v) => `${Math.round(v * 100)}%`} onChange={(y) => set({ y }, "y")} />
        <Slider label="Width" value={style.maxWidth} min={0.4} max={0.96} format={(v) => `${Math.round(v * 100)}%`} onChange={(maxWidth) => set({ maxWidth }, "width")} />
        <Slider label="Lines" value={style.maxLines} min={1} max={3} step={1} onChange={(maxLines) => set({ maxLines }, "lines")} />
      </Section>

      <Section title="Motion">
        <div className="flex gap-2">
          <Select label="Entrance" value={style.entrance} onChange={(entrance) => set({ entrance: entrance as Entrance })}>
            {ENTRANCES.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
          <Select label="Animate" value={style.entranceScope} onChange={(scope) => set({ entranceScope: scope as "page" | "word", upcomingOpacity: scope === "word" ? 0 : 1 })}>
            <option value="page">Whole caption</option>
            <option value="word">Word by word</option>
          </Select>
        </div>
        <Slider label="Spoken word grows" value={style.activeScale} min={1} max={1.4} format={(v) => `${Math.round((v - 1) * 100)}%`} onChange={(activeScale) => set({ activeScale }, "scale")} />
        <Slider label="Tilt" value={style.tilt} min={0} max={8} step={0.5} format={(v) => `${v}°`} onChange={(tilt) => set({ tilt }, "tilt")} />
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ effects */

const ASPECTS: [Aspect, string][] = [
  ["source", "Original"],
  ["9:16", "9:16"],
  ["4:5", "4:5"],
  ["1:1", "1:1"],
  ["16:9", "16:9"],
];
const PACES: [Pace, string][] = [
  ["natural", "Natural"],
  ["fast", "Fast"],
  ["extra", "Extra fast"],
];

function EffectSection({ title, hint, enabled, onToggle, children }: { title: string; hint: string; enabled: boolean; onToggle: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <Section title={title} right={<Toggle label={title} checked={enabled} onChange={onToggle} />}>
      <p className="text-xs leading-relaxed text-fog">{hint}</p>
      {enabled && children}
    </Section>
  );
}

function EffectsPanel() {
  const frame = useStudio((s) => s.doc.frame);
  const fx = useStudio((s) => s.doc.fx);
  const pages = useStudio((s) => s.doc.pages);
  const duration = useStudio((s) => s.meta?.duration ?? 0);
  const { setFx, setFrame } = useStudio.getState();
  const cuts = fx.cuts.enabled ? planCuts(pages, duration, fx.cuts.pace) : [];

  return (
    <>
      <Section title="Frame">
        <Segmented label="Aspect ratio" value={frame.aspect} options={ASPECTS} onChange={(aspect) => setFrame({ aspect })} />
        {frame.aspect !== "source" && (
          <>
            <Segmented
              label="Fit"
              value={frame.fit}
              options={[
                ["cover", "Crop to fill"],
                ["blur", "Blur background"],
              ]}
              onChange={(fit) => setFrame({ fit })}
            />
            {frame.fit === "cover" && (
              <Slider label="Crop position" value={frame.panX} min={-1} max={1} format={(v) => (v === 0 ? "centre" : v < 0 ? "left" : "right")} onChange={(panX) => setFrame({ panX }, "pan")} />
            )}
          </>
        )}
      </Section>

      <EffectSection title="Jump cuts" hint="Cuts out pauses and dead air so the video never drags." enabled={fx.cuts.enabled} onToggle={(enabled) => setFx("cuts", { enabled })}>
        <Segmented label="Pace" value={fx.cuts.pace} options={PACES} onChange={(pace) => setFx("cuts", { pace })} />
        <p className="text-xs text-paper">
          {cuts.length ? `Removes ${cutTotal(cuts, duration).toFixed(1)}s across ${cuts.length} cut${cuts.length === 1 ? "" : "s"}.` : "No pauses long enough to cut at this pace."}
        </p>
      </EffectSection>

      <EffectSection title="Auto zoom" hint="Punches in and out on your words to keep the frame moving." enabled={fx.zoom.enabled} onToggle={(enabled) => setFx("zoom", { enabled })}>
        <Slider label="Strength" value={fx.zoom.intensity} min={0} max={1} format={(v) => `${Math.round(v * 100)}%`} onChange={(intensity) => setFx("zoom", { intensity }, "zoom")} />
        <Segmented
          label="Zoom style"
          value={fx.zoom.smooth ? "smooth" : "punch"}
          options={[
            ["smooth", "Smooth"],
            ["punch", "Hard cut"],
          ]}
          onChange={(v) => setFx("zoom", { smooth: v === "smooth" })}
        />
      </EffectSection>

      <EffectSection title="Auto emoji" hint="Adds a fitting emoji above captions. Set your own from the Captions tab." enabled={fx.emoji.enabled} onToggle={(enabled) => setFx("emoji", { enabled })}>
        <Slider label="Size" value={fx.emoji.size} min={0.8} max={2.4} format={(v) => `${v.toFixed(1)}x`} onChange={(size) => setFx("emoji", { size }, "emoji")} />
      </EffectSection>

      <EffectSection title="Hook title" hint="A title card over the first seconds, where viewers decide to stay." enabled={fx.hook.enabled} onToggle={(enabled) => setFx("hook", { enabled })}>
        <input
          value={fx.hook.text}
          onChange={(e) => setFx("hook", { text: e.target.value }, "hook")}
          placeholder="3 mistakes killing your reach"
          aria-label="Hook title text"
          className="h-9 w-full rounded-lg border border-edge bg-ink px-3 text-sm outline-none focus:border-loud"
        />
        <Slider label="Show for" value={fx.hook.duration} min={1} max={8} step={0.5} format={(v) => `${v}s`} onChange={(d) => setFx("hook", { duration: d }, "hook-d")} />
        <ColorField label="Text" value={fx.hook.color} onChange={(color) => setFx("hook", { color }, "hook-c")} />
        <ColorField label="Background" value={fx.hook.background} onChange={(background) => setFx("hook", { background }, "hook-b")} />
      </EffectSection>

      <EffectSection title="Progress bar" hint="Shows viewers how much of the video is left." enabled={fx.progress.enabled} onToggle={(enabled) => setFx("progress", { enabled })}>
        <Segmented
          label="Position"
          value={fx.progress.position}
          options={[
            ["bottom", "Bottom"],
            ["top", "Top"],
          ]}
          onChange={(position) => setFx("progress", { position })}
        />
        <ColorField label="Colour" value={fx.progress.color} onChange={(color) => setFx("progress", { color }, "bar")} />
      </EffectSection>
    </>
  );
}
