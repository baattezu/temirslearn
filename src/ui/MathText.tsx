import katex from "katex";
import { Fragment, useMemo } from "react";

// Строка с формулами: $$…$$ — отдельной строкой, $…$ — в тексте, `код`, **жирный**.
// Для задач тренажёра и подсказок ассистента — без MDX.

function tex(src: string, display: boolean) {
  try {
    return katex.renderToString(src, { displayMode: display, throwOnError: false, strict: "ignore" });
  } catch {
    return src;
  }
}

const TOKEN = /(\$\$[\s\S]+?\$\$|\$[^$]+?\$|`[^`]+`|\*\*[^*]+\*\*)/g;

export function MathText({ text, className }: { text: string; className?: string }) {
  const parts = useMemo(() => text.split(TOKEN).filter(Boolean), [text]);
  return (
    <span className={className}>
      {parts.map((p, i) => {
        if (p.startsWith("$$")) return <span key={i} className="my-2 block overflow-x-auto" dangerouslySetInnerHTML={{ __html: tex(p.slice(2, -2), true) }} />;
        if (p.startsWith("$")) return <span key={i} dangerouslySetInnerHTML={{ __html: tex(p.slice(1, -1), false) }} />;
        if (p.startsWith("`")) return <code key={i} className="rounded bg-raised px-1 font-mono text-[0.9em] text-ink">{p.slice(1, -1)}</code>;
        if (p.startsWith("**")) return <strong key={i} className="font-semibold text-ink">{p.slice(2, -2)}</strong>;
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </span>
  );
}

export function TexBlock({ tex: src, className }: { tex: string; className?: string }) {
  const html = useMemo(() => tex(src, true), [src]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function TexInline({ tex: src }: { tex: string }) {
  const html = useMemo(() => tex(src, false), [src]);
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}
