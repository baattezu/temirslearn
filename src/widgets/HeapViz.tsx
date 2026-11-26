import { ArrowDownToLine, ArrowUpFromLine, Layers } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Log, rng, StepControls, usePlayer } from "./kit";

// Двоичная min-куча: дерево, которое на самом деле — массив.
// parent(i) = (i − 1) / 2, дети — 2i + 1 и 2i + 2. Каждый шаг — одно сравнение/обмен.
const MAX = 15;

type Phase = { t: "up"; i: number } | { t: "down"; i: number; heapify?: number } | null;
interface S {
  a: number[];
  phase: Phase;
  hl: number[];
  done: number | null;
  log: string[];
  seed: number;
  swaps: number;
}

const init = (): S => ({ a: [3, 8, 5, 12, 9, 7, 6, 20, 15], phase: null, hl: [], done: null, log: [], seed: 9, swaps: 0 });

function step(s0: S): S {
  const s: S = { ...s0, a: [...s0.a], log: [...s0.log] };
  const p = s.phase;
  if (!p) return s;
  const a = s.a;
  if (p.t === "up") {
    const par = (p.i - 1) >> 1;
    if (p.i === 0 || a[par] <= a[p.i]) {
      s.log.push(p.i === 0 ? `${a[p.i]} дошёл до корня` : `${a[par]} ≤ ${a[p.i]} — порядок кучи восстановлен`);
      return { ...s, phase: null, hl: [], done: p.i };
    }
    [a[par], a[p.i]] = [a[p.i], a[par]];
    s.log.push(`${a[p.i]} > ${a[par]}: меняем [${par}] ↔ [${p.i}]`);
    return { ...s, phase: { t: "up", i: par }, hl: [par, p.i], swaps: s.swaps + 1 };
  }
  // down
  const l = 2 * p.i + 1;
  const r = l + 1;
  let m = p.i;
  if (l < a.length && a[l] < a[m]) m = l;
  if (r < a.length && a[r] < a[m]) m = r;
  if (m === p.i) {
    const kids = [l, r].filter((x) => x < a.length).map((x) => a[x]);
    s.log.push(kids.length ? `${a[p.i]} ≤ детей (${kids.join(", ")}) — стоп` : `${a[p.i]} — лист, стоп`);
    if (p.heapify !== undefined && p.heapify > 0) {
      const k = p.heapify - 1;
      s.log.push(`heapify: следующий узел [${k}] = ${a[k]}`);
      return { ...s, phase: { t: "down", i: k, heapify: k }, hl: [k] };
    }
    return { ...s, phase: null, hl: [], done: p.i };
  }
  [a[m], a[p.i]] = [a[p.i], a[m]];
  s.log.push(`меньший ребёнок ${a[p.i]} < ${a[m]}: меняем [${p.i}] ↔ [${m}]`);
  return { ...s, phase: { ...p, i: m }, hl: [p.i, m], swaps: s.swaps + 1 };
}

export function HeapViz() {
  const [s, setS] = useState(init);
  const busy = s.phase !== null;
  const player = usePlayer(() => {
    if (!s.phase) return false;
    setS(step(s));
    return true;
  }, 700);

  const push = () => {
    const r = rng(s.seed);
    const v = 1 + Math.floor(r() * 30);
    const a = [...s.a, v];
    setS({ ...s, a, phase: { t: "up", i: a.length - 1 }, hl: [a.length - 1], done: null, seed: s.seed + 1, swaps: 0, log: [...s.log, `push(${v}): кладём в конец массива, индекс ${a.length - 1}, и поднимаем`] });
  };
  const pop = () => {
    const top = s.a[0];
    const last = s.a[s.a.length - 1];
    const a = s.a.slice(0, -1);
    if (a.length) a[0] = last;
    setS({ ...s, a, phase: a.length ? { t: "down", i: 0 } : null, hl: [0], done: null, swaps: 0, log: [...s.log, `pop() → ${top}. Последний элемент ${last} — в корень, и опускаем`] });
  };
  const heapify = () => {
    const r = rng(s.seed + 100);
    const a = Array.from({ length: 12 }, () => 1 + Math.floor(r() * 40));
    const k = (a.length >> 1) - 1;
    setS({ ...s, a, phase: { t: "down", i: k, heapify: k }, hl: [k], done: null, seed: s.seed + 1, swaps: 0, log: [`heapify случайного массива: опускаем узлы с [${k}] до [0] — листья уже кучи`] });
  };

  const depth = Math.ceil(Math.log2(MAX + 1));
  const W = 560;
  const LH = 64;
  const pos = (i: number) => {
    const d = Math.floor(Math.log2(i + 1));
    const p = i - (2 ** d - 1);
    return { x: ((p + 0.5) / 2 ** d) * W, y: 22 + d * LH };
  };

  return (
    <Frame
      title="Двоичная куча: дерево в массиве"
      hint="min-heap: родитель ≤ детей"
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="grid grid-cols-3 gap-2 sm:flex">
            <Button icon={<ArrowUpFromLine className="size-4" />} onClick={push} disabled={busy || s.a.length >= MAX}>
              push
            </Button>
            <Button icon={<ArrowDownToLine className="size-4" />} onClick={pop} disabled={busy || !s.a.length}>
              pop
            </Button>
            <Button icon={<Layers className="size-4" />} onClick={heapify} disabled={busy}>
              heapify
            </Button>
          </div>
          <StepControls onStep={() => setS(step(s))} onReset={() => { player.stop(); setS(init()); }} canStep={busy} player={player} />
        </div>
      }
    >
      <svg viewBox={`0 0 ${W} ${22 + (depth - 1) * LH + 26}`} className="block w-full">
        {s.a.map((_, i) => {
          if (i === 0) return null;
          const a = pos((i - 1) >> 1);
          const b = pos(i);
          const on = s.hl.includes(i) && s.hl.includes((i - 1) >> 1);
          return <line key={`e${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={on ? C.amber : C.lineStrong} strokeWidth={on ? 2.5 : 1.2} />;
        })}
        {s.a.map((v, i) => {
          const { x, y } = pos(i);
          const on = s.hl.includes(i);
          const fin = s.done === i;
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={18} fill={fin ? "color-mix(in oklab, var(--color-ok) 22%, var(--color-surface))" : on ? "color-mix(in oklab, var(--color-amber) 22%, var(--color-surface))" : C.raised} stroke={fin ? C.ok : on ? C.amber : i === 0 ? C.accent : C.lineStrong} strokeWidth={on || fin || i === 0 ? 2 : 1} />
              <text x={x} y={y + 5} textAnchor="middle" fontSize={14} fontWeight={600} fill={C.ink} fontFamily="var(--font-mono)">
                {v}
              </text>
              <text x={x + 21} y={y - 12} fontSize={9.5} fill={C.mute} fontFamily="var(--font-mono)">
                {i}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-2 grid gap-1" style={{ gridTemplateColumns: `repeat(${MAX}, minmax(0, 1fr))` }}>
        {Array.from({ length: MAX }, (_, i) => {
          const d = Math.floor(Math.log2(i + 1));
          const has = i < s.a.length;
          return (
            <div key={i} className="flex flex-col items-center gap-0.5">
              <div
                className={cx(
                  "flex h-8 w-full items-center justify-center rounded-md border font-mono text-[12px] sm:text-[13px]",
                  !has ? "border-dashed border-line text-transparent" : s.hl.includes(i) ? "border-amber bg-amber/15 text-ink" : "border-line-strong text-ink",
                )}
                style={has && !s.hl.includes(i) ? { background: `color-mix(in oklab, ${[C.accent, C.blue, C.violet, C.teal][d]} 12%, transparent)` } : undefined}
              >
                {has ? s.a[i] : "·"}
              </div>
              <span className="font-mono text-[9.5px] text-mute">{i}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-1.5 text-[12px] text-mute">Цвет ячейки = уровень дерева. Корень — [0], его дети — [1], [2], их дети — [3..6]. Указателей нет совсем.</div>
      <Log className="mt-3" lines={s.log} max={4} empty="push кладёт в конец и поднимает, pop забирает корень и опускает последний элемент. Каждый шаг — O(1), шагов не больше высоты — O(log n)." />
      {s.swaps > 0 && <div className="mt-1.5 text-[12px] text-mute">обменов в текущей операции: {s.swaps}</div>}
    </Frame>
  );
}
