import { useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { Slider } from "../ui/Field";
import { Frame } from "./Frame";
import { C, Metric, Metrics } from "./kit";

type V = [number, number];

/** Координатная плоскость [-R, R]² с перетаскиваемыми точками. */
function Plane({ R = 4, children, handles = [], onDrag, size = 320 }: { R?: number; children: (X: (x: number) => number, Y: (y: number) => number) => ReactNode; handles?: { p: V; color: string }[]; onDrag?: (i: number, p: V) => void; size?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const S = size;
  const X = (x: number) => S / 2 + (x / R) * (S / 2);
  const Y = (y: number) => S / 2 - (y / R) * (S / 2);
  const toWorld = (e: React.PointerEvent): V => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * S;
    const py = ((e.clientY - r.top) / r.height) * S;
    const snap = (v: number) => Math.round(v * 4) / 4;
    return [snap(((px - S / 2) / (S / 2)) * R), snap((-(py - S / 2) / (S / 2)) * R)];
  };
  return (
    <svg
      ref={ref}
      viewBox={`0 0 ${S} ${S}`}
      className="mx-auto block w-full max-w-[380px] touch-none select-none"
      onPointerMove={(e) => drag !== null && onDrag?.(drag, toWorld(e))}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
    >
      {Array.from({ length: 2 * R + 1 }, (_, k) => k - R).map((v) => (
        <g key={v}>
          <line x1={X(v)} x2={X(v)} y1={0} y2={S} stroke={v === 0 ? C.lineStrong : C.line} strokeWidth={v === 0 ? 1.4 : 0.7} />
          <line y1={Y(v)} y2={Y(v)} x1={0} x2={S} stroke={v === 0 ? C.lineStrong : C.line} strokeWidth={v === 0 ? 1.4 : 0.7} />
        </g>
      ))}
      {children(X, Y)}
      {handles.map((h, i) => (
        <circle
          key={i}
          cx={X(h.p[0])}
          cy={Y(h.p[1])}
          r={11}
          fill={h.color}
          fillOpacity={0.25}
          stroke={h.color}
          strokeWidth={2}
          className="cursor-grab"
          onPointerDown={(e) => {
            (e.target as Element).setPointerCapture?.(e.pointerId);
            setDrag(i);
          }}
        />
      ))}
    </svg>
  );
}

function Arrow({ from = [0, 0], to, color, X, Y, width = 2.5, dash }: { from?: V; to: V; color: string; X: (x: number) => number; Y: (y: number) => number; width?: number; dash?: string }) {
  const x1 = X(from[0]);
  const y1 = Y(from[1]);
  const x2 = X(to[0]);
  const y2 = Y(to[1]);
  const a = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 2) return null;
  const h = 9;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2 - Math.cos(a) * h * 0.6} y2={y2 - Math.sin(a) * h * 0.6} stroke={color} strokeWidth={width} strokeDasharray={dash} />
      <path d={`M${x2} ${y2} L${x2 - h * Math.cos(a - 0.4)} ${y2 - h * Math.sin(a - 0.4)} L${x2 - h * Math.cos(a + 0.4)} ${y2 - h * Math.sin(a + 0.4)} Z`} fill={color} />
    </g>
  );
}

const f2 = (v: number) => (Math.abs(v) < 0.005 ? "0" : v.toFixed(2).replace(/\.?0+$/, ""));

// ══ Линейные комбинации и span ═══════════════════════════════

export function SpanViz() {
  const [v1, setV1] = useState<V>([2, 1]);
  const [v2, setV2] = useState<V>([-1, 1.5]);
  const [a, setA] = useState(1);
  const [b, setB] = useState(1);
  const det = v1[0] * v2[1] - v1[1] * v2[0];
  const sum: V = [a * v1[0] + b * v2[0], a * v1[1] + b * v2[1]];
  const dependent = Math.abs(det) < 1e-9;
  return (
    <Frame title="Линейная комбинация a·v₁ + b·v₂" hint="тяни концы векторов">
      <div className="grid items-center gap-4 md:grid-cols-[1fr_1fr]">
        <Plane
          handles={[
            { p: v1, color: C.accent },
            { p: v2, color: C.blue },
          ]}
          onDrag={(i, p) => (i === 0 ? setV1(p) : setV2(p))}
        >
          {(X, Y) => (
            <>
              {dependent ? (
                <line x1={X(-v1[0] * 10)} y1={Y(-v1[1] * 10)} x2={X(v1[0] * 10)} y2={Y(v1[1] * 10)} stroke={C.rose} strokeWidth={6} strokeOpacity={0.25} />
              ) : (
                <rect x={0} y={0} width={320} height={320} fill={C.violet} fillOpacity={0.05} />
              )}
              <Arrow to={[a * v1[0], a * v1[1]]} color={C.accent} X={X} Y={Y} width={1.5} dash="4 3" />
              <Arrow from={[a * v1[0], a * v1[1]]} to={sum} color={C.blue} X={X} Y={Y} width={1.5} dash="4 3" />
              <Arrow to={v1} color={C.accent} X={X} Y={Y} />
              <Arrow to={v2} color={C.blue} X={X} Y={Y} />
              <Arrow to={sum} color={C.amber} X={X} Y={Y} width={3} />
            </>
          )}
        </Plane>
        <div className="grid gap-4">
          <Slider label="a" value={a} min={-3} max={3} step={0.25} onChange={setA} />
          <Slider label="b" value={b} min={-3} max={3} step={0.25} onChange={setB} />
          <div className="rounded-xl border border-line bg-bg/40 p-3 font-mono text-[12.5px] leading-6">
            <div>
              <span className="text-accent">v₁</span> = ({f2(v1[0])}, {f2(v1[1])}) · <span className="text-blue">v₂</span> = ({f2(v2[0])}, {f2(v2[1])})
            </div>
            <div className="text-amber">
              {f2(a)}·v₁ + {f2(b)}·v₂ = ({f2(sum[0])}, {f2(sum[1])})
            </div>
          </div>
          <div className={dependent ? "text-[13.5px] text-rose" : "text-[13.5px] text-dim"}>
            {dependent
              ? "v₁ и v₂ на одной прямой — линейно зависимы. Любые комбинации остаются на этой прямой: span — линия, а не плоскость."
              : "Векторы независимы: подбирая a и b, можно попасть в любую точку плоскости. span = вся ℝ², и {v₁, v₂} — базис."}
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ══ Определитель как площадь ═════════════════════════════════

export function DeterminantViz() {
  const [m, setM] = useState({ a: 2, b: 0.5, c: 0.5, d: 1.5 });
  const det = m.a * m.d - m.b * m.c;
  const i: V = [m.a, m.c];
  const j: V = [m.b, m.d];
  return (
    <Frame title="Определитель = во сколько раз меняется площадь" hint="столбцы — образы î и ĵ">
      <div className="grid items-center gap-4 md:grid-cols-[1fr_1fr]">
        <Plane
          handles={[
            { p: i, color: C.accent },
            { p: j, color: C.blue },
          ]}
          onDrag={(k, p) => setM((x) => (k === 0 ? { ...x, a: p[0], c: p[1] } : { ...x, b: p[0], d: p[1] }))}
        >
          {(X, Y) => (
            <>
              <rect x={X(0)} y={Y(1)} width={X(1) - X(0)} height={Y(0) - Y(1)} fill={C.mute} fillOpacity={0.15} stroke={C.mute} strokeDasharray="3 3" />
              <path
                d={`M${X(0)} ${Y(0)} L${X(i[0])} ${Y(i[1])} L${X(i[0] + j[0])} ${Y(i[1] + j[1])} L${X(j[0])} ${Y(j[1])} Z`}
                fill={det < 0 ? C.rose : C.amber}
                fillOpacity={0.25}
                stroke={det < 0 ? C.rose : C.amber}
              />
              <Arrow to={i} color={C.accent} X={X} Y={Y} />
              <Arrow to={j} color={C.blue} X={X} Y={Y} />
            </>
          )}
        </Plane>
        <div className="grid gap-3">
          <div className="mx-auto font-mono text-[15px] text-ink">
            <span className="text-mute">[</span> <span className="text-accent">{f2(m.a)}</span> <span className="text-blue">{f2(m.b)}</span> <span className="text-mute">]</span>
            <br />
            <span className="text-mute">[</span> <span className="text-accent">{f2(m.c)}</span> <span className="text-blue">{f2(m.d)}</span> <span className="text-mute">]</span>
          </div>
          <Metrics className="sm:grid-cols-2">
            <Metric label="det = ad − bc" value={f2(det)} tone={Math.abs(det) < 0.01 ? "bad" : det < 0 ? "amber" : "accent"} />
            <Metric label="площадь квадрата" value={`1 → ${f2(Math.abs(det))}`} />
          </Metrics>
          <div className="text-[13.5px] leading-relaxed text-dim">
            {Math.abs(det) < 0.01
              ? "det = 0: плоскость сплющена в линию (или точку). Обратной матрицы нет — информацию о втором измерении не вернуть. Система Ax = b либо не имеет решений, либо их бесконечно много."
              : det < 0
                ? "det < 0: ориентация перевернулась — как отражение в зеркале. Модуль по-прежнему — множитель площади."
                : `Любая фигура после преобразования станет в ${f2(det)} раза больше по площади.`}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" onClick={() => setM({ a: 1, b: 0, c: 0, d: 1 })}>I</Button>
            <Button size="sm" onClick={() => setM({ a: 1, b: 2, c: 0.5, d: 1 })}>det = 0</Button>
            <Button size="sm" onClick={() => setM({ a: 0, b: 1, c: 1, d: 0 })}>отражение</Button>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ══ Собственные векторы: круг → эллипс, степенной метод ═══════

export function EigenViz() {
  const [m, setM] = useState({ a: 2, b: 1, c: 1, d: 2 });
  const [iters, setIters] = useState(0);
  const apply = (v: V): V => [m.a * v[0] + m.b * v[1], m.c * v[0] + m.d * v[1]];
  const tr = m.a + m.d;
  const det = m.a * m.d - m.b * m.c;
  const disc = tr * tr - 4 * det;
  const eig = disc >= 0 ? [(tr + Math.sqrt(disc)) / 2, (tr - Math.sqrt(disc)) / 2] : null;
  const vecFor = (l: number): V => {
    const v: V = Math.abs(m.b) > 1e-9 ? [m.b, l - m.a] : Math.abs(m.c) > 1e-9 ? [l - m.d, m.c] : l === m.a ? [1, 0] : [0, 1];
    const n = Math.hypot(...v);
    return [v[0] / n, v[1] / n];
  };
  const N = 24;
  const circle = Array.from({ length: N }, (_, k) => [Math.cos((k / N) * 2 * Math.PI), Math.sin((k / N) * 2 * Math.PI)] as V);
  // степенной метод
  const power = useMemo(() => {
    const pts: V[] = [[0.2, 1]];
    for (let k = 0; k < 12; k++) {
      const p = pts[pts.length - 1];
      const q: V = [m.a * p[0] + m.b * p[1], m.c * p[0] + m.d * p[1]];
      const n = Math.hypot(...q) || 1;
      pts.push([q[0] / n, q[1] / n]);
    }
    return pts;
  }, [m]);
  return (
    <Frame title="Собственные векторы: кто не поворачивается" hint="тонкие — v, яркие — Av">
      <div className="grid items-center gap-4 md:grid-cols-[1fr_1fr]">
        <Plane R={4}>
          {(X, Y) => (
            <>
              {circle.map((v, k) => {
                const w = apply(v);
                return (
                  <g key={k}>
                    <line x1={X(0)} y1={Y(0)} x2={X(v[0])} y2={Y(v[1])} stroke={C.mute} strokeWidth={0.8} />
                    <line x1={X(v[0])} y1={Y(v[1])} x2={X(w[0])} y2={Y(w[1])} stroke={C.blue} strokeOpacity={0.35} strokeWidth={0.8} />
                    <circle cx={X(w[0])} cy={Y(w[1])} r={2.4} fill={C.blue} />
                  </g>
                );
              })}
              {eig?.map((l, k) => {
                const v = vecFor(l);
                return <line key={k} x1={X(-v[0] * 6)} y1={Y(-v[1] * 6)} x2={X(v[0] * 6)} y2={Y(v[1] * 6)} stroke={k ? C.violet : C.accent} strokeWidth={1.5} strokeDasharray="6 4" />;
              })}
              {power.slice(0, iters + 1).map((p, k) => (
                <Arrow key={k} to={[p[0] * 1.6, p[1] * 1.6]} color={C.amber} X={X} Y={Y} width={k === iters ? 3 : 1} />
              ))}
            </>
          )}
        </Plane>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Slider label="a" value={m.a} min={-3} max={3} step={0.25} onChange={(v) => { setM({ ...m, a: v }); setIters(0); }} />
            <Slider label="b" value={m.b} min={-3} max={3} step={0.25} onChange={(v) => { setM({ ...m, b: v }); setIters(0); }} />
            <Slider label="c" value={m.c} min={-3} max={3} step={0.25} onChange={(v) => { setM({ ...m, c: v }); setIters(0); }} />
            <Slider label="d" value={m.d} min={-3} max={3} step={0.25} onChange={(v) => { setM({ ...m, d: v }); setIters(0); }} />
          </div>
          <Metrics className="sm:grid-cols-2">
            <Metric label="λ₁" value={eig ? f2(eig[0]) : "комплексное"} tone="accent" />
            <Metric label="λ₂" value={eig ? f2(eig[1]) : "комплексное"} />
          </Metrics>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="primary" onClick={() => setIters(Math.min(12, iters + 1))}>
              v ← Av / |Av|
            </Button>
            <Button size="sm" onClick={() => setIters(0)}>
              сброс ({iters})
            </Button>
          </div>
          <div className="text-[13px] leading-relaxed text-dim">
            {eig
              ? "Пунктир — собственные направления: вектор на них только растягивается в λ раз. Степенной метод (оранжевый) сходится к направлению с наибольшим |λ| — так работает PageRank."
              : "Дискриминант < 0: преобразование содержит поворот, и ни одно направление не остаётся на месте. Собственные значения комплексные."}
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ══ SVD: поворот · растяжение · поворот ═══════════════════════

function svd2(a: number, b: number, c: number, d: number) {
  // A = U Σ Vᵀ для 2×2 через собственные векторы AᵀA
  const ata = [a * a + c * c, a * b + c * d, b * b + d * d];
  const th = 0.5 * Math.atan2(2 * ata[1], ata[0] - ata[2]);
  const v1: V = [Math.cos(th), Math.sin(th)];
  const v2: V = [-Math.sin(th), Math.cos(th)];
  const av1: V = [a * v1[0] + b * v1[1], c * v1[0] + d * v1[1]];
  const av2: V = [a * v2[0] + b * v2[1], c * v2[0] + d * v2[1]];
  const s1 = Math.hypot(...av1);
  const s2 = Math.hypot(...av2);
  const u1: V = s1 > 1e-9 ? [av1[0] / s1, av1[1] / s1] : [1, 0];
  return { th, s1, s2, phi: Math.atan2(u1[1], u1[0]), flip: a * d - b * c < 0 };
}

export function SvdViz() {
  const [m] = useState({ a: 1.5, b: 1, c: 0.25, d: 1.25 });
  const [t, setT] = useState(0);
  const { th, s1, s2, phi, flip } = svd2(m.a, m.b, m.c, m.d);
  // этапы: 0..1 поворот Vᵀ (на −θ), 1..2 растяжение, 2..3 поворот U (на φ)
  const p1 = Math.min(1, t);
  const p2 = Math.min(1, Math.max(0, t - 1));
  const p3 = Math.min(1, Math.max(0, t - 2));
  const tf = (v: V): V => {
    let [x, y] = v;
    const r1 = -th * p1;
    [x, y] = [x * Math.cos(r1) - y * Math.sin(r1), x * Math.sin(r1) + y * Math.cos(r1)];
    x *= 1 + (s1 - 1) * p2;
    y *= (1 + ((flip ? -s2 : s2) - 1) * p2);
    const r2 = phi * p3;
    [x, y] = [x * Math.cos(r2) - y * Math.sin(r2), x * Math.sin(r2) + y * Math.cos(r2)];
    return [x, y];
  };
  const N = 60;
  const ring = Array.from({ length: N + 1 }, (_, k) => tf([Math.cos((k / N) * 2 * Math.PI), Math.sin((k / N) * 2 * Math.PI)]));
  const stage = t < 1 ? "Vᵀ: поворот к осям растяжения" : t < 2 ? "Σ: растяжение вдоль осей" : "U: поворот на место";
  return (
    <Frame title="SVD: любая матрица = поворот · растяжение · поворот" hint="A = U Σ Vᵀ">
      <div className="grid items-center gap-4 md:grid-cols-[1fr_1fr]">
        <Plane R={3}>
          {(X, Y) => (
            <>
              <polyline points={ring.map((p) => `${X(p[0])},${Y(p[1])}`).join(" ")} fill={C.accent} fillOpacity={0.12} stroke={C.accent} strokeWidth={2} />
              <Arrow to={tf([1, 0])} color={C.amber} X={X} Y={Y} />
              <Arrow to={tf([0, 1])} color={C.blue} X={X} Y={Y} />
            </>
          )}
        </Plane>
        <div className="grid gap-3">
          <Slider label="Этап" value={t} min={0} max={3} step={0.02} onChange={setT} display={stage} />
          <Metrics className="sm:grid-cols-2">
            <Metric label="σ₁" value={f2(s1)} tone="accent" />
            <Metric label="σ₂" value={f2(s2)} />
          </Metrics>
          <div className="text-[13px] leading-relaxed text-dim">
            Единичный круг под действием любой матрицы становится эллипсом. Полуоси эллипса — сингулярные числа σ₁ ≥ σ₂, их направления — столбцы U, а прообразы — столбцы V. Сделай этап 3 — и получишь ровно то же, что даёт умножение на A.
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ══ Low-rank: картинка из k сингулярных векторов ══════════════

const IMG_N = 28;
function makeImage() {
  const img: number[][] = [];
  for (let y = 0; y < IMG_N; y++) {
    const row: number[] = [];
    for (let x = 0; x < IMG_N; x++) {
      const cx = x - 13.5;
      const cy = y - 13.5;
      const r = Math.hypot(cx, cy);
      // кольцо + диагональ + буква «T»
      let v = 0.12;
      if (Math.abs(r - 10) < 2) v = 0.9;
      if (Math.abs(x - y) < 1.5) v = Math.max(v, 0.6);
      if (y >= 6 && y <= 8 && x >= 7 && x <= 20) v = 1;
      if (x >= 12 && x <= 15 && y >= 6 && y <= 21) v = 1;
      row.push(v);
    }
    img.push(row);
  }
  return img;
}
function topSingular(A: number[][], k: number) {
  const n = A.length;
  const M = A.map((r) => [...r]);
  const comps: { s: number; u: number[]; v: number[] }[] = [];
  for (let c = 0; c < k; c++) {
    let v = Array.from({ length: n }, (_, i) => Math.sin(i * 1.7 + c) + 1.1);
    let s = 0;
    let u: number[] = [];
    for (let it = 0; it < 60; it++) {
      u = M.map((r) => r.reduce((a, x, j) => a + x * v[j], 0));
      const un = Math.hypot(...u) || 1;
      u = u.map((x) => x / un);
      v = Array.from({ length: n }, (_, j) => M.reduce((a, r, i) => a + r[j] * u[i], 0));
      s = Math.hypot(...v) || 1;
      v = v.map((x) => x / s);
    }
    comps.push({ s, u, v });
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) M[i][j] -= s * u[i] * v[j];
  }
  return comps;
}

export function LowRank() {
  const img = useMemo(makeImage, []);
  const comps = useMemo(() => topSingular(img, 14), [img]);
  const [k, setK] = useState(3);
  const approx = useMemo(() => {
    const out = Array.from({ length: IMG_N }, () => Array(IMG_N).fill(0) as number[]);
    for (const c of comps.slice(0, k)) for (let i = 0; i < IMG_N; i++) for (let j = 0; j < IMG_N; j++) out[i][j] += c.s * c.u[i] * c.v[j];
    return out;
  }, [comps, k]);
  const energy = comps.slice(0, k).reduce((a, c) => a + c.s * c.s, 0) / img.flat().reduce((a, x) => a + x * x, 0);
  const Pic = ({ data }: { data: number[][] }) => (
    <div className="grid gap-0 overflow-hidden rounded-lg" style={{ gridTemplateColumns: `repeat(${IMG_N}, minmax(0, 1fr))` }}>
      {data.flat().map((v, i) => (
        <div key={i} className="aspect-square" style={{ background: `rgba(198,243,107,${Math.max(0, Math.min(1, v))})` }} />
      ))}
    </div>
  );
  const stored = k * (2 * IMG_N + 1);
  return (
    <Frame title="Сжатие: оставить k сингулярных компонент" hint={`матрица ${IMG_N}×${IMG_N}`}>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-mute">оригинал</div>
          <Pic data={img} />
        </div>
        <div>
          <div className="mb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-mute">ранг {k}</div>
          <Pic data={approx} />
        </div>
      </div>
      <div className="mt-4">
        <Slider label="k — сколько компонент оставить" value={k} min={1} max={14} onChange={setK} />
      </div>
      <Metrics className="mt-3">
        <Metric label="энергии сохранено" value={`${(energy * 100).toFixed(1)}%`} tone="accent" />
        <Metric label="чисел хранить" value={`${stored} из ${IMG_N * IMG_N}`} tone={stored < IMG_N * IMG_N ? "ok" : "bad"} />
        <Metric label="σ₁" value={f2(comps[0].s)} />
        <Metric label={`σ${k}`} value={f2(comps[k - 1].s)} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Каждая компонента — внешнее произведение σ·u·vᵀ, то есть «полосатая» матрица ранга 1. По теореме Эккарта–Янга сумма первых k — лучшее приближение ранга k. Так же работают PCA, рекомендательные системы и LoRA, которая учит поправку весов малого ранга.
      </p>
    </Frame>
  );
}

// ══ Доли: Байес на 1000 людях ════════════════════════════════

export function BayesGrid() {
  const [prev, setPrev] = useState(1);
  const [sens, setSens] = useState(99);
  const [spec, setSpec] = useState(95);
  const N = 1000;
  const sick = Math.round((prev / 100) * N);
  const tp = Math.round(sick * (sens / 100));
  const fp = Math.round((N - sick) * (1 - spec / 100));
  const ppv = tp / Math.max(1, tp + fp);
  const cells = Array.from({ length: N }, (_, i) => (i < tp ? "tp" : i < sick ? "fn" : i < sick + fp ? "fp" : "tn"));
  const color: Record<string, string> = { tp: C.accent, fn: "color-mix(in oklab, var(--color-accent) 30%, transparent)", fp: C.rose, tn: "var(--color-raised)" };
  return (
    <Frame title="Тест положительный. Ты болен?" hint="1000 человек">
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider label="Болеет (априори)" value={prev} min={0.1} max={30} step={0.1} onChange={setPrev} display={`${prev}%`} />
        <Slider label="Чувствительность" value={sens} min={50} max={100} onChange={setSens} display={`${sens}%`} />
        <Slider label="Специфичность" value={spec} min={50} max={100} step={0.5} onChange={setSpec} display={`${spec}%`} />
      </div>
      <div className="mt-4 grid gap-[2px]" style={{ gridTemplateColumns: "repeat(50, minmax(0, 1fr))" }}>
        {cells.map((c, i) => (
          <div key={i} className="aspect-square rounded-[1px]" style={{ background: color[c] }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-mute">
        <span><span className="mr-1 inline-block size-2.5 rounded-sm align-middle" style={{ background: C.accent }} />болен, тест +: {tp}</span>
        <span><span className="mr-1 inline-block size-2.5 rounded-sm align-middle" style={{ background: C.rose }} />здоров, тест +: {fp}</span>
      </div>
      <Metrics className="mt-3 sm:grid-cols-2">
        <Metric label="P(болен | тест +)" value={`${(ppv * 100).toFixed(1)}%`} tone={ppv < 0.5 ? "bad" : "ok"} />
        <Metric label="положительных всего" value={tp + fp} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        P(A|B) = P(B|A)·P(A) / P(B). Когда болезнь редкая, ложноположительных среди огромного числа здоровых больше, чем истинно больных. Та же ловушка — у детектора мошенничества с точностью 99% на редких событиях.
      </p>
    </Frame>
  );
}
