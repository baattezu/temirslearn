import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Slider } from "../ui/Field";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Metric, Metrics, StepControls, usePlayer } from "./kit";

// ══ Таблицы истинности ══════════════════════════════════════

const FORMULAS: { id: string; label: string; f: (p: boolean, q: boolean) => boolean }[] = [
  { id: "imp", label: "p → q", f: (p, q) => !p || q },
  { id: "contra", label: "¬q → ¬p", f: (p, q) => q || !p },
  { id: "conv", label: "q → p", f: (p, q) => !q || p },
  { id: "inv", label: "¬p → ¬q", f: (p, q) => p || !q },
  { id: "or", label: "¬p ∨ q", f: (p, q) => !p || q },
  { id: "neg", label: "¬(p → q)", f: (p, q) => p && !q },
  { id: "and", label: "p ∧ ¬q", f: (p, q) => p && !q },
  { id: "iff", label: "p ↔ q", f: (p, q) => p === q },
];

export function TruthTable() {
  const [a, setA] = useState("imp");
  const [b, setB] = useState("contra");
  const fa = FORMULAS.find((x) => x.id === a)!;
  const fb = FORMULAS.find((x) => x.id === b)!;
  const rows: [boolean, boolean][] = [
    [true, true],
    [true, false],
    [false, true],
    [false, false],
  ];
  const eq = rows.every(([p, q]) => fa.f(p, q) === fb.f(p, q));
  const T = (v: boolean) => <span className={v ? "text-ok" : "text-bad"}>{v ? "И" : "Л"}</span>;
  return (
    <Frame title="Таблицы истинности: равносильны ли формулы" hint="p — «идёт дождь», q — «асфальт мокрый»">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          [a, setA, "Формула A"],
          [b, setB, "Формула B"],
        ].map(([v, set, label]) => (
          <div key={label as string}>
            <Caption>{label as string}</Caption>
            <div className="flex flex-wrap gap-1.5">
              {FORMULAS.map((f) => (
                <Chip key={f.id} active={f.id === v} onClick={() => (set as (x: string) => void)(f.id)} className="h-8 font-mono text-[12.5px]">
                  {f.label}
                </Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
      <table className="mx-auto mt-4 w-full max-w-md border-separate border-spacing-y-1 text-center font-mono text-[14px]">
        <thead className="text-[12px] text-mute">
          <tr>
            <th>p</th>
            <th>q</th>
            <th className="text-accent">{fa.label}</th>
            <th className="text-blue">{fb.label}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([p, q], i) => {
            const same = fa.f(p, q) === fb.f(p, q);
            return (
              <tr key={i} className={same ? "" : "bg-bad/10"}>
                <td className="py-1">{T(p)}</td>
                <td>{T(q)}</td>
                <td>{T(fa.f(p, q))}</td>
                <td>{T(fb.f(p, q))}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className={cx("mt-3 rounded-xl border px-3.5 py-2.5 text-[13.5px]", eq ? "border-ok/40 bg-ok/10 text-ok" : "border-bad/40 bg-bad/10 text-bad")}>
        {eq ? `Равносильны: ${fa.label} ≡ ${fb.label} — совпадают во всех четырёх строках.` : `Не равносильны: различаются в подсвеченных строках.`}
      </div>
    </Frame>
  );
}

// ══ Ханойские башни ═════════════════════════════════════════

export function Hanoi() {
  const [n, setN] = useState(4);
  const moves = useMemo(() => {
    const out: [number, number][] = [];
    const go = (k: number, from: number, to: number, via: number) => {
      if (k === 0) return;
      go(k - 1, from, via, to);
      out.push([from, to]);
      go(k - 1, via, to, from);
    };
    go(n, 0, 2, 1);
    return out;
  }, [n]);
  const [i, setI] = useState(0);
  const pegs = useMemo(() => {
    const p: number[][] = [Array.from({ length: n }, (_, k) => n - k), [], []];
    for (const [a, b] of moves.slice(0, i)) p[b].push(p[a].pop()!);
    return p;
  }, [moves, i, n]);
  const player = usePlayer(() => {
    if (i >= moves.length) return false;
    setI(i + 1);
    return true;
  }, 350);
  const last = i > 0 ? moves[i - 1] : null;
  return (
    <Frame
      title="Ханойские башни"
      hint="переложи все диски на правый стержень"
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <Slider label="Дисков" value={n} min={1} max={7} onChange={(v) => { player.stop(); setN(v); setI(0); }} />
          <StepControls onStep={() => setI(i + 1)} onBack={() => setI(i - 1)} canBack={i > 0} canStep={i < moves.length} onReset={() => { player.stop(); setI(0); }} player={player} />
        </div>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        {pegs.map((peg, k) => (
          <div key={k} className="relative flex h-40 flex-col-reverse items-center gap-[3px] border-b-2 border-line-strong pb-1">
            <div className="absolute bottom-0 top-2 w-1 rounded bg-line-strong" />
            {peg.map((d) => (
              <div
                key={d}
                className="relative h-4 rounded-md"
                style={{ width: `${20 + (d / n) * 75}%`, background: `color-mix(in oklab, ${C.accent} ${30 + (d / n) * 60}%, ${C.blue})`, outline: last && last[1] === k && peg[peg.length - 1] === d ? "2px solid var(--color-amber)" : undefined }}
              />
            ))}
          </div>
        ))}
      </div>
      <Metrics className="mt-4">
        <Metric label="ход" value={`${i} / ${moves.length}`} />
        <Metric label="2ⁿ − 1" value={2 ** n - 1} tone="accent" />
        <Metric label="64 диска" value="585 млрд лет" />
        <Metric label="при 1 ходе/с" value={`${(2 ** n - 1).toLocaleString("ru")} с`} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Рекурсия: чтобы переложить n дисков, переложи n − 1 на средний, самый большой — на правый, и n − 1 снова сверху. По индукции T(n) = 2·T(n − 1) + 1, T(1) = 1 ⇒ T(n) = 2ⁿ − 1.
      </p>
    </Frame>
  );
}

// ══ Свойства отношений ══════════════════════════════════════

const SET = [1, 2, 3, 4, 5, 6];
const RELS: { id: string; label: string; r: (a: number, b: number) => boolean }[] = [
  { id: "le", label: "a ≤ b", r: (a, b) => a <= b },
  { id: "lt", label: "a < b", r: (a, b) => a < b },
  { id: "div", label: "a делит b", r: (a, b) => b % a === 0 },
  { id: "mod", label: "a ≡ b (mod 3)", r: (a, b) => a % 3 === b % 3 },
  { id: "near", label: "|a − b| ≤ 1", r: (a, b) => Math.abs(a - b) <= 1 },
  { id: "eq", label: "a = b", r: (a, b) => a === b },
];

export function Relations() {
  const [id, setId] = useState("mod");
  const R = RELS.find((x) => x.id === id)!;
  const has = (a: number, b: number) => R.r(a, b);
  const refl = SET.every((a) => has(a, a));
  const sym = SET.every((a) => SET.every((b) => !has(a, b) || has(b, a)));
  const anti = SET.every((a) => SET.every((b) => !(has(a, b) && has(b, a)) || a === b));
  const trans = SET.every((a) => SET.every((b) => SET.every((c) => !(has(a, b) && has(b, c)) || has(a, c))));
  const transBreak = !trans ? SET.flatMap((a) => SET.flatMap((b) => SET.map((c) => [a, b, c]))).find(([a, b, c]) => has(a, b) && has(b, c) && !has(a, c)) : null;
  const equiv = refl && sym && trans;
  const order = refl && anti && trans;
  const classes = equiv ? [...new Set(SET.map((a) => SET.filter((b) => has(a, b)).join(",")))] : [];
  const Prop = ({ ok, label }: { ok: boolean; label: string }) => (
    <div className={cx("rounded-lg border px-2.5 py-1.5 text-center text-[12.5px]", ok ? "border-ok/40 bg-ok/10 text-ok" : "border-line text-mute line-through")}>{label}</div>
  );
  return (
    <Frame title="Отношение как матрица" hint="на множестве {1,…,6}">
      <div className="flex flex-wrap gap-1.5">
        {RELS.map((r) => (
          <Chip key={r.id} active={r.id === id} onClick={() => setId(r.id)} className="h-8 font-mono text-[12.5px]">
            {r.label}
          </Chip>
        ))}
      </div>
      <div className="mt-4 grid items-start gap-4 sm:grid-cols-[auto_1fr]">
        <table className="mx-auto border-separate border-spacing-[3px] font-mono text-[12px]">
          <thead>
            <tr>
              <th className="text-mute">a\b</th>
              {SET.map((b) => (
                <th key={b} className="w-8 text-dim">{b}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SET.map((a) => (
              <tr key={a}>
                <th className="pr-1 text-dim">{a}</th>
                {SET.map((b) => {
                  const on = has(a, b);
                  const broken = transBreak && ((a === transBreak[0] && b === transBreak[2]) || (a === transBreak[0] && b === transBreak[1]) || (a === transBreak[1] && b === transBreak[2]));
                  return (
                    <td key={b} className="h-8 w-8 rounded-md text-center" style={{ background: broken ? "color-mix(in oklab, var(--color-bad) 30%, transparent)" : on ? "color-mix(in oklab, var(--color-accent) 35%, transparent)" : "var(--color-raised)", outline: a === b ? "1px solid var(--color-line-strong)" : undefined }}>
                      {on ? "1" : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid gap-2">
          <div className="grid grid-cols-2 gap-1.5">
            <Prop ok={refl} label="рефлексивно" />
            <Prop ok={sym} label="симметрично" />
            <Prop ok={anti} label="антисимметрично" />
            <Prop ok={trans} label="транзитивно" />
          </div>
          <div className="rounded-xl border border-line bg-bg/40 px-3 py-2.5 text-[13px] leading-relaxed text-dim">
            {equiv
              ? `Отношение эквивалентности — разбивает множество на классы: ${classes.map((c) => `{${c}}`).join(" ")}.`
              : order
                ? "Частичный порядок: рефлексивно, антисимметрично, транзитивно. По нему можно строить топологическую сортировку."
                : transBreak
                  ? `Не транзитивно: ${transBreak[0]}→${transBreak[1]} и ${transBreak[1]}→${transBreak[2]}, но не ${transBreak[0]}→${transBreak[2]} (подсвечено).`
                  : "Ни эквивалентность, ни частичный порядок."}
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ══ Треугольник Паскаля и дни рождения ═══════════════════════

export function Pascal() {
  const [n, setN] = useState(6);
  const [k, setK] = useState(2);
  const rows = useMemo(() => {
    const r: number[][] = [[1]];
    for (let i = 1; i <= 10; i++) r.push(Array.from({ length: i + 1 }, (_, j) => (j === 0 || j === i ? 1 : r[i - 1][j - 1] + r[i - 1][j])));
    return r;
  }, []);
  const kk = Math.min(k, n);
  return (
    <Frame title="Треугольник Паскаля: C(n, k)" hint="каждое число — сумма двух над ним">
      <div className="grid gap-3 sm:grid-cols-2">
        <Slider label="n" value={n} min={0} max={10} onChange={setN} />
        <Slider label="k" value={kk} min={0} max={n} onChange={setK} />
      </div>
      <div className="mt-4 grid gap-1">
        {rows.map((row, i) => (
          <div key={i} className="flex justify-center gap-1">
            {row.map((v, j) => {
              const target = i === n && j === kk;
              const parent = i === n - 1 && (j === kk - 1 || j === kk);
              return (
                <span
                  key={j}
                  className={cx("flex h-7 min-w-7 items-center justify-center rounded-md px-1 font-mono text-[11px] sm:min-w-9 sm:text-[12px]", target ? "bg-accent text-accent-ink" : parent ? "bg-blue/25 text-ink" : i === n ? "bg-raised text-ink" : "text-mute")}
                >
                  {v}
                </span>
              );
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 font-mono text-[13px] text-dim">
        C({n}, {kk}) = {n}! / ({kk}!·{n - kk}!) = <span className="text-accent">{rows[n][kk]}</span>
        {n > 0 && kk > 0 && kk < n && (
          <>
            {" "}= C({n - 1}, {kk - 1}) + C({n - 1}, {kk}) = {rows[n - 1][kk - 1]} + {rows[n - 1][kk]}
          </>
        )}
      </p>
      <p className="mt-1 text-[13px] text-mute">Сумма строки n = 2ⁿ = {2 ** n}: число всех подмножеств.</p>
    </Frame>
  );
}

export function Birthday() {
  const [n, setN] = useState(23);
  const [days, setDays] = useState(365);
  let pNo = 1;
  for (let i = 0; i < n; i++) pNo *= (days - i) / days;
  const p = 1 - pNo;
  const W = 520;
  const H = 110;
  const pts = Array.from({ length: 81 }, (_, x) => {
    let q = 1;
    for (let i = 0; i < x; i++) q *= (days - i) / days;
    return `${(x / 80) * W},${H - (1 - q) * H}`;
  }).join(" ");
  return (
    <Frame title="Парадокс дней рождения" hint="и коллизии хешей">
      <div className="grid gap-3 sm:grid-cols-2">
        <Slider label="Людей в комнате" value={n} min={2} max={80} onChange={setN} />
        <Slider label="Возможных значений" value={days} min={50} max={1000} step={5} onChange={setDays} />
      </div>
      <svg viewBox={`0 -4 ${W} ${H + 8}`} className="mt-4 block w-full">
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke={C.line} strokeDasharray="4 4" />
        <polyline points={pts} fill="none" stroke={C.accent} strokeWidth={2} />
        <circle cx={(Math.min(80, n) / 80) * W} cy={H - p * H} r={5} fill={C.amber} />
      </svg>
      <Metrics className="mt-3 sm:grid-cols-2">
        <Metric label="P(есть совпадение)" value={`${(p * 100).toFixed(1)}%`} tone={p > 0.5 ? "bad" : "ok"} />
        <Metric label="≈ √(2·N·ln 2)" value={Math.round(Math.sqrt(2 * days * Math.LN2))} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Совпадение становится вероятнее 50%, когда элементов около √N. Для 32-битного хеша это всего ~77 000 ключей; поэтому для идентификаторов берут 128 бит и больше (UUID), а «коротких» хешей коммитов git хватает только для просмотра глазами.
      </p>
    </Frame>
  );
}

// ══ Графы: Эйлер и двудольность ══════════════════════════════

const GRAPHS: Record<string, { label: string; pos: [number, number][]; edges: [number, number][] }> = {
  konig: {
    label: "Кёнигсберг",
    pos: [[60, 40], [60, 160], [180, 100], [300, 100]],
    edges: [[0, 2], [0, 2], [1, 2], [1, 2], [0, 3], [1, 3], [2, 3]],
  },
  house: {
    label: "Домик",
    pos: [[160, 20], [90, 80], [230, 80], [90, 170], [230, 170]],
    edges: [[0, 1], [0, 2], [1, 2], [1, 3], [2, 4], [3, 4], [1, 4], [2, 3]],
  },
  cube: {
    label: "Куб",
    pos: [[70, 40], [210, 40], [70, 160], [210, 160], [120, 80], [260, 80], [120, 200], [260, 200]],
    edges: [[0, 1], [0, 2], [1, 3], [2, 3], [4, 5], [4, 6], [5, 7], [6, 7], [0, 4], [1, 5], [2, 6], [3, 7]],
  },
  tri: {
    label: "Треугольник + хвост",
    pos: [[80, 40], [200, 40], [140, 140], [260, 160]],
    edges: [[0, 1], [1, 2], [2, 0], [2, 3]],
  },
};

export function GraphProps() {
  const [g, setG] = useState("konig");
  const G = GRAPHS[g];
  const n = G.pos.length;
  const deg = Array(n).fill(0) as number[];
  for (const [a, b] of G.edges) {
    deg[a]++;
    deg[b]++;
  }
  const odd = deg.filter((d) => d % 2).length;
  // двудольность: BFS-раскраска
  const color = Array(n).fill(-1) as number[];
  let bip = true;
  let bad: [number, number] | null = null;
  for (let s = 0; s < n; s++) {
    if (color[s] !== -1) continue;
    color[s] = 0;
    const q = [s];
    while (q.length) {
      const v = q.shift()!;
      for (const [a, b] of G.edges) {
        const u = a === v ? b : b === v ? a : -1;
        if (u < 0) continue;
        if (color[u] === -1) {
          color[u] = 1 - color[v];
          q.push(u);
        } else if (color[u] === color[v]) {
          bip = false;
          bad ??= [v, u];
        }
      }
    }
  }
  return (
    <Frame title="Графы: степени, Эйлер, двудольность" hint="рёбра могут быть кратными">
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(GRAPHS).map(([k, v]) => (
          <Chip key={k} active={k === g} onClick={() => setG(k)}>
            {v.label}
          </Chip>
        ))}
      </div>
      <svg viewBox="0 0 320 220" className="mx-auto mt-3 block w-full max-w-[380px]">
        {G.edges.map(([a, b], i) => {
          const dup = G.edges.slice(0, i).filter(([x, y]) => (x === a && y === b) || (x === b && y === a)).length;
          const [x1, y1] = G.pos[a];
          const [x2, y2] = G.pos[b];
          const mx = (x1 + x2) / 2 + (dup ? (y2 - y1) * 0.25 : 0);
          const my = (y1 + y2) / 2 - (dup ? (x2 - x1) * 0.25 : 0);
          const isBad = bad && ((bad[0] === a && bad[1] === b) || (bad[0] === b && bad[1] === a));
          return <path key={i} d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`} fill="none" stroke={isBad ? C.bad : C.lineStrong} strokeWidth={isBad ? 3 : 2} />;
        })}
        {G.pos.map(([x, y], v) => (
          <g key={v}>
            <circle cx={x} cy={y} r={15} fill={bip ? (color[v] ? C.blue : C.accent) : C.raised} stroke={deg[v] % 2 ? C.amber : C.lineStrong} strokeWidth={deg[v] % 2 ? 3 : 1.5} />
            <text x={x} y={y + 4.5} textAnchor="middle" fontSize={12} fontFamily="var(--font-mono)" fill={bip ? C.bg : C.ink}>
              {deg[v]}
            </text>
          </g>
        ))}
      </svg>
      <Metrics className="mt-2">
        <Metric label="вершин / рёбер" value={`${n} / ${G.edges.length}`} />
        <Metric label="сумма степеней" value={`${deg.reduce((a, b) => a + b, 0)} = 2·${G.edges.length}`} />
        <Metric label="нечётных степеней" value={odd} tone={odd === 0 || odd === 2 ? "ok" : "bad"} />
        <Metric label="двудольный" value={bip ? "да" : "нет"} tone={bip ? "ok" : "bad"} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {odd === 0 ? "Все степени чётные — есть эйлеров цикл: обойти каждое ребро ровно раз и вернуться." : odd === 2 ? "Ровно две вершины нечётной степени — есть эйлеров путь между ними (но не цикл)." : `Нечётных вершин ${odd} — пройти все рёбра по одному разу нельзя. Так Эйлер в 1736 году доказал, что мосты Кёнигсберга не обойти.`}{" "}
        {bip ? "Вершины раскрашиваются в два цвета так, что рёбра идут только между цветами." : "Есть нечётный цикл (красное ребро соединяет одноцветные вершины) — двудольным граф быть не может."}
      </p>
      <Button size="sm" variant="ghost" className="mt-1" onClick={() => setG("konig")}>
        Сначала
      </Button>
    </Frame>
  );
}
