import { Check, Info, Lightbulb, TriangleAlert, X } from "lucide-react";
import { useState, type ReactNode } from "react";
import { cx } from "../ui/cx";

type Kind = "info" | "tip" | "warn";
const kinds: Record<Kind, { icon: ReactNode; cls: string }> = {
  info: { icon: <Info className="size-4" />, cls: "border-blue/30 bg-blue/[0.06] text-blue" },
  tip: { icon: <Lightbulb className="size-4" />, cls: "border-accent/30 bg-accent/[0.06] text-accent" },
  warn: { icon: <TriangleAlert className="size-4" />, cls: "border-amber/30 bg-amber/[0.06] text-amber" },
};

export function Callout({ kind = "info", title, children }: { kind?: Kind; title?: string; children: ReactNode }) {
  const k = kinds[kind];
  return (
    <div className={cx("not-prose my-6 rounded-2xl border px-4 py-3.5", k.cls)}>
      <div className="mb-1 flex items-center gap-2 text-[13px] font-semibold">
        {k.icon}
        {title ?? (kind === "warn" ? "Осторожно" : kind === "tip" ? "На собесе" : "Заметка")}
      </div>
      <div className="text-[15px] leading-relaxed text-dim [&_code]:font-mono [&_code]:text-ink [&_strong]:text-ink">{children}</div>
    </div>
  );
}

/** Вопрос для самопроверки: вариант → сразу объяснение. */
export function Quiz({
  q,
  options,
  answer,
  why,
}: {
  q: ReactNode;
  options: string[];
  answer: number;
  why: ReactNode;
}) {
  const [picked, setPicked] = useState<number | null>(null);
  return (
    <div className="not-prose my-7 rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">Проверь себя</div>
      <div className="mb-3.5 text-[15.5px] font-medium leading-snug text-ink">{q}</div>
      <div className="grid gap-2">
        {options.map((o, i) => {
          const state = picked === null ? "idle" : i === answer ? "right" : i === picked ? "wrong" : "dim";
          return (
            <button
              key={i}
              type="button"
              disabled={picked !== null}
              onClick={() => setPicked(i)}
              className={cx(
                "flex min-h-11 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-[14.5px] transition",
                state === "idle" && "border-line text-dim hover:border-line-strong hover:text-ink",
                state === "right" && "border-ok/50 bg-ok/10 text-ink",
                state === "wrong" && "border-bad/50 bg-bad/10 text-ink",
                state === "dim" && "border-line text-mute",
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full border border-current font-mono text-[11px]">
                {state === "right" ? <Check className="size-3" /> : state === "wrong" ? <X className="size-3" /> : String.fromCharCode(65 + i)}
              </span>
              {o}
            </button>
          );
        })}
      </div>
      {picked !== null && (
        <div className="anim-fade mt-3.5 text-[14.5px] leading-relaxed text-dim [&_code]:font-mono [&_code]:text-ink [&_strong]:text-ink">
          <span className={picked === answer ? "font-semibold text-ok" : "font-semibold text-bad"}>
            {picked === answer ? "Верно. " : "Нет. "}
          </span>
          {why}
        </div>
      )}
    </div>
  );
}

/** «Что сказать на собесе» — короткий конспект урока. */
export function Takeaways({ children }: { children: ReactNode }) {
  return (
    <div className="not-prose my-8 rounded-2xl border border-accent/25 bg-accent/[0.04] p-4 sm:p-5">
      <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-accent">Ответ на 60 секунд</div>
      <div className="text-[15px] leading-relaxed text-dim [&_li+li]:mt-1.5 [&_li]:pl-1 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:pl-5 [&_code]:font-mono [&_code]:text-ink">
        {children}
      </div>
    </div>
  );
}

export const mdxComponents = { Callout, Quiz, Takeaways };
