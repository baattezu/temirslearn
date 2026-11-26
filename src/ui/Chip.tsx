import type { ReactNode } from "react";
import { cx } from "./cx";

/** Переключаемый чип — единственный вид фильтров и выбора из набора. */
export function Chip({
  active,
  onClick,
  children,
  icon,
  className,
}: {
  active?: boolean;
  onClick?: () => void;
  children: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition",
        active
          ? "border-accent/60 bg-accent/12 text-accent"
          : "border-line bg-surface text-dim hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      {icon}
      {children}
    </button>
  );
}
