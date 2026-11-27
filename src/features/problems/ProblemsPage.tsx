import {
  ArrowDownWideNarrow,
  ArrowLeftRight,
  Binary,
  Blocks,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  Circle,
  CircleDashed,
  Coins,
  Columns3,
  Database,
  Flame,
  GitBranch,
  Grid3x3,
  Hash,
  Layers,
  Leaf,
  Link2,
  ListFilter,
  Network,
  Search,
  Swords,
  Table,
  TreeDeciduous,
  Triangle,
  Undo2,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { useLocalStorage } from "../../lib/hooks";
import { PROBLEMS, type Problem } from "../../problems";
import { Chip } from "../../ui/Chip";
import { cx } from "../../ui/cx";
import { Input } from "../../ui/Field";
import { Segmented } from "../../ui/Segmented";

type Diff = Problem["difficulty"];

export const DIFF: Record<Diff, { label: string; tone: "ok" | "amber" | "bad"; icon: LucideIcon; color: string }> = {
  easy: { label: "Easy", tone: "ok", icon: Leaf, color: "var(--color-ok)" },
  medium: { label: "Medium", tone: "amber", icon: Flame, color: "var(--color-amber)" },
  hard: { label: "Hard", tone: "bad", icon: Swords, color: "var(--color-bad)" },
};

/** Значок сложности: иконка + цвет, как бейдж. */
export function DiffBadge({ d, compact }: { d: Diff; compact?: boolean }) {
  const D = DIFF[d];
  const I = D.icon;
  return (
    <span
      className="inline-flex h-[22px] shrink-0 items-center gap-1 rounded-md border px-1.5 font-mono text-[11px] font-medium uppercase tracking-wide"
      style={{ color: D.color, borderColor: `color-mix(in oklab, ${D.color} 30%, transparent)`, background: `color-mix(in oklab, ${D.color} 10%, transparent)` }}
    >
      <I className="size-3" strokeWidth={2.2} />
      {!compact && D.label}
    </span>
  );
}

export const TOPICS: { id: string; icon: LucideIcon; color: string }[] = [
  { id: "Массивы и хеши", icon: Hash, color: "var(--color-accent)" },
  { id: "Два указателя", icon: ArrowLeftRight, color: "var(--color-accent)" },
  { id: "Скользящее окно", icon: Columns3, color: "var(--color-accent)" },
  { id: "Стек", icon: Layers, color: "var(--color-blue)" },
  { id: "Бинарный поиск", icon: Search, color: "var(--color-blue)" },
  { id: "Связные списки", icon: Link2, color: "var(--color-blue)" },
  { id: "Деревья", icon: TreeDeciduous, color: "var(--color-ok)" },
  { id: "Trie", icon: GitBranch, color: "var(--color-ok)" },
  { id: "Кучи", icon: Triangle, color: "var(--color-ok)" },
  { id: "Перебор с возвратом", icon: Undo2, color: "var(--color-violet)" },
  { id: "Графы", icon: Network, color: "var(--color-violet)" },
  { id: "Динамика 1D", icon: Table, color: "var(--color-amber)" },
  { id: "Динамика 2D", icon: Grid3x3, color: "var(--color-amber)" },
  { id: "Жадные", icon: Coins, color: "var(--color-amber)" },
  { id: "Интервалы", icon: CalendarRange, color: "var(--color-amber)" },
  { id: "Математика и биты", icon: Binary, color: "var(--color-teal)" },
  { id: "Сортировки", icon: ArrowDownWideNarrow, color: "var(--color-teal)" },
  { id: "Дизайн структур", icon: Blocks, color: "var(--color-violet)" },
  { id: "SQL", icon: Database, color: "var(--color-rose)" },
  { id: "Многопоточность", icon: Workflow, color: "var(--color-rose)" },
];
export const topicMeta = (id: string) => TOPICS.find((t) => t.id === id) ?? { id, icon: Blocks, color: "var(--color-mute)" };

export function TopicIcon({ topic, className }: { topic: string; className?: string }) {
  const t = topicMeta(topic);
  const I = t.icon;
  return <I className={cx("size-4 shrink-0", className)} style={{ color: t.color }} strokeWidth={1.9} />;
}

const LISTS: { id: string; label: string; about: string }[] = [
  { id: "blind75", label: "Blind 75", about: "легендарный список с собесов FAANG" },
  { id: "neetcode150", label: "NeetCode 150", about: "Blind 75 + ещё 75 по паттернам" },
  { id: "grind75", label: "Grind 75", about: "план подготовки за 8 недель" },
  { id: "sql50", label: "SQL 50", about: "топ задач на SQL" },
  { id: "concurrency", label: "Многопоточность", about: "классика LeetCode Concurrency" },
  { id: "top-interview", label: "Top Interview", about: "частые вопросы вне списков" },
];

type Status = "all" | "solved" | "tried" | "new";
type Sort = "topic" | "difficulty" | "number" | "unsolved";
const DIFF_ORDER: Record<Diff, number> = { easy: 0, medium: 1, hard: 2 };

export function ProblemsPage() {
  const { submissions } = useData();
  const [q, setQ] = useState("");
  const [f, setF] = useLocalStorage<{ diff: Diff[]; topic: string | null; list: string | null; status: Status; sort: Sort }>("tl.problems.filter", {
    diff: [],
    topic: null,
    list: null,
    status: "all",
    sort: "topic",
  });
  const [collapsed, setCollapsed] = useLocalStorage<Record<string, boolean>>("tl.problems.collapsed", {});
  const [filtersOpen, setFiltersOpen] = useState(false);

  const statusOf = (p: Problem): Status => (submissions[p.id]?.solved ? "solved" : submissions[p.id] ? "tried" : "new");
  const needle = q.trim().toLowerCase();
  const list = useMemo(() => {
    const out = PROBLEMS.filter(
      (p) =>
        (!f.diff.length || f.diff.includes(p.difficulty)) &&
        (!f.topic || p.topic === f.topic) &&
        (!f.list || p.lists?.includes(f.list)) &&
        (f.status === "all" || statusOf(p) === f.status) &&
        (!needle || p.title.toLowerCase().includes(needle) || p.tags.some((t) => t.toLowerCase().includes(needle)) || String(p.lc ?? "") === needle),
    );
    const topicIdx = (p: Problem) => {
      const i = TOPICS.findIndex((t) => t.id === p.topic);
      return i < 0 ? 99 : i;
    };
    const by: Record<Sort, (a: Problem, b: Problem) => number> = {
      topic: (a, b) => topicIdx(a) - topicIdx(b) || DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty],
      difficulty: (a, b) => DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty] || topicIdx(a) - topicIdx(b),
      number: (a, b) => (a.lc ?? 1e9) - (b.lc ?? 1e9),
      unsolved: (a, b) => Number(statusOf(a) === "solved") - Number(statusOf(b) === "solved") || DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty],
    };
    return out.sort(by[f.sort]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f, needle, submissions]);

  const totals = (["easy", "medium", "hard"] as Diff[]).map((d) => {
    const all = PROBLEMS.filter((p) => p.difficulty === d);
    return { d, total: all.length, solved: all.filter((p) => submissions[p.id]?.solved).length };
  });
  const solvedAll = PROBLEMS.filter((p) => submissions[p.id]?.solved).length;
  const topicCount = (t: string) => PROBLEMS.filter((p) => p.topic === t).length;
  const activeFilters = f.diff.length + (f.topic ? 1 : 0) + (f.list ? 1 : 0) + (f.status !== "all" ? 1 : 0);

  const groups = f.sort === "topic" ? TOPICS.map((t) => ({ id: t.id, items: list.filter((p) => p.topic === t.id) })).filter((g) => g.items.length) : [{ id: "", items: list }];

  return (
    <div className="pb-12">
      <PageHeader title="Задачи" eyebrow={`Решено ${solvedAll} из ${PROBLEMS.length}`}>
        <p className="mt-2 max-w-2xl text-[14.5px] text-mute">Топовые задачи LeetCode по паттернам — алгоритмы, SQL и многопоточность. Судья прямо в браузере.</p>
      </PageHeader>

      <div className="px-5 pt-3 md:px-10">
        {/* сводка по сложности — она же быстрый фильтр */}
        <div className="grid grid-cols-3 gap-2 md:max-w-xl">
          {totals.map(({ d, total, solved }) => {
            const D = DIFF[d];
            const I = D.icon;
            const on = f.diff.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => setF({ ...f, diff: on ? f.diff.filter((x) => x !== d) : [...f.diff, d] })}
                className={cx("rounded-2xl border p-3 text-left transition", on ? "bg-raised" : "border-line bg-surface hover:border-line-strong")}
                style={on ? { borderColor: D.color } : undefined}
              >
                <div className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: D.color }}>
                  <I className="size-3.5" strokeWidth={2.2} /> {D.label}
                </div>
                <div className="mt-1 font-mono text-[18px] font-semibold tabular-nums text-ink">
                  {solved}
                  <span className="text-[13px] text-mute">/{total}</span>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-line">
                  <div className="h-full rounded-full" style={{ width: `${(solved / Math.max(1, total)) * 100}%`, background: D.color }} />
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-4 flex gap-2">
          <div className="relative min-w-0 flex-1 md:max-w-sm">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mute" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, тег или номер LeetCode" className="pl-10" />
          </div>
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            className={cx("flex h-11 shrink-0 items-center gap-2 rounded-xl border px-3.5 text-[13.5px] transition md:hidden", activeFilters ? "border-accent/60 text-accent" : "border-line text-dim")}
          >
            <ListFilter className="size-4" /> {activeFilters || ""}
          </button>
        </div>

        <div className={cx("mt-3 grid grid-cols-1 gap-3", !filtersOpen && "max-md:hidden")}>
          <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
            <Chip active={!f.list} onClick={() => setF({ ...f, list: null })}>
              Все подборки
            </Chip>
            {LISTS.map((l) => (
              <Chip key={l.id} active={f.list === l.id} onClick={() => setF({ ...f, list: f.list === l.id ? null : l.id })}>
                <span title={l.about}>{l.label}</span>
                <span className="font-mono text-[11px] opacity-60">{PROBLEMS.filter((p) => p.lists?.includes(l.id)).length}</span>
              </Chip>
            ))}
          </div>
          <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
            {TOPICS.filter((t) => topicCount(t.id)).map((t) => (
              <Chip key={t.id} active={f.topic === t.id} onClick={() => setF({ ...f, topic: f.topic === t.id ? null : t.id })} icon={<TopicIcon topic={t.id} className="size-3.5" />}>
                {t.id}
                <span className="font-mono text-[11px] opacity-60">{topicCount(t.id)}</span>
              </Chip>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Segmented<Status>
              size="sm"
              value={f.status}
              onChange={(status) => setF({ ...f, status })}
              options={[
                { value: "all", label: "Все" },
                { value: "new", label: <span className="flex items-center gap-1"><Circle className="size-3" />Новые</span> },
                { value: "tried", label: <span className="flex items-center gap-1"><CircleDashed className="size-3 text-amber" />Начатые</span> },
                { value: "solved", label: <span className="flex items-center gap-1"><CheckCircle2 className="size-3 text-accent" />Решённые</span> },
              ]}
            />
            <Segmented<Sort>
              size="sm"
              value={f.sort}
              onChange={(sort) => setF({ ...f, sort })}
              options={[
                { value: "topic", label: "По темам" },
                { value: "difficulty", label: "По сложности" },
                { value: "number", label: "По номеру" },
                { value: "unsolved", label: "Сначала нерешённые" },
              ]}
              className="max-w-full overflow-x-auto"
            />
            {activeFilters > 0 && (
              <button type="button" onClick={() => setF({ diff: [], topic: null, list: null, status: "all", sort: f.sort })} className="text-[12.5px] text-mute hover:text-ink">
                сбросить фильтры
              </button>
            )}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4">
          {groups.map((g) => {
            const isCollapsed = !!g.id && collapsed[g.id];
            const solved = g.items.filter((p) => submissions[p.id]?.solved).length;
            return (
              <section key={g.id || "all"} className="min-w-0">
                {g.id && (
                  <button
                    type="button"
                    onClick={() => setCollapsed({ ...collapsed, [g.id]: !collapsed[g.id] })}
                    className="mb-2 flex w-full items-center gap-2 text-left"
                  >
                    <ChevronDown className={cx("size-3.5 text-mute transition", isCollapsed && "-rotate-90")} />
                    <TopicIcon topic={g.id} />
                    <span className="text-[14px] font-semibold text-ink">{g.id}</span>
                    <span className="font-mono text-[12px] text-mute">
                      {solved}/{g.items.length}
                    </span>
                  </button>
                )}
                {!isCollapsed && (
                  <div className="overflow-hidden rounded-2xl border border-line">
                    {g.items.map((p, i) => (
                      <ProblemRow key={p.id} p={p} first={i === 0} showTopic={!g.id} />
                    ))}
                  </div>
                )}
              </section>
            );
          })}
          {!list.length && <div className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-mute">Ничего не подошло под фильтр</div>}
        </div>
        <p className="mt-5 text-[13px] text-mute">
          Python (Pyodide) и JavaScript, SQL — настоящий SQLite, многопоточность — async-модель с семафорами. Всё выполняется в браузере.
        </p>
      </div>
    </div>
  );
}

function ProblemRow({ p, first, showTopic }: { p: Problem; first: boolean; showTopic: boolean }) {
  const { submissions } = useData();
  const s = submissions[p.id];
  return (
    <Link to={`/problems/${p.id}`} className={cx("flex min-w-0 items-center gap-3 bg-surface px-3.5 py-3 transition hover:bg-raised sm:px-4", !first && "border-t border-line")}>
      {s?.solved ? (
        <CheckCircle2 className="size-5 shrink-0 text-accent" />
      ) : s ? (
        <CircleDashed className="size-5 shrink-0 text-amber" />
      ) : (
        <Circle className="size-5 shrink-0 text-line-strong" />
      )}
      {showTopic && <TopicIcon topic={p.topic} className="max-sm:hidden" />}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          {p.lc && <span className="shrink-0 font-mono text-[11.5px] text-mute">{p.lc}.</span>}
          <span className="truncate font-medium text-ink">{p.title}</span>
        </div>
        <div className="mt-0.5 truncate text-[12.5px] text-mute">
          {p.tags.join(" · ")}
          {p.lists?.includes("blind75") && <span className="ml-2 text-blue">Blind 75</span>}
        </div>
      </div>
      <DiffBadge d={p.difficulty} compact={false} />
    </Link>
  );
}
