import { Pause, Play, RotateCcw, StepBack, StepForward } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";

// Общие детали виджетов: история состояний, плеер, лог, легенда, метрики.

/** История состояний: шаг вперёд кладёт новое состояние, «назад» — откатывает. */
export function useHistory<S>(initial: () => S) {
  const [h, setH] = useState(() => ({ list: [initial()], i: 0 }));
  const cur = h.list[h.i];
  const push = useCallback((next: S | ((s: S) => S)) => {
    setH((p) => {
      const base = p.list[p.i];
      const n = typeof next === "function" ? (next as (s: S) => S)(base) : next;
      return { list: [...p.list.slice(0, p.i + 1), n], i: p.i + 1 };
    });
  }, []);
  const back = useCallback(() => setH((p) => ({ ...p, i: Math.max(0, p.i - 1) })), []);
  const reset = useCallback((s?: S) => setH({ list: [s ?? initial()], i: 0 }), [initial]);
  return { cur, push, back, reset, canBack: h.i > 0, depth: h.i };
}

/** Автопроигрывание: вызывает tick, пока он возвращает true. */
export function usePlayer(tick: () => boolean, ms = 650) {
  const [playing, setPlaying] = useState(false);
  const ref = useRef(tick);
  ref.current = tick;
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      if (!ref.current()) setPlaying(false);
    }, ms);
    return () => clearInterval(t);
  }, [playing, ms]);
  return { playing, toggle: () => setPlaying((p) => !p), stop: () => setPlaying(false) };
}

/** Стандартная панель шагов: назад · шаг · играть · сначала. */
export function StepControls({
  onStep,
  onBack,
  onReset,
  canStep = true,
  canBack = false,
  player,
  stepLabel = "Шаг",
  className,
}: {
  onStep: () => void;
  onBack?: () => void;
  onReset: () => void;
  canStep?: boolean;
  canBack?: boolean;
  player?: { playing: boolean; toggle: () => void };
  stepLabel?: string;
  className?: string;
}) {
  return (
    <div className={cx("flex flex-wrap gap-2", className)}>
      {onBack && (
        <Button icon={<StepBack className="size-4" />} onClick={onBack} disabled={!canBack} aria-label="Назад" className="px-3" />
      )}
      <Button variant="primary" icon={<StepForward className="size-4" />} onClick={onStep} disabled={!canStep} className="flex-1 sm:flex-none">
        {stepLabel}
      </Button>
      {player && (
        <Button
          icon={player.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          onClick={player.toggle}
          disabled={!canStep && !player.playing}
          className="flex-1 sm:flex-none"
        >
          {player.playing ? "Пауза" : "Авто"}
        </Button>
      )}
      <Button icon={<RotateCcw className="size-4" />} onClick={onReset} aria-label="Сначала" className="px-3" />
    </div>
  );
}

/** Журнал шагов: последняя строка подсвечена. */
export function Log({ lines, empty, className, max = 8 }: { lines: ReactNode[]; empty?: ReactNode; className?: string; max?: number }) {
  const shown = lines.slice(-max);
  const offset = lines.length - shown.length;
  return (
    <div className={cx("min-h-[76px] rounded-xl border border-line bg-bg/50 p-3 font-mono text-[12.5px] leading-6 text-dim", className)}>
      {lines.length === 0 ? (
        <span className="text-mute">{empty}</span>
      ) : (
        shown.map((l, i) => (
          <div key={offset + i} className={cx("break-words", i === shown.length - 1 ? "text-ink" : "opacity-70")}>
            <span className="mr-2 text-mute">{offset + i + 1}.</span>
            {l}
          </div>
        ))
      )}
    </div>
  );
}

export function Legend({ items, className }: { items: { color: string; label: ReactNode; hatch?: boolean }[]; className?: string }) {
  return (
    <div className={cx("flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-mute", className)}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          <span
            className="size-2.5 rounded-[3px]"
            style={
              it.hatch
                ? { background: `repeating-linear-gradient(135deg, ${it.color} 0 2px, transparent 2px 5px)`, border: `1px solid ${it.color}` }
                : { background: it.color }
            }
          />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export function Metric({ label, value, tone, className }: { label: ReactNode; value: ReactNode; tone?: "ok" | "bad" | "accent" | "amber"; className?: string }) {
  return (
    <div className={cx("min-w-0 rounded-xl border border-line bg-bg/40 px-3 py-2", className)}>
      <div className="truncate font-mono text-[10.5px] uppercase tracking-[0.1em] text-mute">{label}</div>
      <div
        className={cx(
          "mt-0.5 truncate font-mono text-[17px] font-semibold tabular-nums",
          tone === "ok" ? "text-ok" : tone === "bad" ? "text-bad" : tone === "accent" ? "text-accent" : tone === "amber" ? "text-amber" : "text-ink",
        )}
      >
        {value}
      </div>
    </div>
  );
}

export function Metrics({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("grid grid-cols-2 gap-2 sm:grid-cols-4", className)}>{children}</div>;
}

/** Маленькая моноширинная подпись над блоком схемы. */
export function Caption({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-mute", className)}>{children}</div>;
}

/** Детерминированный ГПСЧ — чтобы «случайные» сценарии повторялись. */
export function rng(seed = 7) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const C = {
  accent: "var(--color-accent)",
  blue: "var(--color-blue)",
  amber: "var(--color-amber)",
  rose: "var(--color-rose)",
  violet: "var(--color-violet)",
  teal: "var(--color-teal)",
  ok: "var(--color-ok)",
  bad: "var(--color-bad)",
  ink: "var(--color-ink)",
  dim: "var(--color-dim)",
  mute: "var(--color-mute)",
  line: "var(--color-line)",
  lineStrong: "var(--color-line-strong)",
  raised: "var(--color-raised)",
  surface: "var(--color-surface)",
  bg: "var(--color-bg)",
};
