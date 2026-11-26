import { Footprints, ListOrdered, Plus, Shuffle, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/Button";
import { Input, Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Log, Metric, Metrics, rng, usePlayer } from "./kit";

// BST и AVL: вставка, удаление (три случая), обходы. В AVL после каждой операции
// высоты поддеревьев отличаются не больше чем на 1 — иначе повороты.
interface N {
  k: number;
  l: N | null;
  r: N | null;
  h: number;
}
const h = (n: N | null) => (n ? n.h : 0);
const mk = (k: number, l: N | null, r: N | null): N => ({ k, l, r, h: 1 + Math.max(h(l), h(r)) });
const bal = (n: N) => h(n.l) - h(n.r);
const rotR = (n: N) => mk(n.l!.k, n.l!.l, mk(n.k, n.l!.r, n.r));
const rotL = (n: N) => mk(n.r!.k, mk(n.k, n.l, n.r!.l), n.r!.r);

function rebalance(n: N, log: string[]): N {
  const b = bal(n);
  if (b > 1) {
    if (bal(n.l!) < 0) {
      log.push(`узел ${n.k}: перекос влево-вправо → поворот влево у ${n.l!.k}, затем вправо у ${n.k}`);
      return rotR(mk(n.k, rotL(n.l!), n.r));
    }
    log.push(`узел ${n.k}: перекос влево (${h(n.l)} против ${h(n.r)}) → правый поворот`);
    return rotR(n);
  }
  if (b < -1) {
    if (bal(n.r!) > 0) {
      log.push(`узел ${n.k}: перекос вправо-влево → поворот вправо у ${n.r!.k}, затем влево у ${n.k}`);
      return rotL(mk(n.k, n.l, rotR(n.r!)));
    }
    log.push(`узел ${n.k}: перекос вправо (${h(n.r)} против ${h(n.l)}) → левый поворот`);
    return rotL(n);
  }
  return n;
}

function insert(n: N | null, k: number, avl: boolean, log: string[], path: number[]): N {
  if (!n) return mk(k, null, null);
  path.push(n.k);
  if (k === n.k) return n;
  const res = k < n.k ? mk(n.k, insert(n.l, k, avl, log, path), n.r) : mk(n.k, n.l, insert(n.r, k, avl, log, path));
  return avl ? rebalance(res, log) : res;
}

function minKey(n: N): number {
  return n.l ? minKey(n.l) : n.k;
}

function remove(n: N | null, k: number, avl: boolean, log: string[]): N | null {
  if (!n) return null;
  let res: N | null;
  if (k < n.k) res = mk(n.k, remove(n.l, k, avl, log), n.r);
  else if (k > n.k) res = mk(n.k, n.l, remove(n.r, k, avl, log));
  else if (!n.l || !n.r) {
    log.push(!n.l && !n.r ? `${k} — лист: просто убираем` : `у ${k} один ребёнок: ставим его на место ${k}`);
    return n.l ?? n.r;
  } else {
    const s = minKey(n.r);
    log.push(`у ${k} два ребёнка: заменяем на преемника ${s} (минимум правого поддерева), а преемника удаляем справа`);
    res = mk(s, n.l, remove(n.r, s, avl, []));
  }
  return avl && res ? rebalance(res, log) : res;
}

type Order = "in" | "pre" | "post" | "bfs";
function traverse(n: N | null, o: Order): number[] {
  if (!n) return [];
  if (o === "bfs") {
    const out: number[] = [];
    const q: N[] = [n];
    while (q.length) {
      const x = q.shift()!;
      out.push(x.k);
      if (x.l) q.push(x.l);
      if (x.r) q.push(x.r);
    }
    return out;
  }
  const L = traverse(n.l, o);
  const R = traverse(n.r, o);
  return o === "in" ? [...L, n.k, ...R] : o === "pre" ? [n.k, ...L, ...R] : [...L, ...R, n.k];
}

function layout(root: N | null) {
  const pos = new Map<number, { x: number; y: number }>();
  let i = 0;
  const walk = (n: N | null, d: number) => {
    if (!n) return;
    walk(n.l, d + 1);
    pos.set(n.k, { x: i++, y: d });
    walk(n.r, d + 1);
  };
  walk(root, 0);
  return { pos, count: i };
}

const START = [50, 30, 70, 20, 40, 60, 80, 35];
const build = (keys: number[], avl: boolean) => keys.reduce<N | null>((t, k) => insert(t, k, avl, [], []), null);

export function TreeViz() {
  const [avl, setAvl] = useState(false);
  const [root, setRoot] = useState<N | null>(() => build(START, false));
  const [log, setLog] = useState<string[]>([]);
  const [val, setVal] = useState("45");
  const [seed, setSeed] = useState(4);
  const [path, setPath] = useState<number[]>([]);
  const [order, setOrder] = useState<Order>("in");
  const [walk, setWalk] = useState<{ seq: number[]; i: number } | null>(null);

  const player = usePlayer(() => {
    if (!walk || walk.i >= walk.seq.length) return false;
    setWalk({ ...walk, i: walk.i + 1 });
    return walk.i + 1 < walk.seq.length;
  }, 480);

  const doInsert = (k: number, label?: string) => {
    const l: string[] = [];
    const p: number[] = [];
    const next = insert(root, k, avl, l, p);
    setRoot(next);
    setPath([...p, k]);
    setWalk(null);
    setLog((x) => [...x, label ?? `insert ${k}: путь ${[...p, k].join(" → ")}${l.length ? "" : ""}`, ...l]);
  };
  const L = layout(root);
  const W = Math.max(1, L.count) * 46;
  const height = h(root);
  const ideal = Math.ceil(Math.log2(L.count + 1));
  const visited = walk ? walk.seq.slice(0, walk.i) : [];
  const current = walk && walk.i > 0 ? walk.seq[walk.i - 1] : null;

  const edges: [number, number][] = [];
  const collect = (n: N | null) => {
    if (!n) return;
    if (n.l) edges.push([n.k, n.l.k]);
    if (n.r) edges.push([n.k, n.r.k]);
    collect(n.l);
    collect(n.r);
  };
  collect(root);
  const P = (k: number) => {
    const p = L.pos.get(k)!;
    return { x: p.x * 46 + 23, y: p.y * 56 + 22 };
  };

  return (
    <Frame
      title={avl ? "AVL-дерево" : "Двоичное дерево поиска"}
      hint="слева меньше, справа больше"
      controls={
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_auto_auto] gap-2 sm:flex">
            <Input value={val} onChange={(e) => setVal(e.target.value.replace(/\D/g, "").slice(0, 2))} inputMode="numeric" className="h-10 sm:w-20" aria-label="Ключ" />
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => val && doInsert(+val)}>
              insert
            </Button>
            <Button
              icon={<Trash2 className="size-4" />}
              onClick={() => {
                const l: string[] = [];
                setRoot(remove(root, +val, avl, l));
                setPath([]);
                setWalk(null);
                setLog((x) => [...x, `delete ${val}`, ...(l.length ? l : ["такого ключа нет"])]);
              }}
            >
              delete
            </Button>
            <Button
              icon={<Shuffle className="size-4" />}
              className="col-span-3 sm:col-span-1"
              onClick={() => {
                const r = rng(seed);
                let k = 1 + Math.floor(r() * 98);
                while (L.pos.has(k)) k = 1 + Math.floor(r() * 98);
                setSeed(seed + 1);
                doInsert(k);
              }}
            >
              случайный
            </Button>
            <Button
              icon={<ListOrdered className="size-4" />}
              className="col-span-3 sm:col-span-1"
              onClick={() => {
                const l: string[] = [];
                const t = [10, 20, 30, 40, 50, 60, 70].reduce<N | null>((acc, k) => insert(acc, k, avl, l, []), null);
                setRoot(t);
                setPath([]);
                setWalk(null);
                setLog([`вставили 10, 20, …, 70 по возрастанию${avl ? "" : " — BST выродился в список"}`, ...l]);
              }}
            >
              10…70 по порядку
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
            <Segmented<Order>
              value={order}
              onChange={(o) => {
                setOrder(o);
                setWalk(null);
                player.stop();
              }}
              block
              options={[
                { value: "in", label: "in-order" },
                { value: "pre", label: "pre" },
                { value: "post", label: "post" },
                { value: "bfs", label: "BFS" },
              ]}
            />
            <Button
              icon={<Footprints className="size-4" />}
              onClick={() => {
                setWalk({ seq: traverse(root, order), i: 0 });
                setPath([]);
                if (!player.playing) player.toggle();
              }}
            >
              Обойти
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Toggle
              checked={avl}
              onChange={(v) => {
                setAvl(v);
                setRoot(build(START, v));
                setLog([v ? "AVL: те же ключи, но с балансировкой" : "обычный BST"]);
                setPath([]);
                setWalk(null);
              }}
              label="Балансировать (AVL)"
            />
            <Button size="sm" variant="ghost" onClick={() => { setRoot(build(START, avl)); setLog([]); setPath([]); setWalk(null); }}>
              Сначала
            </Button>
          </div>
        </div>
      }
    >
      <Metrics>
        <Metric label="узлов" value={L.count} />
        <Metric label="высота" value={height} tone={height > ideal + 1 ? "bad" : "ok"} />
        <Metric label="минимум возможной" value={ideal} />
        <Metric label="поиск, сравнений" value={`≤ ${height}`} />
      </Metrics>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${Math.max(1, height) * 56 + 4}`} className="mx-auto block" style={{ width: Math.min(100, (W / 560) * 100) + "%", minWidth: Math.min(W, 320) }}>
          {edges.map(([a, b]) => {
            const pa = P(a);
            const pb = P(b);
            const on = path.includes(a) && path.includes(b);
            return <line key={`${a}-${b}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} stroke={on ? C.accent : C.lineStrong} strokeWidth={on ? 2.2 : 1.2} />;
          })}
          {[...L.pos.keys()].map((k) => {
            const p = P(k);
            const isCur = current === k;
            const seen = visited.includes(k);
            const onPath = path.includes(k);
            return (
              <g key={k}>
                <circle cx={p.x} cy={p.y} r={17} fill={isCur ? "color-mix(in oklab, var(--color-amber) 30%, var(--color-surface))" : seen ? "color-mix(in oklab, var(--color-blue) 18%, var(--color-surface))" : C.raised} stroke={isCur ? C.amber : onPath ? C.accent : seen ? C.blue : C.lineStrong} strokeWidth={isCur || onPath ? 2 : 1} />
                <text x={p.x} y={p.y + 4.5} textAnchor="middle" fontSize={13} fontWeight={600} fill={C.ink} fontFamily="var(--font-mono)">
                  {k}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      {walk && (
        <div className="mt-3 flex flex-wrap gap-1">
          {walk.seq.map((k, i) => (
            <span key={i} className={cx("rounded-md border px-1.5 py-0.5 font-mono text-[12px]", i < walk.i ? (i === walk.i - 1 ? "border-amber bg-amber/15 text-ink" : "border-blue/40 text-ink") : "border-line text-mute")}>
              {i < walk.i ? k : "·"}
            </span>
          ))}
        </div>
      )}
      <Log className="mt-3" lines={log} max={4} empty="Вставь ключ — путь сравнений подсветится. Потом попробуй «10…70 по порядку» с AVL и без." />
    </Frame>
  );
}
