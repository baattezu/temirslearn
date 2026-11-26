import hljs from "highlight.js/lib/core";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import python from "highlight.js/lib/languages/python";
import typescript from "highlight.js/lib/languages/typescript";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import sql from "highlight.js/lib/languages/sql";
import { useMemo, useState, type ReactNode } from "react";
import { cx } from "./cx";

hljs.registerLanguage("java", java);
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("sql", sql);

export function Code({ code, lang = "java", className }: { code: string; lang?: string; className?: string }) {
  const html = useMemo(() => {
    const src = code.replace(/^\n+|\s+$/g, "");
    try {
      if (hljs.getLanguage(lang)) return hljs.highlight(src, { language: lang }).value;
    } catch {
      /* упадём в экранирование ниже */
    }
    {
      return src.replace(/[&<>]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[ch]!);
    }
  }, [code, lang]);
  return (
    <pre className={cx("hljs overflow-x-auto rounded-xl border border-line bg-bg p-3 font-mono text-[12.5px] leading-relaxed", className)}>
      <code dangerouslySetInnerHTML={{ __html: html }} />
    </pre>
  );
}

/**
 * Сравнение двух вариантов кода. На широком экране — рядом, на телефоне — вкладками.
 * <Compare left={{ label: "Было", code: `...` }} right={{ label: "Стало", code: `...` }} lang="java" note="..." />
 */
export function Compare({
  left,
  right,
  lang = "java",
  note,
  tone = "fix",
}: {
  left: { label: string; code: string; lang?: string };
  right: { label: string; code: string; lang?: string };
  lang?: string;
  note?: ReactNode;
  tone?: "fix" | "same";
}) {
  const [tab, setTab] = useState(1);
  const colors = tone === "fix" ? ["var(--color-bad)", "var(--color-ok)"] : ["var(--color-blue)", "var(--color-violet)"];
  const side = (s: typeof left, i: number) => (
    <div className={cx("min-w-0", i !== tab && "max-md:hidden")}>
      <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em]" style={{ color: colors[i] }}>
        <span className="size-1.5 rounded-full" style={{ background: colors[i] }} />
        {s.label}
      </div>
      <Code code={s.code} lang={s.lang ?? lang} className="h-[calc(100%-22px)]" />
    </div>
  );
  return (
    <div className="not-prose my-7">
      <div className="mb-2 flex gap-1 md:hidden">
        {[left, right].map((s, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setTab(i)}
            className={cx("h-8 rounded-lg px-3 text-[12.5px] transition", tab === i ? "bg-raised text-ink" : "text-mute")}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {side(left, 0)}
        {side(right, 1)}
      </div>
      {note && <div className="mt-2 text-[13.5px] leading-relaxed text-dim [&_code]:font-mono [&_code]:text-ink">{note}</div>}
    </div>
  );
}
