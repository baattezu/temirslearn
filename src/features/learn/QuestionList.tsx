import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import type { QA } from "../../content/questions";
import { Markdown } from "../../ui/Markdown";
import { cx } from "../../ui/cx";

const LEVEL = ["", "разминка", "собес", "с подвохом"];

/** Вопрос → сначала вспомни сам, потом открой ответ. */
export function QuestionItem({ qa, index, lessonHref, defaultOpen }: { qa: QA; index?: number; lessonHref?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <li className="rounded-2xl border border-line bg-surface">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 p-3.5 text-left sm:p-4">
        {index !== undefined && <span className="mt-0.5 font-mono text-[12px] text-mute">{index + 1}</span>}
        <span className="min-w-0 flex-1 text-[15px] font-medium leading-snug text-ink">{qa.q}</span>
        {qa.level && <span className="mt-0.5 hidden shrink-0 font-mono text-[10.5px] uppercase tracking-wider text-mute sm:inline">{LEVEL[qa.level]}</span>}
        <ChevronDown className={cx("mt-0.5 size-4 shrink-0 text-mute transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="anim-fade border-t border-line px-3.5 pb-4 pt-3 sm:px-4">
          <Markdown className="text-[14.5px] [&_p]:my-2">{qa.a}</Markdown>
          {lessonHref && (
            <Link to={lessonHref} className="mt-2 inline-block text-[13px] text-dim hover:text-ink">
              разобрано в уроке →
            </Link>
          )}
        </div>
      )}
    </li>
  );
}

export function QuestionList({ items, hrefOf }: { items: QA[]; hrefOf?: (qa: QA) => string | undefined }) {
  return (
    <ol className="grid gap-2">
      {items.map((qa, i) => (
        <QuestionItem key={i} qa={qa} index={i} lessonHref={hrefOf?.(qa)} />
      ))}
    </ol>
  );
}
