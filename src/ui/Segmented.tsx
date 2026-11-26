import type { ReactNode } from "react";
import { cx } from "./cx";

/** Сегментный переключатель — единственный вид вкладок/радио. */
export function Segmented<T extends string | number>({
  value,
  onChange,
  options,
  size = "md",
  block,
  className,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: ReactNode }[];
  size?: "sm" | "md";
  block?: boolean;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cx("inline-flex rounded-xl border border-line bg-surface p-0.5", block && "flex w-full", className)}
    >
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="tab"
          type="button"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] transition",
            size === "sm" ? "h-7 px-2.5 text-[12.5px]" : "h-9 px-3.5 text-[13.5px]",
            block && "flex-1",
            o.value === value ? "bg-raised font-medium text-ink shadow-[0_0_0_1px_var(--color-line-strong)]" : "text-mute hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
