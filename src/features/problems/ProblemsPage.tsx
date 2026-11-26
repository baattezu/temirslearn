import { CheckCircle2, Circle, CircleDashed } from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { PROBLEMS, type Problem } from "../../problems";
import { Chip } from "../../ui/Chip";
import { Badge } from "../../ui/misc";

export const DIFF: Record<Problem["difficulty"], { label: string; tone: "ok" | "amber" | "bad" }> = {
  easy: { label: "easy", tone: "ok" },
  medium: { label: "medium", tone: "amber" },
  hard: { label: "hard", tone: "bad" },
};

export function ProblemsPage() {
  const { submissions } = useData();
  const [diff, setDiff] = useState<Problem["difficulty"] | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const tags = useMemo(() => [...new Set(PROBLEMS.flatMap((p) => p.tags))], []);
  const list = PROBLEMS.filter((p) => (!diff || p.difficulty === diff) && (!tag || p.tags.includes(tag)));
  const solved = PROBLEMS.filter((p) => submissions[p.id]?.solved).length;

  return (
    <div className="pb-12">
      <PageHeader title="Задачи" eyebrow={`Решено ${solved} из ${PROBLEMS.length}`} />
      <div className="px-5 pt-3 md:px-10">
        <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-2 scrollbar-none md:mx-0 md:flex-wrap md:px-0">
          {(["easy", "medium", "hard"] as const).map((d) => (
            <Chip key={d} active={diff === d} onClick={() => setDiff(diff === d ? null : d)}>
              {d}
            </Chip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-line" />
          {tags.map((t) => (
            <Chip key={t} active={tag === t} onClick={() => setTag(tag === t ? null : t)}>
              {t}
            </Chip>
          ))}
        </div>

        <div className="mt-3 overflow-hidden rounded-2xl border border-line">
          {list.map((p, i) => {
            const s = submissions[p.id];
            return (
              <Link
                key={p.id}
                to={`/problems/${p.id}`}
                className={`flex items-center gap-3.5 bg-surface px-4 py-3.5 transition hover:bg-raised ${i ? "border-t border-line" : ""}`}
              >
                {s?.solved ? (
                  <CheckCircle2 className="size-5 shrink-0 text-accent" />
                ) : s ? (
                  <CircleDashed className="size-5 shrink-0 text-amber" />
                ) : (
                  <Circle className="size-5 shrink-0 text-line-strong" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium text-ink">{p.title}</div>
                  <div className="mt-0.5 truncate text-[12.5px] text-mute">{p.tags.join(" · ")}</div>
                </div>
                <Badge tone={DIFF[p.difficulty].tone}>{DIFF[p.difficulty].label}</Badge>
              </Link>
            );
          })}
          {!list.length && <div className="bg-surface px-4 py-10 text-center text-sm text-mute">Ничего не подошло под фильтр</div>}
        </div>
        <p className="mt-4 text-[13px] text-mute">
          Решения проверяются прямо в браузере: Python (Pyodide) и JavaScript. Новая задача — запись в <code className="font-mono text-dim">src/problems/index.ts</code>.
        </p>
      </div>
    </div>
  );
}
