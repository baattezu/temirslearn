import { useState } from "react";
import { useIsPhone } from "../lib/hooks";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { Legend, Metric, Metrics, StepControls, usePlayer, C } from "./kit";

// BFS и DFS на сетке. BFS — очередь, расходится «волной», первый раз дошёл до цели — кратчайший путь.
// DFS — стек, ныряет вглубь, путь находит, но не обязательно короткий. Стены ставятся кликом.

type Algo = "bfs" | "dfs" | "dijkstra";
const DIRS = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
];

function defaultWalls(cols: number, rows: number) {
  const w = new Set<number>();
  const id = (r: number, c: number) => r * cols + c;
  for (let r = 0; r < rows - 2; r++) w.add(id(r, Math.floor(cols / 3)));
  for (let r = 2; r < rows; r++) w.add(id(r, Math.floor((2 * cols) / 3)));
  return w;
}

interface Run {
  frontier: number[]; // очередь, стек или «куча» (отсортирован по dist)
  seen: Map<number, number>; // клетка → откуда пришли
  dist: Map<number, number>;
  order: number[]; // порядок извлечения
  done: boolean;
  found: boolean;
}

export function GridSearch() {
  const phone = useIsPhone();
  const cols = phone ? 10 : 16;
  const rows = phone ? 10 : 9;
  const start = Math.floor(rows / 2) * cols + 1;
  const goal = Math.floor(rows / 2) * cols + cols - 2;
  const [algo, setAlgo] = useState<Algo>("bfs");
  const [walls, setWalls] = useState(() => defaultWalls(cols, rows));
  const [mud, setMud] = useState(false);
  const cost = (i: number) => (mud && i % cols > 3 && i % cols < cols - 4 && Math.floor(i / cols) < rows - 3 ? 5 : 1);

  const fresh = (): Run => ({ frontier: [start], seen: new Map([[start, -1]]), dist: new Map([[start, 0]]), order: [], done: false, found: false });
  const [run, setRun] = useState<Run>(fresh);
  const key = `${cols}x${rows}`;
  const [shownKey, setShownKey] = useState(key);
  if (shownKey !== key) {
    // телефон ↔ десктоп: другая сетка — начинаем заново (setState во время рендера, официальный паттерн)
    setShownKey(key);
    setWalls(defaultWalls(cols, rows));
    setRun(fresh());
  }

  const step = (r: Run): Run => {
    if (r.done || !r.frontier.length) return { ...r, done: true };
    const frontier = [...r.frontier];
    const seen = new Map(r.seen);
    const dist = new Map(r.dist);
    let cur: number;
    if (algo === "bfs") cur = frontier.shift()!;
    else if (algo === "dfs") cur = frontier.pop()!;
    else {
      frontier.sort((a, b) => dist.get(a)! - dist.get(b)!);
      cur = frontier.shift()!;
    }
    const order = [...r.order, cur];
    if (cur === goal) return { frontier, seen, dist, order, done: true, found: true };
    const cr = Math.floor(cur / cols);
    const cc = cur % cols;
    for (const [dr, dc] of algo === "dfs" ? [...DIRS].reverse() : DIRS) {
      const nr = cr + dr;
      const nc = cc + dc;
      if (nr < 0 || nc < 0 || nr >= rows || nc >= cols) continue;
      const n = nr * cols + nc;
      if (walls.has(n)) continue;
      const nd = dist.get(cur)! + (algo === "dijkstra" ? cost(n) : 1);
      if (algo === "dijkstra") {
        if (!dist.has(n) || nd < dist.get(n)!) {
          dist.set(n, nd);
          seen.set(n, cur);
          if (!frontier.includes(n)) frontier.push(n);
        }
      } else if (!seen.has(n)) {
        seen.set(n, cur);
        dist.set(n, nd);
        frontier.push(n);
      }
    }
    return { frontier, seen, dist, order, done: !frontier.length, found: false };
  };

  const player = usePlayer(() => {
    if (run.done) return false;
    setRun(step(run));
    return true;
  }, 60);

  const path = new Set<number>();
  let pathCost = 0;
  if (run.found) {
    let c = goal;
    while (c !== -1) {
      path.add(c);
      if (c !== start) pathCost += algo === "dijkstra" ? cost(c) : 1;
      c = run.seen.get(c)!;
    }
  }
  const orderIdx = new Map(run.order.map((c, i) => [c, i]));
  const reset = () => {
    player.stop();
    setRun(fresh());
  };

  return (
    <Frame
      title="Поиск в сетке"
      hint="кликай клетки — ставь стены"
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <Segmented<Algo>
            value={algo}
            onChange={(a) => {
              setAlgo(a);
              reset();
            }}
            block
            options={[
              { value: "bfs", label: "BFS · очередь" },
              { value: "dfs", label: "DFS · стек" },
              { value: "dijkstra", label: "Дейкстра" },
            ]}
          />
          <StepControls onStep={() => setRun(step(run))} onReset={reset} canStep={!run.done} player={player} />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <button type="button" onClick={() => { setWalls(new Set()); reset(); }} className="text-[13px] text-dim underline-offset-4 hover:text-ink hover:underline">
              убрать стены
            </button>
            <span className="text-line-strong">·</span>
            <button type="button" onClick={() => { setWalls(defaultWalls(cols, rows)); reset(); }} className="text-[13px] text-dim underline-offset-4 hover:text-ink hover:underline">
              стены по умолчанию
            </button>
            <span className="text-line-strong">·</span>
            <button type="button" onClick={() => { setMud(!mud); reset(); }} className={cx("text-[13px] underline-offset-4 hover:underline", mud ? "text-amber" : "text-dim hover:text-ink")}>
              {mud ? "убрать болото" : "добавить болото (цена 5)"}
            </button>
          </div>
        </div>
      }
    >
      <Metrics>
        <Metric label="извлечено" value={run.order.length} />
        <Metric label={algo === "dfs" ? "в стеке" : algo === "bfs" ? "в очереди" : "в куче"} value={run.frontier.length} />
        <Metric label="длина пути" value={run.found ? path.size - 1 : "—"} tone={run.found ? "accent" : undefined} />
        <Metric label="цена пути" value={run.found ? pathCost : "—"} />
      </Metrics>
      <div className="mt-4 grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cols * rows }, (_, i) => {
          const isWall = walls.has(i);
          const o = orderIdx.get(i);
          const inFront = run.frontier.includes(i);
          const swamp = mud && cost(i) > 1;
          const bg = isWall
            ? C.lineStrong
            : path.has(i)
              ? C.accent
              : o !== undefined
                ? `color-mix(in oklab, ${algo === "dfs" ? C.violet : C.blue} ${Math.max(14, 60 - (o / Math.max(1, run.order.length)) * 46)}%, var(--color-surface))`
                : inFront
                  ? "color-mix(in oklab, var(--color-amber) 30%, var(--color-surface))"
                  : swamp
                    ? "color-mix(in oklab, #8a6d3b 28%, var(--color-surface))"
                    : C.raised;
          return (
            <button
              key={i}
              type="button"
              aria-label={`клетка ${i}`}
              onClick={() => {
                if (i === start || i === goal) return;
                const w = new Set(walls);
                if (w.has(i)) w.delete(i);
                else w.add(i);
                setWalls(w);
                reset();
              }}
              className="relative aspect-square rounded-[4px] transition-colors"
              style={{ background: bg }}
            >
              {(i === start || i === goal) && (
                <span className={cx("absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold", path.has(i) ? "text-accent-ink" : "text-ink")}>{i === start ? "S" : "G"}</span>
              )}
              {!phone && run.dist.has(i) && o !== undefined && !path.has(i) && i !== start && (
                <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] text-ink/70">{run.dist.get(i)}</span>
              )}
            </button>
          );
        })}
      </div>
      <Legend
        className="mt-3"
        items={[
          { color: algo === "dfs" ? C.violet : C.blue, label: "извлечена (ярче — раньше)" },
          { color: C.amber, label: algo === "dfs" ? "в стеке" : "на границе" },
          { color: C.accent, label: "найденный путь" },
          ...(mud ? [{ color: "#8a6d3b", label: "болото, шаг стоит 5" }] : []),
        ]}
      />
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {run.found
          ? algo === "dfs"
            ? `DFS нашёл путь длиной ${path.size - 1}, но не обязательно кратчайший — он просто первый, куда занырнул.`
            : algo === "bfs"
              ? `BFS гарантирует кратчайший путь по числу шагов: клетки извлекаются в порядке расстояния.${mud ? " Но цену болота он не видит — сравни с Дейкстрой." : ""}`
              : `Дейкстра извлекает клетки по возрастанию накопленной цены — путь минимален по сумме весов.`
          : run.done
            ? "Цель недостижима."
            : "Шагай или включи «Авто». Цифры в клетках — расстояние от старта."}
      </p>
    </Frame>
  );
}
