import type { ReactNode } from "react";
import { cx } from "../ui/cx";

/** Рамка интерактивного виджета внутри урока: шапка, сцена, панель управления. */
export function Frame({
  title,
  hint,
  children,
  controls,
  className,
}: {
  title: string;
  hint?: ReactNode;
  children: ReactNode;
  controls?: ReactNode;
  className?: string;
}) {
  return (
    <figure className={cx("not-prose my-8 overflow-hidden rounded-2xl border border-line bg-surface", className)}>
      <figcaption className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <span className="size-1.5 rounded-full bg-accent" />
        <span className="font-mono text-[11.5px] uppercase tracking-[0.12em] text-dim">{title}</span>
        {hint && <span className="ml-auto hidden text-[12px] text-mute sm:block">{hint}</span>}
      </figcaption>
      <div className="p-4 sm:p-5">{children}</div>
      {controls && <div className="border-t border-line bg-bg/40 p-4 sm:p-5">{controls}</div>}
    </figure>
  );
}
