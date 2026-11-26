import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Legend, Metric, Metrics, rng, StepControls, usePlayer } from "./kit";

// Память как сетка 8-байтных слов; одна строка = одна кэш-линия 64 Б.
// Массив лежит подряд — одна загрузка линии даёт 8 элементов. Список — узлы (значение + next)
// разбросаны аллокатором, каждый переход по next — вероятный промах кэша.
const COLS = 8;
const ROWS = 12;
const N = 16;
const BASE = 0x7f10;
const CACHE_LINES = 2; // крошечный L1, чтобы было видно вытеснение
const HIT_NS = 1;
const MISS_NS = 80;

type Mode = "array" | "list";
interface Cell {
  kind: "free" | "val" | "ptr" | "other";
  v?: number;
  node?: number;
  to?: number;
}

function buildList() {
  // узлы по 16 Б (2 слова) в случайных свободных местах, как после долгой жизни кучи
  const r = rng(42);
  const mem: Cell[] = Array.from({ length: COLS * ROWS }, () => ({ kind: "free" }) as Cell);
  // чужие объекты — куча не пустая
  for (let i = 0; i < 26; i++) mem[Math.floor(r() * mem.length)] = { kind: "other" };
  const slots: number[] = [];
  for (let i = 0; i < mem.length - 1; i += 2) if (mem[i].kind === "free" && mem[i + 1].kind === "free") slots.push(i);
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const at = slots.slice(0, N);
  at.forEach((a, k) => {
    mem[a] = { kind: "val", v: (k + 1) * 3, node: k };
    mem[a + 1] = { kind: "ptr", node: k, to: k + 1 < N ? at[k + 1] : -1 };
  });
  return { mem, at };
}

function buildArray() {
  const r = rng(42);
  const mem: Cell[] = Array.from({ length: COLS * ROWS }, () => ({ kind: "free" }) as Cell);
  for (let i = 0; i < 26; i++) {
    const k = Math.floor(r() * mem.length);
    if (k < 24 || k >= 24 + N) mem[k] = { kind: "other" };
  }
  const at = Array.from({ length: N }, (_, k) => 24 + k);
  at.forEach((a, k) => (mem[a] = { kind: "val", v: (k + 1) * 3, node: k }));
  return { mem, at };
}

interface Run {
  i: number; // сколько элементов прочитано
  cache: number[]; // линии в кэше, LRU: последняя — самая свежая
  hits: number;
  misses: number;
  lastMiss: boolean | null;
}
const start = (): Run => ({ i: 0, cache: [], hits: 0, misses: 0, lastMiss: null });

function touch(run: Run, addrs: number[]): Run {
  let { cache, hits, misses } = run;
  let miss = false;
  for (const a of addrs) {
    const line = Math.floor(a / COLS);
    if (cache.includes(line)) {
      hits++;
      cache = [...cache.filter((l) => l !== line), line];
    } else {
      misses++;
      miss = true;
      cache = [...cache, line].slice(-CACHE_LINES);
    }
  }
  return { i: run.i + 1, cache, hits, misses, lastMiss: miss };
}

export function MemoryLayout() {
  const [mode, setMode] = useState<Mode>("array");
  const layout = useMemo(() => (mode === "array" ? buildArray() : buildList()), [mode]);
  const [run, setRun] = useState(start);
  const done = run.i >= N;
  const step = useCallback(() => {
    setRun((r) => {
      if (r.i >= N) return r;
      const a = layout.at[r.i];
      // массив: читаем значение; список: значение и указатель next
      return touch(r, mode === "array" ? [a] : [a, a + 1]);
    });
  }, [layout, mode]);
  const player = usePlayer(() => {
    step();
    return run.i + 1 < N;
  }, 380);

  const W = 64;
  const H = 34;
  const G = 4;
  const X = (i: number) => (i % COLS) * (W + G) + 46;
  const Y = (i: number) => Math.floor(i / COLS) * (H + G + 4);
  const curAddr = run.i > 0 ? layout.at[run.i - 1] : null;
  const ns = run.hits * HIT_NS + run.misses * MISS_NS;

  return (
    <Frame
      title="Массив против списка в памяти"
      hint="строка = кэш-линия 64 Б"
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <Segmented<Mode>
            value={mode}
            onChange={(m) => {
              player.stop();
              setMode(m);
              setRun(start());
            }}
            block
            options={[
              { value: "array", label: "Массив long[16]" },
              { value: "list", label: "LinkedList" },
            ]}
          />
          <StepControls onStep={step} onReset={() => { player.stop(); setRun(start()); }} canStep={!done} player={player} stepLabel="Читать" />
        </div>
      }
    >
      <Metrics>
        <Metric label="прочитано" value={`${run.i}/${N}`} />
        <Metric label="промахов кэша" value={run.misses} tone={run.misses > 4 ? "bad" : undefined} />
        <Metric label="попаданий" value={run.hits} tone="ok" />
        <Metric label="≈ время" value={`${ns} нс`} tone={ns > 600 ? "bad" : "accent"} />
      </Metrics>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${46 + COLS * (W + G)} ${ROWS * (H + G + 4)}`} className="block w-full min-w-[480px]">
          <defs>
            <marker id="ml-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0 L6 3 L0 6 z" fill={C.blue} />
            </marker>
          </defs>
          {Array.from({ length: ROWS }, (_, row) => {
            const inCache = run.cache.includes(row);
            return (
              <g key={row}>
                <rect x={40} y={row * (H + G + 4) - 2} width={COLS * (W + G) + 4} height={H + 4} rx={7} fill={inCache ? "color-mix(in oklab, var(--color-ok) 10%, transparent)" : "none"} stroke={inCache ? C.ok : "none"} strokeDasharray="4 3" />
                <text x={0} y={row * (H + G + 4) + H / 2 + 4} fontSize={10} fill={inCache ? C.ok : C.mute} fontFamily="var(--font-mono)">
                  {(BASE + row * 64).toString(16)}
                </text>
              </g>
            );
          })}
          {layout.mem.map((c, i) => {
            const isCur = curAddr !== null && (i === curAddr || (mode === "list" && i === curAddr + 1));
            const read = c.node !== undefined && c.node < run.i;
            const fill = c.kind === "free" ? "transparent" : c.kind === "other" ? C.raised : c.kind === "val" ? (read ? "color-mix(in oklab, var(--color-accent) 22%, var(--color-surface))" : C.surface) : read ? "color-mix(in oklab, var(--color-blue) 18%, var(--color-surface))" : C.surface;
            return (
              <g key={i}>
                <rect x={X(i)} y={Y(i)} width={W} height={H} rx={5} fill={fill} stroke={isCur ? C.ink : c.kind === "val" ? C.accent : c.kind === "ptr" ? C.blue : C.line} strokeOpacity={c.kind === "val" || c.kind === "ptr" ? (isCur ? 1 : 0.55) : 1} strokeWidth={isCur ? 2 : 1} strokeDasharray={c.kind === "free" ? "2 3" : undefined} />
                {c.kind === "val" && (
                  <text x={X(i) + W / 2} y={Y(i) + H / 2 + 5} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.ink} fontFamily="var(--font-mono)">
                    {c.v}
                  </text>
                )}
                {c.kind === "ptr" && (
                  <text x={X(i) + W / 2} y={Y(i) + H / 2 + 4} textAnchor="middle" fontSize={10.5} fill={C.blue} fontFamily="var(--font-mono)">
                    {c.to === -1 ? "null" : `→${(BASE + c.to! * 8).toString(16).slice(-3)}`}
                  </text>
                )}
              </g>
            );
          })}
          {mode === "list" &&
            layout.at.slice(0, -1).map((a, k) => {
              const from = a + 1;
              const to = layout.at[k + 1];
              const x1 = X(from) + W / 2;
              const y1 = Y(from) + H / 2;
              const x2 = X(to) + W / 2;
              const y2 = Y(to) + H / 2;
              const active = k === run.i - 1;
              const mx = (x1 + x2) / 2 + (y2 - y1) * 0.25;
              const my = (y1 + y2) / 2 - (x2 - x1) * 0.25;
              return (
                <path
                  key={k}
                  d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`}
                  fill="none"
                  stroke={C.blue}
                  strokeWidth={active ? 2.2 : 1}
                  strokeOpacity={active ? 1 : 0.18}
                  markerEnd={active ? "url(#ml-arrow)" : undefined}
                />
              );
            })}
        </svg>
      </div>
      <Legend
        className="mt-2"
        items={[
          { color: C.accent, label: "значение" },
          { color: C.blue, label: "указатель next" },
          { color: C.raised, label: "чужие объекты" },
          { color: C.ok, label: `в кэше (${CACHE_LINES} линии)` },
        ]}
      />
      <p className={cx("mt-3 text-[13.5px] leading-relaxed", run.lastMiss ? "text-amber" : "text-dim")}>
        {run.i === 0
          ? "Нажми «Читать» или «Авто»: суммируем элементы по порядку."
          : run.lastMiss
            ? `Промах: линии нет в кэше, ждём память ~${MISS_NS} нс.`
            : `Попадание: элемент уже в загруженной линии, ~${HIT_NS} нс.`}
        {done && (mode === "array" ? " Массив: 16 элементов = 2 линии = 2 промаха. Префетчер в реальном CPU убрал бы и их." : " Список: почти каждый узел — новая линия. И префетчер не поможет: адрес следующего узла известен только после чтения текущего.")}
      </p>
    </Frame>
  );
}

// ── Динамический массив: рост ёмкости и амортизация ──────────

type Growth = "x2" | "x1.5" | "+4";

export function DynArray() {
  const [growth, setGrowth] = useState<Growth>("x2");
  const [n, setN] = useState(5);
  const sim = useMemo(() => {
    let cap = 1;
    let copies = 0;
    const steps: { n: number; cap: number; copies: number; grew: boolean }[] = [];
    for (let i = 1; i <= 64; i++) {
      let grew = false;
      if (i > cap) {
        copies += cap; // перенос старых элементов в новый буфер
        cap = growth === "x2" ? cap * 2 : growth === "x1.5" ? Math.max(cap + 1, Math.floor(cap * 1.5)) : cap + 4;
        grew = true;
      }
      copies += 0;
      steps.push({ n: i, cap, copies, grew });
    }
    return steps;
  }, [growth]);
  const cur = sim[n - 1];
  const W = 560;
  const Hh = 120;
  const maxC = Math.max(...sim.map((s) => s.copies), 64);
  const pts = sim.map((s, i) => `${(i / 63) * W},${Hh - (s.copies / maxC) * Hh}`).join(" ");

  return (
    <Frame
      title="Динамический массив: append и рост"
      hint="ArrayList, vector, list в Python"
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <Segmented<Growth>
            value={growth}
            onChange={setGrowth}
            block
            options={[
              { value: "x2", label: "×2" },
              { value: "x1.5", label: "×1.5" },
              { value: "+4", label: "+4" },
            ]}
          />
          <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setN((v) => Math.min(64, v + 1))} disabled={n >= 64}>
            append
          </Button>
          <Button onClick={() => setN((v) => Math.min(64, v + 8))}>+8</Button>
          <Button onClick={() => setN(1)}>Сначала</Button>
        </div>
      }
    >
      <Metrics>
        <Metric label="size" value={cur.n} />
        <Metric label="capacity" value={cur.cap} />
        <Metric label="копирований всего" value={cur.copies} tone={cur.grew ? "amber" : undefined} />
        <Metric label="на один append" value={(cur.copies / cur.n).toFixed(2)} tone={cur.copies / cur.n > 3 ? "bad" : "ok"} />
      </Metrics>
      <div className="mt-4 flex flex-wrap gap-1">
        {Array.from({ length: cur.cap }, (_, i) => (
          <div
            key={i}
            className={cx("h-6 w-[22px] rounded-[4px] border transition", i < cur.n ? "border-accent/60 bg-accent/25" : "border-dashed border-line")}
            style={i === cur.n - 1 && cur.grew ? { boxShadow: "0 0 0 2px var(--color-amber)" } : undefined}
          />
        ))}
      </div>
      <div className={cx("mt-2 text-[13px]", cur.grew ? "text-amber" : "text-mute")}>
        {cur.grew ? `Место кончилось: выделен буфер на ${cur.cap}, старые ${cur.n - 1} элементов скопированы.` : "Место есть — append за O(1), просто запись в следующую ячейку."}
      </div>
      <svg viewBox={`-4 -6 ${W + 8} ${Hh + 24}`} className="mt-4 block w-full">
        <polyline points={pts} fill="none" stroke={growth === "+4" ? C.rose : C.accent} strokeWidth={2} />
        <line x1={0} y1={Hh} x2={W} y2={Hh - (128 / maxC) * Hh} stroke={C.mute} strokeDasharray="4 4" />
        <circle cx={((n - 1) / 63) * W} cy={Hh - (cur.copies / maxC) * Hh} r={4.5} fill={C.amber} />
        <text x={W} y={Hh + 16} textAnchor="end" fontSize={11} fill={C.mute} fontFamily="var(--font-mono)">
          n = 64
        </text>
        <text x={6} y={8} fontSize={11} fill={C.mute} fontFamily="var(--font-mono)">
          копирований всего · пунктир = 2n
        </text>
      </svg>
    </Frame>
  );
}
