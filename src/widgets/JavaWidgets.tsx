import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { Chip } from "../ui/Chip";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Legend, Log, Metric, Metrics, rng, StepControls, usePlayer } from "./kit";

// ── Раскладка объекта в HotSpot (64 бит) ─────────────────────
// Заголовок: mark word 8 Б + указатель на класс 4 Б (compressed class pointers) или 8 Б.
// Массив — ещё 4 Б длины. Поля раскладываются по размеру с заполнением дыр, объект выравнивается до 8 Б.

interface Field {
  name: string;
  type: "long" | "double" | "int" | "float" | "short" | "char" | "byte" | "boolean" | "ref";
}
const PRIM: Record<string, number> = { long: 8, double: 8, int: 4, float: 4, short: 2, char: 2, byte: 1, boolean: 1 };

interface Shape {
  id: string;
  label: string;
  fields?: Field[];
  array?: { elem: Field["type"]; len: number };
  note: string;
}
const SHAPES: Shape[] = [
  { id: "object", label: "new Object()", fields: [], note: "Пустой объект — уже 16 байт: 12 заголовка + 4 выравнивания." },
  { id: "integer", label: "Integer", fields: [{ name: "value", type: "int" }], note: "Обёртка над 4-байтным int весит 16 байт. Плюс 4–8 байт ссылки на неё." },
  { id: "long", label: "Long", fields: [{ name: "value", type: "long" }], note: "long не влезает в дыру после 12-байтного заголовка — выравнивание до 16, итого 24." },
  { id: "point", label: "Point(int x, int y)", fields: [{ name: "x", type: "int" }, { name: "y", type: "int" }], note: "Первое int заполнило дыру после заголовка." },
  {
    id: "user",
    label: "User",
    fields: [
      { name: "active", type: "boolean" },
      { name: "id", type: "long" },
      { name: "name", type: "ref" },
      { name: "age", type: "int" },
      { name: "flag", type: "byte" },
      { name: "score", type: "double" },
    ],
    note: "JVM сама переставляет поля (крупные сначала, мелкие — в дыры). Порядок в исходнике не важен — в отличие от C и Postgres.",
  },
  { id: "intarr", label: "int[10]", array: { elem: "int", len: 10 }, note: "Массив примитивов: заголовок 16 (с длиной) + данные подряд. 10 int = 56 байт." },
  { id: "integerarr", label: "Integer[10]", array: { elem: "ref", len: 10 }, note: "Массив ссылок: 56 байт сам массив + 10 отдельных Integer по 16 = ещё 160 байт, разбросанных по куче." },
];

interface Slot {
  off: number;
  size: number;
  label: string;
  kind: "mark" | "klass" | "len" | "field" | "ref" | "pad" | "elem";
}

function layout(shape: Shape, compressed: boolean) {
  const ref = compressed ? 4 : 8;
  const klass = compressed ? 4 : 8;
  const slots: Slot[] = [
    { off: 0, size: 8, label: "mark word", kind: "mark" },
    { off: 8, size: klass, label: "klass", kind: "klass" },
  ];
  let off = 8 + klass;
  if (shape.array) {
    slots.push({ off, size: 4, label: "length", kind: "len" });
    off += 4;
    const es = shape.array.elem === "ref" ? ref : PRIM[shape.array.elem];
    const start = Math.ceil(off / Math.min(8, es)) * Math.min(8, es);
    if (start > off) slots.push({ off, size: start - off, label: "", kind: "pad" });
    off = start;
    for (let i = 0; i < shape.array.len; i++) {
      slots.push({ off, size: es, label: `[${i}]`, kind: shape.array.elem === "ref" ? "ref" : "elem" });
      off += es;
    }
  } else {
    const fs = (shape.fields ?? []).map((f) => ({ ...f, size: f.type === "ref" ? ref : PRIM[f.type] }));
    const left = [...fs];
    // заполнить дыру до 8-байтной границы полями, которые в неё влезают
    const fill = () => {
      while (off % 8 !== 0) {
        const room = 8 - (off % 8);
        // самое крупное поле, которое влезает в дыру
        let i = -1;
        left.forEach((f, k) => {
          if (f.size <= room && off % f.size === 0 && (i < 0 || f.size > left[i].size)) i = k;
        });
        if (i < 0) break;
        const f = left.splice(i, 1)[0];
        slots.push({ off, size: f.size, label: f.name, kind: f.type === "ref" ? "ref" : "field" });
        off += f.size;
      }
    };
    fill();
    left.sort((a, b) => b.size - a.size);
    for (const f of left) {
      const a = Math.ceil(off / f.size) * f.size;
      if (a > off) slots.push({ off, size: a - off, label: "", kind: "pad" });
      off = a;
      slots.push({ off, size: f.size, label: f.name, kind: f.type === "ref" ? "ref" : "field" });
      off += f.size;
    }
  }
  const total = Math.ceil(off / 8) * 8;
  if (total > off) slots.push({ off, size: total - off, label: "", kind: "pad" });
  return { slots, total };
}

const KIND_COLOR: Record<Slot["kind"], string> = {
  mark: C.violet,
  klass: C.blue,
  len: C.teal,
  field: C.accent,
  elem: C.accent,
  ref: C.amber,
  pad: C.bad,
};

export function ObjectLayout() {
  const [id, setId] = useState("user");
  const [compressed, setCompressed] = useState(true);
  const shape = SHAPES.find((s) => s.id === id)!;
  const L = layout(shape, compressed);
  const pad = L.slots.filter((s) => s.kind === "pad").reduce((a, s) => a + s.size, 0);
  const header = L.slots.filter((s) => s.kind === "mark" || s.kind === "klass" || s.kind === "len").reduce((a, s) => a + s.size, 0);
  const payload = L.total - header - pad;
  const extra = shape.id === "integerarr" ? 10 * 16 : 0;

  return (
    <Frame
      title="Сколько весит объект в HotSpot"
      hint="64-битная JVM"
      controls={
        <div className="grid gap-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
            {SHAPES.map((s) => (
              <Chip key={s.id} active={s.id === id} onClick={() => setId(s.id)} className="font-mono text-[12px]">
                {s.label}
              </Chip>
            ))}
          </div>
          <Toggle checked={compressed} onChange={setCompressed} label="Compressed oops (по умолчанию при heap < 32 ГБ)" />
        </div>
      }
    >
      <Metrics>
        <Metric label="размер объекта" value={`${L.total} Б`} tone="accent" />
        <Metric label="заголовок" value={`${header} Б`} />
        <Metric label="полезные данные" value={`${payload} Б`} tone="ok" />
        <Metric label="выравнивание" value={`${pad} Б`} tone={pad ? "bad" : undefined} />
      </Metrics>
      <div className="mt-4 grid gap-[3px]" style={{ gridTemplateColumns: "repeat(8, minmax(0, 1fr))" }}>
        {L.slots.flatMap((s) =>
          Array.from({ length: s.size }, (_, b) => {
            const color = KIND_COLOR[s.kind];
            return (
              <div
                key={`${s.off}-${b}`}
                title={`${s.label || "padding"} (${s.size} Б)`}
                className="relative h-7 rounded-[4px]"
                style={
                  s.kind === "pad"
                    ? { background: `repeating-linear-gradient(135deg, ${color} 0 1.5px, transparent 1.5px 4px)`, border: `1px solid color-mix(in oklab, ${color} 50%, transparent)` }
                    : { background: `color-mix(in oklab, ${color} ${b === 0 ? 70 : 45}%, var(--color-surface))` }
                }
              >
                {b === 0 && s.label && <span className="absolute left-1 top-0 truncate font-mono text-[9.5px] font-semibold leading-7 text-bg" style={{ maxWidth: `${s.size * 100}%` }}>{s.label}</span>}
              </div>
            );
          }),
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-mute">
        <span>смещение 0</span>
        <span>8 байт в ряд</span>
      </div>
      <Legend
        className="mt-3"
        items={[
          { color: C.violet, label: "mark word: hash, возраст GC, блокировка" },
          { color: C.blue, label: "указатель на класс" },
          { color: C.teal, label: "длина массива" },
          { color: C.accent, label: "примитивы" },
          { color: C.amber, label: "ссылки" },
          { color: C.bad, label: "выравнивание", hatch: true },
        ]}
      />
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {shape.note}
        {extra > 0 && (
          <>
            {" "}
            Итого <b className="font-mono text-ink">{L.total + extra} Б</b> против 56 у <code className="font-mono text-ink">int[10]</code>.
          </>
        )}
      </p>
    </Frame>
  );
}

// ── Стек и куча по шагам ─────────────────────────────────────

interface Obj {
  id: number;
  cls: string;
  fields: [string, string][];
}
interface Snap {
  line: number;
  frames: { name: string; locals: [string, string][] }[];
  heap: Obj[];
  note: string;
}

const CODE = [
  "void main() {",
  "  int n = 3;",
  "  Point p = new Point(1, 2);",
  "  var list = new ArrayList<Point>();",
  "  list.add(p);",
  "  int s = sum(list, n);",
  "  p = null;",
  "  list = null;",
  "}",
  "int sum(List<Point> l, int k) {",
  "  int acc = 0;",
  "  for (Point q : l) acc += q.x * k;",
  "  return acc;",
  "}",
];

const P: Obj = { id: 1, cls: "Point", fields: [["x", "1"], ["y", "2"]] };
const AL = (size: number): Obj => ({ id: 2, cls: "ArrayList", fields: [["size", String(size)], ["elementData", "→ #3"]] });
const ARR = (filled: boolean): Obj => ({ id: 3, cls: "Object[10]", fields: [["[0]", filled ? "→ #1" : "null"], ["[1..9]", "null"]] });
const IT: Obj = { id: 4, cls: "ArrayList$Itr", fields: [["cursor", "1"]] };

const SNAPS: Snap[] = [
  { line: 0, frames: [{ name: "main", locals: [] }], heap: [], note: "Вызов метода = новый кадр (frame) на стеке потока. В нём — локальные переменные и операнды." },
  { line: 1, frames: [{ name: "main", locals: [["n", "3"]] }], heap: [], note: "Примитив лежит прямо в кадре стека. Никакой кучи." },
  { line: 2, frames: [{ name: "main", locals: [["n", "3"], ["p", "→ #1"]] }], heap: [P], note: "new — объект в куче. В кадре только ссылка (4 Б при compressed oops)." },
  { line: 3, frames: [{ name: "main", locals: [["n", "3"], ["p", "→ #1"], ["list", "→ #2"]] }], heap: [P, AL(0), ARR(false)], note: "ArrayList — это два объекта: сам список и массив elementData." },
  { line: 4, frames: [{ name: "main", locals: [["n", "3"], ["p", "→ #1"], ["list", "→ #2"]] }], heap: [P, AL(1), ARR(true)], note: "add кладёт в массив ссылку, а не копию Point. На #1 теперь две ссылки." },
  {
    line: 10,
    frames: [
      { name: "main", locals: [["n", "3"], ["p", "→ #1"], ["list", "→ #2"]] },
      { name: "sum", locals: [["l", "→ #2"], ["k", "3"], ["acc", "0"]] },
    ],
    heap: [P, AL(1), ARR(true)],
    note: "Новый кадр sum поверх main. Аргументы передаются по значению: k — копия числа, l — копия ссылки на тот же список.",
  },
  {
    line: 11,
    frames: [
      { name: "main", locals: [["n", "3"], ["p", "→ #1"], ["list", "→ #2"]] },
      { name: "sum", locals: [["l", "→ #2"], ["k", "3"], ["acc", "3"], ["it", "→ #4"], ["q", "→ #1"]] },
    ],
    heap: [P, AL(1), ARR(true), IT],
    note: "for-each создаёт итератор. Он не выходит за пределы метода — escape analysis JIT может вообще не создавать его в куче (scalar replacement).",
  },
  { line: 5, frames: [{ name: "main", locals: [["n", "3"], ["p", "→ #1"], ["list", "→ #2"], ["s", "3"]] }], heap: [P, AL(1), ARR(true), IT], note: "return: кадр sum снят целиком, за O(1). Итератор #4 больше недостижим — это мусор, но куча очистится только при GC." },
  { line: 6, frames: [{ name: "main", locals: [["n", "3"], ["p", "null"], ["list", "→ #2"], ["s", "3"]] }], heap: [P, AL(1), ARR(true), IT], note: "p = null, но Point #1 жив: на него ссылается массив списка. Достижимость считается от корней (стеки, static-поля), а не по числу ссылок." },
  { line: 7, frames: [{ name: "main", locals: [["n", "3"], ["p", "null"], ["list", "null"], ["s", "3"]] }], heap: [P, AL(1), ARR(true), IT], note: "Корней больше нет — весь граф #1, #2, #3 стал мусором разом. Циклы и взаимные ссылки GC не мешают." },
];

function reachable(s: Snap) {
  const byId = new Map(s.heap.map((o) => [o.id, o]));
  const seen = new Set<number>();
  const visit = (v: string) => {
    const m = v.match(/#(\d+)/);
    if (!m) return;
    const id = +m[1];
    if (seen.has(id) || !byId.has(id)) return;
    seen.add(id);
    byId.get(id)!.fields.forEach(([, fv]) => visit(fv));
  };
  s.frames.forEach((f) => f.locals.forEach(([, v]) => visit(v)));
  return seen;
}

export function StackHeap() {
  const [i, setI] = useState(0);
  const s = SNAPS[i];
  const live = reachable(s);
  const player = usePlayer(() => {
    if (i >= SNAPS.length - 1) return false;
    setI(i + 1);
    return true;
  }, 1600);
  return (
    <Frame
      title="Стек и куча по шагам"
      hint="один поток"
      controls={<StepControls onStep={() => setI(i + 1)} onBack={() => setI(i - 1)} canBack={i > 0} onReset={() => { player.stop(); setI(0); }} canStep={i < SNAPS.length - 1} player={player} />}
    >
      <div className="grid gap-4 md:grid-cols-[1.1fr_1fr_1.2fr]">
        <div className="min-w-0">
          <Caption>Код</Caption>
          <pre className="overflow-x-auto rounded-xl border border-line bg-bg/60 py-2 font-mono text-[11.5px] leading-[1.65]">
            {CODE.map((l, k) => (
              <div key={k} className={cx("px-3", k === s.line ? "bg-accent/15 text-ink" : "text-mute")}>
                {l}
              </div>
            ))}
          </pre>
        </div>
        <div className="min-w-0">
          <Caption>Стек потока</Caption>
          <div className="flex flex-col-reverse gap-1.5">
            {s.frames.map((f, k) => (
              <div key={f.name} className={cx("rounded-xl border p-2", k === s.frames.length - 1 ? "border-blue/60 bg-blue/[0.06]" : "border-line bg-bg/40")}>
                <div className="mb-1 font-mono text-[11px] text-blue">{f.name}()</div>
                {f.locals.length === 0 && <div className="font-mono text-[11px] text-mute">—</div>}
                {f.locals.map(([n, v]) => (
                  <div key={n} className="flex justify-between gap-2 font-mono text-[12px]">
                    <span className="text-dim">{n}</span>
                    <span className={v.startsWith("→") ? "text-amber" : "text-ink"}>{v}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <Caption>Куча</Caption>
          <div className="grid gap-1.5">
            {s.heap.length === 0 && <div className="rounded-xl border border-dashed border-line px-3 py-3 font-mono text-[11.5px] text-mute">пусто</div>}
            {s.heap.map((o) => {
              const alive = live.has(o.id);
              return (
                <div key={o.id} className={cx("rounded-xl border p-2 transition", alive ? "border-line-strong bg-raised" : "border-dashed border-bad/40 opacity-55")}>
                  <div className="mb-1 flex justify-between font-mono text-[11px]">
                    <span className="text-ink">
                      #{o.id} {o.cls}
                    </span>
                    {!alive && <span className="text-bad">мусор</span>}
                  </div>
                  {o.fields.map(([n, v]) => (
                    <div key={n} className="flex justify-between gap-2 font-mono text-[11.5px]">
                      <span className="text-mute">{n}</span>
                      <span className={v.startsWith("→") ? "text-amber" : "text-dim"}>{v}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-4 rounded-xl border border-line bg-bg/40 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-dim">{s.note}</p>
    </Frame>
  );
}

// ── Поколения и minor GC ─────────────────────────────────────

const EDEN = 24;
const SURV = 8;
const OLD = 32;
const TENURE = 3;

interface GObj {
  id: number;
  dies: number;
  age: number;
}
interface G {
  t: number;
  eden: GObj[];
  from: GObj[];
  old: GObj[];
  minor: number;
  full: number;
  copied: number;
  promoted: number;
  lastPause: number;
  next: number;
  seed: number;
  log: string[];
}
const g0 = (): G => ({ t: 0, eden: [], from: [], old: [], minor: 0, full: 0, copied: 0, promoted: 0, lastPause: 0, next: 1, seed: 3, log: [] });

function gcStep(g0_: G, longLived: number): G {
  const g: G = structuredClone(g0_);
  const r = rng(g.seed);
  g.seed++;
  // аллоцируем 4 объекта: большинство умирает почти сразу
  for (let k = 0; k < 4; k++) {
    const life = r() < longLived ? 1000 : 1 + Math.floor(r() * 4);
    g.eden.push({ id: g.next++, dies: g.t + life, age: 0 });
  }
  g.t++;
  if (g.eden.length < EDEN) return g;
  // eden полон → minor GC: живых из eden и from копируем в to, старых — в old
  const alive = (o: GObj) => o.dies > g.t;
  const survivors = [...g.eden, ...g.from].filter(alive).map((o) => ({ ...o, age: o.age + 1 }));
  const toOld = survivors.filter((o) => o.age >= TENURE);
  let to = survivors.filter((o) => o.age < TENURE);
  // переполнение survivor → преждевременное продвижение
  const overflow = to.slice(SURV);
  to = to.slice(0, SURV);
  const promote = [...toOld, ...overflow];
  g.old.push(...promote);
  const dead = g.eden.length + g.from.length - survivors.length;
  g.minor++;
  g.copied += survivors.length;
  g.promoted += promote.length;
  g.lastPause = 1 + survivors.length * 0.5;
  g.log.push(
    `minor GC #${g.minor}: мёртвых ${dead}, живых ${survivors.length} → ${to.length} в survivor, ${promote.length} в old${overflow.length ? ` (${overflow.length} — survivor переполнен)` : ""}. Пауза ~${g.lastPause.toFixed(1)} мс`,
  );
  g.eden = [];
  g.from = to;
  if (g.old.length >= OLD) {
    const before = g.old.length;
    g.old = g.old.filter(alive);
    g.full++;
    g.lastPause = 20 + before * 2;
    g.log.push(`old заполнен → major/full GC: проверены все ${before} старых объектов, освобождено ${before - g.old.length}. Пауза ~${g.lastPause} мс`);
  }
  return g;
}

export function GcGenerations() {
  const [g, setG] = useState(g0);
  const [longLived, setLongLived] = useState(0.08);
  const player = usePlayer(() => {
    setG(gcStep(g, longLived));
    return true;
  }, 420);
  const alive = (o: GObj) => o.dies > g.t;
  const Region = ({ title, items, cap, cols, tone }: { title: string; items: GObj[]; cap: number; cols: number; tone: string }) => (
    <div className="min-w-0">
      <Caption>
        {title} · {items.length}/{cap}
      </Caption>
      <div className="grid gap-[3px] rounded-xl border border-line bg-bg/40 p-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: cap }, (_, k) => {
          const o = items[k];
          return (
            <div
              key={k}
              className="relative aspect-square rounded-[4px]"
              style={{
                background: !o ? "transparent" : alive(o) ? `color-mix(in oklab, ${tone} ${40 + o.age * 15}%, var(--color-surface))` : "color-mix(in oklab, var(--color-bad) 18%, var(--color-surface))",
                border: o ? "none" : "1px dashed var(--color-line)",
              }}
              title={o ? (alive(o) ? `жив, возраст ${o.age}` : "мёртв") : ""}
            >
              {o && o.age > 0 && <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] text-bg">{o.age}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
  return (
    <Frame
      title="Поколения: eden → survivor → old"
      hint="слабая гипотеза поколений"
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <Segmented
            value={longLived}
            onChange={setLongLived}
            block
            options={[
              { value: 0.08, label: "Обычный сервис" },
              { value: 0.35, label: "Растущий кэш" },
            ]}
          />
          <div className="flex gap-2">
            <Button variant="primary" onClick={() => setG(gcStep(g, longLived))} className="flex-1">
              Аллоцировать
            </Button>
            <Button onClick={player.toggle} className="flex-1">{player.playing ? "Пауза" : "Авто"}</Button>
            <Button onClick={() => { player.stop(); setG(g0()); }}>Сначала</Button>
          </div>
        </div>
      }
    >
      <Metrics>
        <Metric label="minor GC" value={g.minor} />
        <Metric label="скопировано живых" value={g.copied} />
        <Metric label="в old" value={g.promoted} tone={g.promoted > 20 ? "amber" : undefined} />
        <Metric label="full GC" value={g.full} tone={g.full ? "bad" : "ok"} />
      </Metrics>
      <div className="mt-4 grid gap-3 md:grid-cols-[1.5fr_0.7fr_1.6fr]">
        <Region title="Eden" items={g.eden} cap={EDEN} cols={6} tone={C.accent} />
        <Region title="Survivor" items={g.from} cap={SURV} cols={4} tone={C.blue} />
        <Region title="Old" items={g.old} cap={OLD} cols={8} tone={C.violet} />
      </div>
      <Legend className="mt-3" items={[{ color: C.accent, label: "живой (цифра — пережитых GC)" }, { color: C.bad, label: "мёртвый, ждёт сборки" }]} />
      <Log className="mt-3" lines={g.log} max={3} empty="Каждый клик — 4 новых объекта в eden. Когда eden заполнится, minor GC скопирует только живых." />
    </Frame>
  );
}

// ── Модель памяти: litmus-тест Dekker ─────────────────────────

const OPS = { A: ["x = 1", "r1 = y"], B: ["y = 1", "r2 = x"] } as const;

function interleavings() {
  const out: string[][] = [];
  const rec = (a: number, b: number, acc: string[]) => {
    if (a === 2 && b === 2) return out.push(acc);
    if (a < 2) rec(a + 1, b, [...acc, `A${a}`]);
    if (b < 2) rec(a, b + 1, [...acc, `B${b}`]);
  };
  rec(0, 0, []);
  return out;
}
function run(seq: string[]) {
  const m: Record<string, number> = { x: 0, y: 0, r1: 0, r2: 0 };
  for (const s of seq) {
    const op = OPS[s[0] as "A" | "B"][+s[1]];
    const [l, rr] = op.split(" = ");
    m[l] = rr === "1" ? 1 : m[rr];
  }
  return `${m.r1}${m.r2}`;
}

export function Litmus() {
  const [vol, setVol] = useState(false);
  const all = useMemo(() => interleavings(), []);
  const byOutcome = useMemo(() => {
    const map: Record<string, string[][]> = {};
    for (const s of all) (map[run(s)] ??= []).push(s);
    return map;
  }, [all]);
  const [sel, setSel] = useState("00");
  const outcomes = ["01", "10", "11", "00"];
  const possible = (o: string) => (o === "00" ? !vol : true);
  const show = byOutcome[sel];
  return (
    <Frame title="Litmus-тест: может ли r1 = r2 = 0?" hint="x = y = 0 в начале">
      <div className="grid grid-cols-2 gap-2 font-mono text-[13px]">
        {(["A", "B"] as const).map((t) => (
          <div key={t} className="rounded-xl border border-line bg-bg/40 p-3">
            <div className="mb-1 text-[11px] text-mute">Поток {t}</div>
            {OPS[t].map((o) => (
              <div key={o} className="text-ink">
                {vol && !o.startsWith("r") ? <span className="text-violet">volatile </span> : null}
                {o};
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-3">
        <Toggle checked={vol} onChange={setVol} label="Объявить x и y как volatile" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {outcomes.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => setSel(o)}
            className={cx(
              "rounded-xl border px-3 py-2 text-left transition",
              sel === o ? "border-accent/60 bg-accent/10" : "border-line hover:border-line-strong",
            )}
          >
            <div className="font-mono text-[13px] text-ink">
              r1={o[0]}, r2={o[1]}
            </div>
            <div className={cx("text-[12px]", possible(o) ? (o === "00" ? "text-amber" : "text-ok") : "text-mute line-through")}>
              {o === "00" ? (vol ? "запрещено" : "возможно на реальном CPU") : `${byOutcome[o]?.length ?? 0} чередований`}
            </div>
          </button>
        ))}
      </div>
      <div className="mt-3 rounded-xl border border-line bg-bg/40 p-3 text-[13.5px] leading-relaxed text-dim">
        {sel === "00" ? (
          vol ? (
            <>
              <b className="text-ink">volatile запрещает этот исход.</b> Все volatile-операции образуют единый порядок, согласованный с порядком в программе: кто-то из потоков записал первым, и второй поток его запись увидит. JIT ставит барьер (на x86 — <code className="font-mono">lock</code>-инструкцию) после volatile-записи.
            </>
          ) : (
            <>
              <b className="text-amber">Ни одно последовательное чередование не даёт 00</b> — но на x86 и ARM это реальный результат. Запись <code className="font-mono">x = 1</code> сидит в store buffer ядра A и ещё не видна ядру B, а чтение <code className="font-mono">y</code> уже выполнилось. Плюс JIT вправе переставить независимые запись и чтение. Без happens-before у потока нет гарантий, что он увидит запись другого.
            </>
          )
        ) : (
          <>
            Последовательные чередования с этим исходом:
            <div className="mt-2 flex flex-wrap gap-1.5">
              {show?.map((s, k) => (
                <span key={k} className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[11.5px] text-ink">
                  {s.map((x) => OPS[x[0] as "A" | "B"][+x[1]]).join(" → ")}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </Frame>
  );
}
