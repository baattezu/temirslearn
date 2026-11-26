import type { HTMLAttributes, ReactNode } from "react";
import { cx } from "./cx";

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("animate-spin", className ?? "size-5")} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".2" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cx("rounded-2xl border border-line bg-surface", className)} {...rest} />;
}

type Tone = "neutral" | "accent" | "blue" | "amber" | "rose" | "violet" | "ok" | "bad";
const tones: Record<Tone, string> = {
  neutral: "bg-raised text-dim border-line",
  accent: "bg-accent/10 text-accent border-accent/25",
  blue: "bg-blue/10 text-blue border-blue/25",
  amber: "bg-amber/10 text-amber border-amber/25",
  rose: "bg-rose/10 text-rose border-rose/25",
  violet: "bg-violet/10 text-violet border-violet/25",
  ok: "bg-ok/10 text-ok border-ok/25",
  bad: "bg-bad/10 text-bad border-bad/25",
};
export function Badge({ tone = "neutral", className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span
      className={cx(
        "inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-md border px-1.5 font-mono text-[11px] font-medium uppercase tracking-wide",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Progress({ value, className, tone = "accent" }: { value: number; className?: string; tone?: "accent" | "blue" }) {
  return (
    <div className={cx("h-1.5 overflow-hidden rounded-full bg-line", className)}>
      <div
        className={cx("h-full rounded-full transition-[width] duration-500", tone === "accent" ? "bg-accent" : "bg-blue")}
        style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
      />
    </div>
  );
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      {icon && <div className="mb-3 text-mute">{icon}</div>}
      <div className="font-medium text-ink">{title}</div>
      {children && <div className="mt-1.5 max-w-sm text-sm text-mute">{children}</div>}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-bad/30 bg-bad/10 px-3.5 py-2.5 text-sm text-bad">{children}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[11px] text-dim">{children}</kbd>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] text-mute">{children}</h2>
      {action}
    </div>
  );
}
