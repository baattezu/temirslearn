import { useState } from "react";
import { Segmented } from "../ui/Segmented";
import { Toggle } from "../ui/Field";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { Caption, StepControls, usePlayer } from "./kit";

// ══ EXPLAIN ANALYZE: дерево плана ═══════════════════════════

interface PNode {
  op: string;
  detail?: string;
  est: number;
  act: number;
  loops?: number;
  time: number; // actual total time, мс (на один loop)
  lines?: string[];
  why: string;
  kids?: PNode[];
}

const BAD: PNode = {
  op: "Limit",
  est: 10,
  act: 10,
  time: 2841,
  why: "Корень плана. Его actual time — время всего запроса. Читать план нужно снизу вверх: данные текут от листьев к корню.",
  kids: [
    {
      op: "Sort",
      detail: "Sort Key: count(*) DESC",
      est: 1000,
      act: 10,
      time: 2841,
      lines: ["Sort Method: top-N heapsort  Memory: 26kB"],
      why: "top-N heapsort: для LIMIT 10 Postgres держит кучу из 10 элементов, а не сортирует всё. Памяти мало — сортировка не проблема.",
      kids: [
        {
          op: "HashAggregate",
          detail: "Group Key: u.name",
          est: 1000,
          act: 8213,
          time: 2838,
          why: "Группировка хеш-таблицей. Сама по себе быстрая: почти всё время (2838 из 2841 мс) пришло из ребёнка.",
          kids: [
            {
              op: "Nested Loop",
              est: 1200,
              act: 412377,
              time: 2790,
              why: "Главная беда. Планировщик ждал 1 200 строк и выбрал Nested Loop: «для каждой строки слева — поиск по индексу справа». При 1 200 это дёшево. Пришло 412 тысяч — в 340 раз больше. Оценка неверна, потому что неверна оценка ребёнка users.",
              kids: [
                {
                  op: "Seq Scan on users u",
                  est: 50,
                  act: 8400,
                  time: 61,
                  lines: ["Filter: (city = 'Almaty')", "Rows Removed by Filter: 491600"],
                  why: "Ожидали 50 пользователей из Алматы, реально 8 400 — ошибка в 168 раз. Статистика устарела: таблицу массово заливали, а ANALYZE не запускался. Отсюда неверный выбор соединения выше. Лечение: ANALYZE users (и следить за autovacuum).",
                },
                {
                  op: "Index Scan using orders_user_id_idx on orders o",
                  est: 24,
                  act: 49,
                  loops: 8400,
                  time: 0.33,
                  lines: ["Index Cond: (user_id = u.id)", "Filter: (created_at > now() - '30 days')", "Rows Removed by Filter: 120", "Buffers: shared hit=21000 read=30210"],
                  why: "actual time и rows — на ОДНУ итерацию, а loops = 8400. Реально: 0.33 мс × 8 400 ≈ 2 770 мс и 30 210 чтений страниц с диска. Плюс индекс по user_id находит все заказы пользователя, а фильтр по дате отбрасывает 120 из 169 — индекс не покрывает условие.",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

const GOOD: PNode = {
  op: "Limit",
  est: 10,
  act: 10,
  time: 312,
  why: "После ANALYZE и нового индекса тот же запрос — 312 мс вместо 2 841.",
  kids: [
    {
      op: "Sort",
      detail: "Sort Key: count(*) DESC",
      est: 8100,
      act: 10,
      time: 312,
      lines: ["Sort Method: top-N heapsort  Memory: 26kB"],
      why: "Без изменений.",
      kids: [
        {
          op: "HashAggregate",
          detail: "Group Key: u.name",
          est: 8100,
          act: 8213,
          time: 309,
          why: "Оценка 8 100 против 8 213 — статистика свежая.",
          kids: [
            {
              op: "Hash Join",
              detail: "Hash Cond: (o.user_id = u.id)",
              est: 405000,
              act: 412377,
              time: 251,
              why: "Зная, что строк сотни тысяч, планировщик выбрал Hash Join: один проход по каждой стороне вместо 8 400 поисков по индексу.",
              kids: [
                {
                  op: "Index Scan using orders_created_at_user_id_idx on orders o",
                  est: 2400000,
                  act: 2410551,
                  time: 140,
                  lines: ["Index Cond: (created_at > now() - '30 days')", "Buffers: shared hit=18420"],
                  why: "Новый индекс (created_at, user_id): условие по дате — диапазон по ведущей колонке, читаем только последние 30 дней. Все страницы в кэше.",
                },
                {
                  op: "Hash",
                  est: 8300,
                  act: 8400,
                  time: 58,
                  lines: ["Buckets: 16384  Memory Usage: 420kB"],
                  why: "Хеш-таблица по маленькой стороне (пользователи Алматы) строится в памяти — 420 КБ, в work_mem помещается.",
                  kids: [
                    {
                      op: "Seq Scan on users u",
                      est: 8300,
                      act: 8400,
                      time: 55,
                      lines: ["Filter: (city = 'Almaty')", "Rows Removed by Filter: 491600"],
                      why: "Тот же Seq Scan, но теперь оценка точная. Индекс по city здесь не нужен: 1.7% таблицы.",
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

function flat(n: PNode, depth = 0, out: { n: PNode; depth: number }[] = []) {
  out.push({ n, depth });
  n.kids?.forEach((k) => flat(k, depth + 1, out));
  return out;
}
const ratio = (n: PNode) => {
  const r = Math.max(n.est, n.act) / Math.max(1, Math.min(n.est, n.act));
  return n.est > n.act ? r : r;
};

export function ExplainTree() {
  const [plan, setPlan] = useState<"bad" | "good">("bad");
  const root = plan === "bad" ? BAD : GOOD;
  const rows = flat(root);
  const [sel, setSel] = useState(4);
  const s = rows[Math.min(sel, rows.length - 1)].n;
  const total = root.time;
  return (
    <Frame title="EXPLAIN (ANALYZE, BUFFERS)" hint="кликни узел плана">
      <Segmented
        value={plan}
        onChange={(p) => {
          setPlan(p);
          setSel(4);
        }}
        block
        options={[
          { value: "bad", label: "Было: 2.8 с" },
          { value: "good", label: "После ANALYZE + индекс: 0.3 с" },
        ]}
      />
      <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-bg/60 py-2 font-mono text-[11.5px] leading-[1.6]">
        {rows.map(({ n, depth }, i) => {
          const r = ratio(n);
          const self = (n.time * (n.loops ?? 1)) - (n.kids ?? []).reduce((a, k) => a + k.time * (k.loops ?? 1), 0);
          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => setSel(i)}
                className={cx("block w-full whitespace-pre px-3 text-left", i === sel ? "bg-accent/15" : "hover:bg-raised")}
              >
                <span className="text-mute">{"  ".repeat(depth)}{depth ? "->  " : ""}</span>
                <span className="text-ink">{n.op}</span>
                <span className="text-mute"> (rows=</span>
                <span className="text-dim">{n.est}</span>
                <span className="text-mute">) (actual time={n.time} rows=</span>
                <span className={r >= 10 ? "text-bad" : "text-ok"}>{n.act}</span>
                <span className="text-mute"> loops={n.loops ?? 1})</span>
                {self / total > 0.4 && <span className="ml-2 rounded bg-bad/20 px-1 text-bad">{Math.round((self / total) * 100)}% времени</span>}
              </button>
              {[n.detail, ...(n.lines ?? [])].filter(Boolean).map((l, k) => (
                <div key={k} className="whitespace-pre px-3 text-mute">
                  {"  ".repeat(depth)}
                  {depth ? "    " : ""}
                  {"      "}
                  {l}
                </div>
              ))}
            </div>
          );
        })}
      </pre>
      <div className="mt-3 rounded-xl border border-line bg-bg/40 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[12.5px] text-ink">{s.op}</span>
          <span className={cx("rounded-md px-1.5 py-0.5 font-mono text-[11px]", ratio(s) >= 10 ? "bg-bad/15 text-bad" : "bg-ok/15 text-ok")}>
            оценка {s.est} → факт {s.act}
            {ratio(s) >= 2 ? ` (×${Math.round(ratio(s))})` : ""}
          </span>
          {s.loops && s.loops > 1 && <span className="rounded-md bg-amber/15 px-1.5 py-0.5 font-mono text-[11px] text-amber">× {s.loops} loops = {(s.time * s.loops).toFixed(0)} мс</span>}
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-dim">{s.why}</p>
      </div>
    </Frame>
  );
}

// ══ Очередь блокировок ══════════════════════════════════════

interface LS {
  t: string;
  who: { name: string; sql: string; mode: string; state: "run" | "wait" | "done" | "fail" | "idle"; note?: string }[];
  note: string;
}
const ss = (name: string, sql: string, mode: string, state: LS["who"][0]["state"], note?: string) => ({ name, sql, mode, state, note });

const NO_TIMEOUT: LS[] = [
  { t: "0 с", who: [ss("A", "SELECT … FROM orders (отчёт на 5 мин)", "AccessShare", "run")], note: "Долгий отчёт держит самую слабую блокировку — она совместима со всем, кроме AccessExclusive." },
  {
    t: "1 с",
    who: [ss("A", "SELECT … (отчёт)", "AccessShare", "run"), ss("M", "ALTER TABLE orders ADD COLUMN note text", "AccessExclusive", "wait", "ждёт A")],
    note: "Миграция хочет AccessExclusive — несовместима ни с чем. Встаёт в очередь за отчётом. Пока всё логично.",
  },
  {
    t: "2 с",
    who: [
      ss("A", "SELECT … (отчёт)", "AccessShare", "run"),
      ss("M", "ALTER TABLE …", "AccessExclusive", "wait", "ждёт A"),
      ss("B", "SELECT * FROM orders WHERE id = 7", "AccessShare", "wait", "ждёт M"),
      ss("C", "INSERT INTO orders …", "RowExclusive", "wait", "ждёт M"),
      ss("D", "SELECT … (API)", "AccessShare", "wait", "ждёт M"),
    ],
    note: "Катастрофа: новые быстрые запросы совместимы с отчётом A, но встают в очередь ЗА ожидающей миграцией. Очередь блокировок — честная (FIFO). Таблица недоступна для всех на 5 минут, пул соединений приложения кончается.",
  },
  {
    t: "5 мин",
    who: [ss("A", "отчёт", "AccessShare", "done"), ss("M", "ALTER TABLE …", "AccessExclusive", "run", "~1 мс"), ss("B", "SELECT …", "AccessShare", "wait"), ss("C", "INSERT …", "RowExclusive", "wait"), ss("D", "SELECT …", "AccessShare", "wait")],
    note: "Отчёт закончился, ALTER выполнился за миллисекунду (добавление nullable колонки без default — только каталог).",
  },
  { t: "5 мин", who: [ss("M", "ALTER TABLE …", "AccessExclusive", "done"), ss("B", "SELECT …", "AccessShare", "run"), ss("C", "INSERT …", "RowExclusive", "run"), ss("D", "SELECT …", "AccessShare", "run")], note: "Очередь рассосалась. Сама миграция была мгновенной — простой на 5 минут устроило ожидание блокировки." },
];
const WITH_TIMEOUT: LS[] = [
  NO_TIMEOUT[0],
  {
    t: "1 с",
    who: [ss("A", "SELECT … (отчёт)", "AccessShare", "run"), ss("M", "SET lock_timeout = '2s'; ALTER TABLE …", "AccessExclusive", "wait", "ждёт A, не больше 2 с")],
    note: "Миграция запущена с lock_timeout — готова ждать блокировку только 2 секунды.",
  },
  {
    t: "2 с",
    who: [ss("A", "SELECT … (отчёт)", "AccessShare", "run"), ss("M", "ALTER TABLE …", "AccessExclusive", "wait", "ждёт A"), ss("B", "SELECT …", "AccessShare", "wait", "ждёт M"), ss("C", "INSERT …", "RowExclusive", "wait", "ждёт M")],
    note: "Очередь за миграцией всё равно образуется — но ненадолго.",
  },
  {
    t: "3 с",
    who: [ss("A", "SELECT … (отчёт)", "AccessShare", "run"), ss("M", "ALTER TABLE …", "AccessExclusive", "fail", "lock timeout"), ss("B", "SELECT …", "AccessShare", "run"), ss("C", "INSERT …", "RowExclusive", "run")],
    note: "ERROR: canceling statement due to lock timeout. Миграция сдалась, очередь освободилась через 2 секунды, а не через 5 минут. Инструмент миграций повторит попытку позже.",
  },
];

export function LockQueue() {
  const [timeout, setTimeoutOn] = useState(false);
  const steps = timeout ? WITH_TIMEOUT : NO_TIMEOUT;
  const [i, setI] = useState(0);
  const s = steps[Math.min(i, steps.length - 1)];
  const player = usePlayer(() => {
    if (i >= steps.length - 1) return false;
    setI(i + 1);
    return true;
  }, 1800);
  return (
    <Frame
      title="Очередь блокировок на таблице orders"
      hint={`момент: ${s.t}`}
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <Toggle checked={timeout} onChange={(v) => { player.stop(); setTimeoutOn(v); setI(0); }} label="Миграция с lock_timeout = 2s" />
          <StepControls onStep={() => setI(i + 1)} onBack={() => setI(i - 1)} canBack={i > 0} canStep={i < steps.length - 1} onReset={() => { player.stop(); setI(0); }} player={player} />
        </div>
      }
    >
      <Caption>Сессии в порядке прихода</Caption>
      <div className="grid gap-1.5">
        {s.who.map((w) => (
          <div
            key={w.name}
            className={cx(
              "grid grid-cols-[28px_1fr_auto] items-center gap-2 rounded-xl border px-3 py-2",
              w.state === "run" ? "border-ok/40 bg-ok/[0.06]" : w.state === "wait" ? "border-amber/40 bg-amber/[0.06]" : w.state === "fail" ? "border-bad/40 bg-bad/[0.06]" : "border-line opacity-50",
            )}
          >
            <span className="font-mono text-[13px] font-semibold text-ink">{w.name}</span>
            <div className="min-w-0">
              <div className="truncate font-mono text-[12px] text-ink">{w.sql}</div>
              <div className="font-mono text-[10.5px] text-mute">{w.mode}Lock</div>
            </div>
            <span className={cx("font-mono text-[11px]", w.state === "run" ? "text-ok" : w.state === "wait" ? "text-amber" : w.state === "fail" ? "text-bad" : "text-mute")}>
              {w.state === "run" ? "работает" : w.state === "wait" ? (w.note ?? "ждёт") : w.state === "fail" ? (w.note ?? "ошибка") : "завершён"}
              {w.state === "run" && w.note ? ` · ${w.note}` : ""}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-3 rounded-xl border border-line bg-bg/40 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-dim">{s.note}</p>
    </Frame>
  );
}
