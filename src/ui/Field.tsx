import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

const base =
  "w-full rounded-xl border border-line bg-bg px-3.5 text-[15px] text-ink placeholder:text-mute transition focus:border-accent/60 focus:outline-none";

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
      <span className="font-medium text-dim">{children}</span>
      {hint && <span className="text-mute">{hint}</span>}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={cx(base, "h-11", className)} {...rest} />;
});

export const TextArea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function TextArea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx(base, "resize-y py-3 leading-relaxed", className)} {...rest} />;
});

/** Слайдер с подписью и значением — единый вид для всех виджетов. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  display,
}: {
  label: ReactNode;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  display?: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-dim">{label}</span>
        <span className="font-mono text-ink tabular-nums">{display ?? value}</span>
      </div>
      <input
        type="range"
        className="h-6 w-full cursor-pointer"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex min-h-9 items-center gap-2.5 text-left text-[13.5px] text-dim hover:text-ink"
    >
      <span
        className={cx(
          "relative h-[22px] w-[38px] shrink-0 rounded-full border transition",
          checked ? "border-accent/60 bg-accent/25" : "border-line bg-raised",
        )}
      >
        <span
          className={cx(
            "absolute top-[2px] size-4 rounded-full transition-all",
            checked ? "left-[18px] bg-accent" : "left-[2px] bg-mute",
          )}
        />
      </span>
      {label}
    </button>
  );
}
