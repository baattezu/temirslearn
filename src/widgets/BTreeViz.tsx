import { ListOrdered, Plus, Search, Shuffle } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { Frame } from "./Frame";
import { C, Legend, Log, Metric, Metrics, rng, useHistory } from "./kit";

// B+-дерево как в nbtree: ключи только растут вверх копией разделителя, данные (ctid) — в листьях,
// листья связаны в список для диапазонных сканов. M — максимум ключей в узле (в реальности ~300+).

interface Node {
  id: number;
  leaf: boolean;
  keys: number[];
  kids: number[];
}
interface Tree {
  nodes: Record<number, Node>;
  root: number;
  next: number;
  m: number;
  log: string[];
  seed: number;
}

function empty(m: number): Tree {
  return { nodes: { 0: { id: 0, leaf: true, keys: [], kids: [] } }, root: 0, next: 1, m, log: [], seed: 5 };
}

function insert(t0: Tree, key: number, quiet = false): Tree {
  const t: Tree = structuredClone(t0);
  const path: number[] = [];
  let n = t.nodes[t.root];
  while (!n.leaf) {
    path.push(n.id);
    let i = 0;
    while (i < n.keys.length && key >= n.keys[i]) i++;
    n = t.nodes[n.kids[i]];
  }
  if (n.keys.includes(key)) {
    if (!quiet) t.log.push(`${key} уже есть`);
    return t;
  }
  n.keys.push(key);
  n.keys.sort((a, b) => a - b);
  const splits: string[] = [];
  let cur = n;
  while (cur.keys.length > t.m) {
    const right: Node = { id: t.next++, leaf: cur.leaf, keys: [], kids: [] };
    let up: number;
    if (cur.leaf) {
      const cut = Math.ceil(cur.keys.length / 2);
      right.keys = cur.keys.slice(cut);
      cur.keys = cur.keys.slice(0, cut);
      up = right.keys[0]; // копия наверх — сам ключ остаётся в листе
      splits.push(`лист [${cur.keys.join(" ")}|${right.keys.join(" ")}], наверх ↑${up}`);
    } else {
      const mid = Math.floor(cur.keys.length / 2);
      up = cur.keys[mid]; // во внутреннем узле разделитель уходит наверх
      right.keys = cur.keys.slice(mid + 1);
      right.kids = cur.kids.slice(mid + 1);
      cur.keys = cur.keys.slice(0, mid);
      cur.kids = cur.kids.slice(0, mid + 1);
      splits.push(`внутренний узел, наверх ↑${up}`);
    }
    t.nodes[right.id] = right;
    const pid = path.pop();
    if (pid === undefined) {
      const root: Node = { id: t.next++, leaf: false, keys: [up], kids: [cur.id, right.id] };
      t.nodes[root.id] = root;
      t.root = root.id;
      splits.push("новый корень — дерево выросло на уровень");
      break;
    }
    const p = t.nodes[pid];
    const at = p.kids.indexOf(cur.id);
    p.keys.splice(at, 0, up);
    p.kids.splice(at + 1, 0, right.id);
    cur = p;
  }
  if (!quiet) t.log.push(`INSERT ${key}${splits.length ? ": " + splits.join("; ") : ""}`);
  return t;
}

function searchPath(t: Tree, key: number) {
  const path: number[] = [];
  let n = t.nodes[t.root];
  for (;;) {
    path.push(n.id);
    if (n.leaf) return { path, leaf: n, found: n.keys.includes(key) };
    let i = 0;
    while (i < n.keys.length && key >= n.keys[i]) i++;
    n = t.nodes[n.kids[i]];
  }
}

function leavesInOrder(t: Tree): Node[] {
  const out: Node[] = [];
  const walk = (id: number) => {
    const n = t.nodes[id];
    if (n.leaf) out.push(n);
    else n.kids.forEach(walk);
  };
  walk(t.root);
  return out;
}

function levels(t: Tree): Node[][] {
  const out: Node[][] = [];
  let row = [t.nodes[t.root]];
  while (row.length) {
    out.push(row);
    row = row.flatMap((n) => n.kids.map((k) => t.nodes[k]));
  }
  return out;
}

const CELL = 26;
const PADX = 6;
const NODE_H = 28;
const GAP_X = 14;
const LEVEL_H = 70;

function layout(t: Tree) {
  const lv = levels(t);
  const pos: Record<number, { x: number; y: number; w: number }> = {};
  const width = (n: Node) => Math.max(1, n.keys.length) * CELL + PADX * 2;
  const leaves = lv[lv.length - 1];
  let x = 0;
  for (const n of leaves) {
    pos[n.id] = { x, y: (lv.length - 1) * LEVEL_H, w: width(n) };
    x += width(n) + GAP_X;
  }
  for (let d = lv.length - 2; d >= 0; d--) {
    for (const n of lv[d]) {
      const first = pos[n.kids[0]];
      const last = pos[n.kids[n.kids.length - 1]];
      const w = width(n);
      pos[n.id] = { x: (first.x + last.x + last.w) / 2 - w / 2, y: d * LEVEL_H, w };
    }
  }
  const minX = Math.min(...Object.values(pos).map((p) => p.x));
  for (const p of Object.values(pos)) p.x -= minX;
  const W = Math.max(...Object.values(pos).map((p) => p.x + p.w));
  return { pos, W, H: lv.length * LEVEL_H - (LEVEL_H - NODE_H), lv };
}

export function BTreeViz() {
  const make = useCallback(() => [12, 30, 5, 41, 18, 7, 25, 36, 3, 50, 22, 9].reduce((t, k) => insert(t, k, true), empty(3)), []);
  const { cur: t, push, reset } = useHistory(make);
  const [val, setVal] = useState("27");
  const [hl, setHl] = useState<{ path: number[]; leaves: number[]; keys: number[]; text: string } | null>(null);

  const L = layout(t);
  const total = Object.values(t.nodes).filter((n) => n.leaf).reduce((a, n) => a + n.keys.length, 0);
  const leafCount = L.lv[L.lv.length - 1].length;
  const num = Number(val);

  const doInsert = (k: number) => {
    setHl(null);
    push(insert(t, k));
  };
  const doSearch = () => {
    const r = searchPath(t, num);
    setHl({ path: r.path, leaves: [], keys: r.found ? [num] : [], text: `поиск ${num}: ${r.path.length} страниц(ы) прочитано — ${r.found ? "найден в листе" : "в листе нет"}` });
  };
  const doRange = () => {
    const lo = num;
    const hi = num + 15;
    const r = searchPath(t, lo);
    const leaves = leavesInOrder(t);
    const start = leaves.findIndex((l) => l.id === r.leaf.id);
    const visited: number[] = [];
    const keys: number[] = [];
    for (let i = start; i < leaves.length; i++) {
      visited.push(leaves[i].id);
      keys.push(...leaves[i].keys.filter((k) => k >= lo && k <= hi));
      if (leaves[i].keys.some((k) => k > hi)) break;
    }
    setHl({
      path: r.path,
      leaves: visited,
      keys,
      text: `BETWEEN ${lo} AND ${hi}: спуск ${r.path.length} страниц(ы) + ${visited.length - 1} по цепочке листьев → ${keys.length} ключей, в порядке сортировки`,
    });
  };

  const isPath = (id: number) => hl?.path.includes(id);
  const isLeafScan = (id: number) => hl?.leaves.includes(id);

  return (
    <Frame
      title="B+-дерево: вставка, поиск, диапазон"
      hint={`до ${t.m} ключей в узле`}
      controls={
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_auto] gap-2 sm:flex">
            <Input value={val} onChange={(e) => setVal(e.target.value.replace(/[^\d]/g, "").slice(0, 3))} inputMode="numeric" className="h-10 sm:w-24" aria-label="Ключ" />
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => val && doInsert(num)}>
              Вставить
            </Button>
            <Button icon={<Search className="size-4" />} onClick={doSearch} className="col-span-1">
              Найти
            </Button>
            <Button icon={<ListOrdered className="size-4" />} onClick={doRange}>
              {val || 0}…{num + 15}
            </Button>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button
              icon={<Shuffle className="size-4" />}
              onClick={() => {
                const r = rng(t.seed);
                let k = 1 + Math.floor(r() * 99);
                for (let g = 0; g < 50 && searchPath(t, k).found; g++) k = 1 + Math.floor(r() * 99);
                setHl(null);
                push({ ...insert(t, k), seed: t.seed + 1 });
              }}
            >
              Случайный
            </Button>
            <Button
              onClick={() => {
                setHl(null);
                const max = Math.max(0, ...Object.values(t.nodes).flatMap((n) => n.keys));
                push(() => {
                  let x = t;
                  for (let i = 1; i <= 6; i++) x = insert(x, max + i, true);
                  return { ...x, log: [...t.log, `INSERT ${max + 1}…${max + 6} подряд — растёт только правый край`] };
                });
              }}
            >
              +6 по возрастанию
            </Button>
            <Segmented
              value={t.m}
              onChange={(m) => {
                setHl(null);
                const keys = Object.values(t.nodes).filter((n) => n.leaf).flatMap((n) => n.keys);
                reset({ ...keys.reduce((acc, k) => insert(acc, k, true), empty(m)), log: [`перестроено с M = ${m}`] });
              }}
              options={[3, 4, 6].map((m) => ({ value: m, label: `M=${m}` }))}
              className="col-span-2 sm:col-span-1"
              block
            />
            <Button onClick={() => { setHl(null); reset(); }} className="col-span-2 sm:col-span-1">Сначала</Button>
          </div>
        </div>
      }
    >
      <Metrics>
        <Metric label="высота" value={L.lv.length} tone="accent" />
        <Metric label="ключей" value={total} />
        <Metric label="листьев" value={leafCount} />
        <Metric label="заполнение листьев" value={`${Math.round((total / (leafCount * t.m)) * 100)}%`} />
      </Metrics>

      <div className="mt-4 overflow-x-auto pb-2">
        <svg viewBox={`-4 -4 ${L.W + 8} ${L.H + 8}`} style={{ minWidth: Math.min(L.W, 900) * 0.72 }} className="mx-auto block w-full max-w-full" role="img" aria-label="B+-дерево">
          {/* рёбра */}
          {Object.values(t.nodes)
            .filter((n) => !n.leaf)
            .flatMap((n) =>
              n.kids.map((k, i) => {
                const a = L.pos[n.id];
                const b = L.pos[k];
                const on = isPath(n.id) && isPath(k);
                const x1 = a.x + PADX + i * CELL;
                return <line key={`${n.id}-${k}`} x1={x1} y1={a.y + NODE_H} x2={b.x + b.w / 2} y2={b.y} stroke={on ? C.accent : C.lineStrong} strokeWidth={on ? 2 : 1} />;
              }),
            )}
          {/* связный список листьев */}
          {leavesInOrder(t).map((l, i, arr) => {
            if (i === arr.length - 1) return null;
            const a = L.pos[l.id];
            const b = L.pos[arr[i + 1].id];
            const on = isLeafScan(l.id) && isLeafScan(arr[i + 1].id);
            return (
              <line key={`ll${l.id}`} x1={a.x + a.w} y1={a.y + NODE_H / 2} x2={b.x} y2={b.y + NODE_H / 2} stroke={on ? C.blue : C.line} strokeWidth={on ? 2.2 : 1.2} markerEnd="url(#bt-arrow)" />
            );
          })}
          <defs>
            <marker id="bt-arrow" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="5" markerHeight="5" orient="auto">
              <path d="M0 0 L6 3 L0 6 z" fill={C.lineStrong} />
            </marker>
          </defs>
          {Object.values(t.nodes).map((n) => {
            const p = L.pos[n.id];
            if (!p) return null;
            const on = isPath(n.id);
            const scan = isLeafScan(n.id);
            return (
              <g key={n.id} transform={`translate(${p.x} ${p.y})`}>
                <rect width={p.w} height={NODE_H} rx={6} fill={n.leaf ? C.raised : C.surface} stroke={on ? C.accent : scan ? C.blue : C.lineStrong} strokeWidth={on || scan ? 2 : 1} />
                {n.keys.map((k, i) => {
                  const hit = hl?.keys.includes(k) && n.leaf;
                  return (
                    <g key={i}>
                      {i > 0 && <line x1={PADX + i * CELL} x2={PADX + i * CELL} y1={5} y2={NODE_H - 5} stroke={C.line} />}
                      <text
                        x={PADX + i * CELL + CELL / 2}
                        y={NODE_H / 2 + 4.5}
                        textAnchor="middle"
                        fontSize={12.5}
                        fontFamily="var(--font-mono)"
                        fontWeight={hit ? 700 : 500}
                        fill={hit ? C.accent : n.leaf ? C.ink : C.dim}
                      >
                        {k}
                      </text>
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>
      <Legend
        className="mt-1"
        items={[
          { color: C.surface, label: "внутренний узел: только разделители" },
          { color: C.raised, label: "лист: ключи + ctid строк" },
          { color: C.accent, label: "путь поиска" },
          { color: C.blue, label: "проход по листьям" },
        ]}
      />
      <Log className="mt-3" lines={hl ? [...t.log, hl.text] : t.log} max={3} empty="Вставь ключ — смотри, как узлы делятся и дерево растёт вверх." />
    </Frame>
  );
}

/** Калькулятор высоты: сколько страниц прочитает поиск по индексу. */
export function BTreeHeight() {
  const [rowsExp, setRowsExp] = useState(8);
  const [keyBytes, setKeyBytes] = useState(8);
  const rows = 10 ** rowsExp;
  // элемент индекса: 8 Б IndexTupleData + ключ, выровнено до 8, + 4 Б line pointer; лист заполнен на 90% (fillfactor)
  const item = Math.ceil((8 + keyBytes) / 8) * 8 + 4;
  const usable = 8192 - 24 - 16;
  const leafCap = Math.floor((usable * 0.9) / item);
  const fanout = Math.floor((usable * 0.7) / item); // внутренние страницы после сплитов заполнены меньше
  const leaves = Math.ceil(rows / leafCap);
  const height = 1 + (leaves <= 1 ? 0 : Math.ceil(Math.log(leaves) / Math.log(fanout)));
  const sizeGb = (leaves * 8192) / 1024 ** 3;
  return (
    <Frame title="Сколько уровней у настоящего индекса" hint="страница 8 КБ">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <div className="mb-1 flex justify-between text-[13px]">
            <span className="text-dim">Строк</span>
            <span className="font-mono text-ink">{rows >= 1e9 ? `${(rows / 1e9).toFixed(rows >= 1e10 ? 0 : 1)} млрд` : rows >= 1e6 ? `${Math.round(rows / 1e6)} млн` : `${Math.round(rows / 1e3)} тыс`}</span>
          </div>
          <input type="range" className="h-6 w-full" min={3} max={10} step={0.5} value={rowsExp} onChange={(e) => setRowsExp(+e.target.value)} />
        </label>
        <div>
          <div className="mb-1 text-[13px] text-dim">Ключ</div>
          <Segmented
            value={keyBytes}
            onChange={setKeyBytes}
            block
            options={[
              { value: 4, label: "int" },
              { value: 8, label: "bigint" },
              { value: 16, label: "uuid" },
              { value: 40, label: "text ~40" },
            ]}
          />
        </div>
      </div>
      <Metrics className="mt-4">
        <Metric label="ключей в листе" value={leafCap} />
        <Metric label="fanout" value={fanout} />
        <Metric label="высота" value={height} tone="accent" />
        <Metric label="размер индекса" value={sizeGb >= 1 ? `${sizeGb.toFixed(1)} ГБ` : `${Math.round(sizeGb * 1024)} МБ`} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Поиск одной строки = <b className="text-ink">{height}</b> страниц индекса + 1 страница кучи. Верхние уровни почти всегда в shared_buffers, поэтому реальный ввод-вывод — это лист и куча.
      </p>
    </Frame>
  );
}

/** Составной индекс: какие условия дают один непрерывный диапазон. */
const ENTRIES = (() => {
  const cities = ["Almaty", "Astana", "Shymkent"];
  const r = rng(21);
  const out: { city: string; age: number }[] = [];
  for (const c of cities) for (let i = 0; i < 8; i++) out.push({ city: c, age: 18 + Math.floor(r() * 45) });
  return out.sort((a, b) => a.city.localeCompare(b.city) || a.age - b.age);
})();

const QUERIES = [
  { id: "eq", label: "city = 'Astana'", match: (e: { city: string; age: number }) => e.city === "Astana" },
  { id: "eqrange", label: "city = 'Astana' AND age > 40", match: (e: { city: string; age: number }) => e.city === "Astana" && e.age > 40 },
  { id: "range", label: "age > 40", match: (e: { city: string; age: number }) => e.age > 40 },
  { id: "rangecity", label: "city > 'Almaty' AND age = 30", match: (e: { city: string; age: number }) => e.city > "Almaty" && e.age === 30 },
];

export function CompositeIndex() {
  const [q, setQ] = useState("eqrange");
  const query = QUERIES.find((x) => x.id === q)!;
  const hits = ENTRIES.map(query.match);
  const first = hits.indexOf(true);
  const last = hits.lastIndexOf(true);
  const contiguous = first >= 0 && hits.slice(first, last + 1).every(Boolean);
  // что реально придётся прочитать: от первого до последнего подходящего (если префикс задан), иначе весь индекс
  const prefixFixed = q === "eq" || q === "eqrange";
  const scanFrom = prefixFixed ? first : q === "rangecity" ? ENTRIES.findIndex((e) => e.city > "Almaty") : 0;
  const scanTo = prefixFixed ? last : ENTRIES.length - 1;
  const scanned = scanTo - scanFrom + 1;
  return (
    <Frame title="Индекс (city, age): порядок колонок" hint="записи индекса в порядке сортировки">
      <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
        {QUERIES.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setQ(x.id)}
            className={`shrink-0 rounded-full border px-3 py-1.5 font-mono text-[12px] transition ${x.id === q ? "border-accent/60 bg-accent/12 text-accent" : "border-line text-dim hover:text-ink"}`}
          >
            {x.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-12">
        {ENTRIES.map((e, i) => {
          const inScan = i >= scanFrom && i <= scanTo;
          return (
            <div
              key={i}
              className="rounded-md border px-1 py-1 text-center font-mono text-[10.5px] leading-tight"
              style={{
                borderColor: hits[i] ? C.accent : inScan ? "color-mix(in oklab, var(--color-amber) 55%, transparent)" : C.line,
                background: hits[i] ? "color-mix(in oklab, var(--color-accent) 14%, transparent)" : inScan ? "color-mix(in oklab, var(--color-amber) 7%, transparent)" : "transparent",
                color: hits[i] ? C.ink : C.mute,
              }}
            >
              <div>{e.city.slice(0, 3)}</div>
              <div className="text-[11.5px]">{e.age}</div>
            </div>
          );
        })}
      </div>
      <Legend className="mt-3" items={[{ color: C.accent, label: "подходит под условие" }, { color: C.amber, label: "придётся прочитать" }]} />
      <div className="mt-3 rounded-xl border border-line bg-bg/40 p-3 text-[13.5px] leading-relaxed text-dim">
        {contiguous && prefixFixed ? (
          <>
            <b className="text-ok">Один непрерывный диапазон.</b> Спуск по дереву к первой подходящей записи и проход по листьям до последней — прочитано {scanned} из {ENTRIES.length}.
          </>
        ) : q === "range" ? (
          <>
            <b className="text-bad">Ведущая колонка не задана.</b> Записи с age &gt; 40 разбросаны по всем городам — индекс по (city, age) не даёт диапазона. Придётся читать весь индекс (или Seq Scan). Нужен индекс по (age) или (age, city).
          </>
        ) : (
          <>
            <b className="text-amber">Диапазон по ведущей колонке.</b> city &gt; &apos;Almaty&apos; ограничивает начало, но внутри него age = 30 уже не диапазон — прочитано {scanned} записей, подходят {hits.filter(Boolean).length}. Равенство ставь в индексе первым, диапазон — последним.
          </>
        )}
      </div>
    </Frame>
  );
}
