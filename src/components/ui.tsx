"use client";

import { X } from "lucide-react";
import { type ButtonHTMLAttributes, type ReactNode, useEffect, useId } from "react";

const cx = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" ");

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "loud" | "ghost" | "quiet"; size?: "sm" | "md" };

export function Button({ variant = "ghost", size = "md", className, ...props }: ButtonProps) {
  return (
    <button
      {...props}
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:pointer-events-none disabled:opacity-40",
        size === "sm" ? "h-8 px-3 text-xs" : "h-10 px-4 text-sm",
        variant === "loud" && "bg-loud text-ink hover:brightness-95 active:scale-[0.98]",
        variant === "ghost" && "border border-edge bg-coal text-paper hover:border-fog",
        variant === "quiet" && "text-fog hover:bg-coal hover:text-paper",
        className,
      )}
    />
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cx("relative h-6 w-11 shrink-0 rounded-full transition", checked ? "bg-loud" : "bg-edge")}
    >
      <span className={cx("absolute top-0.5 h-5 w-5 rounded-full bg-ink transition-all", checked ? "left-[22px]" : "left-0.5 bg-fog")} />
    </button>
  );
}

type SliderProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
};

export function Slider({ label, value, min, max, step = 0.01, format, onChange }: SliderProps) {
  const id = useId();
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <label htmlFor={id} className="text-fog">
          {label}
        </label>
        <span className="tabular-nums text-paper">{format ? format(value) : value}</span>
      </div>
      <input
        id={id}
        type="range"
        className="range w-full"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-lg border border-edge bg-ink p-0.5">
      {options.map(([key, text]) => (
        <button
          key={key}
          type="button"
          role="radio"
          aria-checked={value === key}
          onClick={() => onChange(key)}
          className={cx(
            "h-8 flex-1 rounded-md px-2 text-xs font-semibold transition",
            value === key ? "bg-paper text-ink" : "text-fog hover:text-paper",
          )}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

export function Select({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-1 block text-xs text-fog">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-full rounded-lg border border-edge bg-ink px-2 text-sm text-paper outline-none focus:border-loud"
      >
        {children}
      </select>
    </div>
  );
}

/** Converts any CSS colour the templates use into #rrggbb for the native colour picker. */
export function toHex(color: string): string {
  if (/^#[0-9a-f]{6}$/i.test(color)) return color;
  const m = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "#000000";
  return `#${[m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
}

/** Applies a newly picked hex colour while keeping the opacity the old colour had. */
export function keepAlpha(previous: string, hex: string): string {
  const alpha = previous.match(/rgba\([^)]*,\s*([\d.]+)\)/)?.[1];
  if (!alpha) return hex;
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${alpha})`;
}

export function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={id} className="text-xs text-fog">
        {label}
      </label>
      <input
        id={id}
        type="color"
        value={toHex(value)}
        onChange={(e) => onChange(keepAlpha(value, e.target.value))}
        className="h-7 w-10 cursor-pointer rounded border border-edge bg-transparent p-0.5"
      />
    </div>
  );
}

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="border-b border-edge px-4 py-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-fog">{title}</h3>
        {right}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className={cx("max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl border border-edge bg-coal p-5 sm:rounded-2xl sm:p-6", wide ? "sm:max-w-3xl" : "sm:max-w-md")}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="display text-2xl">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-1 rounded-md p-1 text-fog hover:text-paper">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export { cx };
