import { Pause, Play } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Chip } from "../ui/Chip";
import { Slider, Toggle } from "../ui/Field";
import { IconButton } from "../ui/Button";
import { Frame } from "./Frame";

type M = [number, number, number, number]; // [a, b, c, d] = [[a b], [c d]]

const PRESETS: { name: string; m: M }[] = [
  { name: "Единичная", m: [1, 0, 0, 1] },
  { name: "Поворот 45°", m: [0.71, -0.71, 0.71, 0.71] },
  { name: "Сдвиг", m: [1, 1, 0, 1] },
  { name: "Растяжение", m: [2, 0, 0, 0.5] },
  { name: "Отражение", m: [-1, 0, 0, 1] },
  { name: "Схлопывание", m: [1, 2, 0.5, 1] },
];

const R = 4.5; // видимая область: [-R, R]
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const round1 = (v: number) => Math.round(v * 10) / 10;

function eigen([a, b, c, d]: M) {
  const tr = a + d;
  const det = a * d - b * c;
  const disc = tr * tr - 4 * det;
  if (disc < -1e-9) return [];
  const s = Math.sqrt(Math.max(0, disc));
  const lambdas = disc < 1e-9 ? [tr / 2] : [(tr + s) / 2, (tr - s) / 2];
  return lambdas.map((l) => {
    let v: [number, number] = Math.abs(b) > 1e-9 ? [b, l - a] : Math.abs(c) > 1e-9 ? [l - d, c] : l === a ? [1, 0] : [0, 1];
    const n = Math.hypot(...v) || 1;
    v = [v[0] / n, v[1] / n];
    return { l, v };
  });
}

export function MatrixPlayground() {
  const [m, setM] = useState<M>([1, 1, 0, 1]);
  const [t, setT] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [showEigen, setShowEigen] = useState(true);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<"i" | "j" | null>(null);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 1400);
      setT(0.5 - Math.cos(p * Math.PI) / 2);
      if (p < 1) raf = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    setT(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const [a, b, c, d] = m;
  // текущая (интерполированная от единичной) матрица
  const cur: M = [lerp(1, a, t), lerp(0, b, t), lerp(0, c, t), lerp(1, d, t)];
  const ap = (x: number, y: number): [number, number] => [cur[0] * x + cur[1] * y, cur[2] * x + cur[3] * y];
  const det = a * d - b * c;
  const curDet = cur[0] * cur[3] - cur[1] * cur[2];
  const eig = eigen(m);

  // экранные координаты: y вверх
  const S = 40;
  const P = ([x, y]: [number, number]) => `${(x * S).toFixed(2)},${(-y * S).toFixed(2)}`;

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    if (!drag.current || !svg.current) return;
    const pt = svg.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const loc = pt.matrixTransform(svg.current.getScreenCTM()!.inverse());
    const x = round1(Math.max(-R, Math.min(R, loc.x / S)));
    const y = round1(Math.max(-R, Math.min(R, -loc.y / S)));
    setT(1);
    setM((prev) => (drag.current === "i" ? [x, prev[1], y, prev[3]] : [prev[0], x, prev[2], y]));
  };

  const lines = [];
  for (let k = -8; k <= 8; k++) {
    lines.push(<polyline key={`v${k}`} points={`${P(ap(k, -8))} ${P(ap(k, 8))}`} />);
    lines.push(<polyline key={`h${k}`} points={`${P(ap(-8, k))} ${P(ap(8, k))}`} />);
  }
  const square = [ap(0, 0), ap(1, 0), ap(1, 1), ap(0, 1)].map(P).join(" ");
  const iHat = ap(1, 0);
  const jHat = ap(0, 1);
  const set = (k: number, v: number) => setM((prev) => prev.map((x, i) => (i === k ? v : x)) as M);

  return (
    <Frame
      title="Матрица 2×2 как преобразование"
      hint="тяни концы векторов"
      controls={
        <div className="grid gap-4">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
            {PRESETS.map((p) => (
              <Chip
                key={p.name}
                active={p.m.every((v, i) => Math.abs(v - m[i]) < 1e-6)}
                onClick={() => {
                  setM(p.m);
                  setPlaying(false);
                  requestAnimationFrame(() => setPlaying(true));
                }}
              >
                {p.name}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3">
            <Slider label={<span className="text-accent">a · î.x</span>} value={a} min={-3} max={3} step={0.1} onChange={(v) => set(0, v)} display={a.toFixed(1)} />
            <Slider label={<span className="text-blue">b · ĵ.x</span>} value={b} min={-3} max={3} step={0.1} onChange={(v) => set(1, v)} display={b.toFixed(1)} />
            <Slider label={<span className="text-accent">c · î.y</span>} value={c} min={-3} max={3} step={0.1} onChange={(v) => set(2, v)} display={c.toFixed(1)} />
            <Slider label={<span className="text-blue">d · ĵ.y</span>} value={d} min={-3} max={3} step={0.1} onChange={(v) => set(3, v)} display={d.toFixed(1)} />
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <div className="flex min-w-[220px] flex-1 items-center gap-2">
              <IconButton label={playing ? "Пауза" : "Проиграть"} onClick={() => setPlaying((p) => !p)}>
                {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
              </IconButton>
              <div className="flex-1">
                <Slider label="Анимация I → A" value={t} min={0} max={1} step={0.01} onChange={(v) => { setPlaying(false); setT(v); }} display={`t = ${t.toFixed(2)}`} />
              </div>
            </div>
            <Toggle checked={showEigen} onChange={setShowEigen} label="Собственные векторы" />
          </div>
        </div>
      }
    >
      <div className="grid items-center gap-5 md:grid-cols-[1fr_200px]">
        <svg
          ref={svg}
          viewBox={`${-R * S} ${-R * S} ${2 * R * S} ${2 * R * S}`}
          className="mx-auto aspect-square w-full max-w-[440px] select-none rounded-xl bg-bg"
          onPointerMove={onMove}
          onPointerUp={() => (drag.current = null)}
          onPointerLeave={() => (drag.current = null)}
        >
          <g stroke="var(--color-line)" strokeWidth="1" opacity="0.6">
            {Array.from({ length: 2 * Math.ceil(R) + 1 }, (_, i) => i - Math.ceil(R)).map((k) => (
              <g key={k}>
                <line x1={k * S} x2={k * S} y1={-R * S} y2={R * S} />
                <line y1={k * S} y2={k * S} x1={-R * S} x2={R * S} />
              </g>
            ))}
          </g>
          <g stroke="var(--color-blue)" strokeOpacity="0.32" strokeWidth="1.2" fill="none">
            {lines}
          </g>
          <polygon
            points={square}
            fill={curDet >= 0 ? "var(--color-accent)" : "var(--color-rose)"}
            fillOpacity="0.16"
            stroke={curDet >= 0 ? "var(--color-accent)" : "var(--color-rose)"}
            strokeOpacity="0.5"
          />
          {showEigen && t > 0.98 &&
            eig.map((e, k) => (
              <line
                key={k}
                x1={-e.v[0] * R * 1.5 * S}
                y1={e.v[1] * R * 1.5 * S}
                x2={e.v[0] * R * 1.5 * S}
                y2={-e.v[1] * R * 1.5 * S}
                stroke="var(--color-amber)"
                strokeWidth="1.5"
                strokeDasharray="6 5"
              />
            ))}
          <line x1="0" y1="0" x2={iHat[0] * S} y2={-iHat[1] * S} stroke="var(--color-accent)" strokeWidth="3" strokeLinecap="round" />
          <line x1="0" y1="0" x2={jHat[0] * S} y2={-jHat[1] * S} stroke="var(--color-blue)" strokeWidth="3" strokeLinecap="round" />
          {(["i", "j"] as const).map((h) => {
            const [x, y] = h === "i" ? iHat : jHat;
            return (
              <g key={h} style={{ touchAction: "none", cursor: "grab" }}>
                <circle cx={x * S} cy={-y * S} r="16" fill="transparent"
                  onPointerDown={(e) => {
                    drag.current = h;
                    (e.target as Element).setPointerCapture?.(e.pointerId);
                  }}
                />
                <circle cx={x * S} cy={-y * S} r="6" fill={h === "i" ? "var(--color-accent)" : "var(--color-blue)"} pointerEvents="none" />
                <text x={x * S + 10} y={-y * S - 10} fontSize="15" fill={h === "i" ? "var(--color-accent)" : "var(--color-blue)"} pointerEvents="none" className="font-mono">
                  {h === "i" ? "î" : "ĵ"}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-1">
          <div className="rounded-xl border border-line bg-bg/50 p-3">
            <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-mute">Матрица A</div>
            <div className="flex items-center gap-2 font-mono text-[15px]">
              <span className="text-2xl font-light text-mute">[</span>
              <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 tabular-nums">
                <span className="text-accent">{a.toFixed(1)}</span>
                <span className="text-blue">{b.toFixed(1)}</span>
                <span className="text-accent">{c.toFixed(1)}</span>
                <span className="text-blue">{d.toFixed(1)}</span>
              </div>
              <span className="text-2xl font-light text-mute">]</span>
            </div>
          </div>
          <div className="rounded-xl border border-line bg-bg/50 p-3">
            <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-mute">det A = ad − bc</div>
            <div className={`font-mono text-xl tabular-nums ${Math.abs(det) < 1e-9 ? "text-amber" : det < 0 ? "text-rose" : "text-ink"}`}>{det.toFixed(2)}</div>
            <div className="mt-0.5 text-[12px] leading-snug text-mute">
              {Math.abs(det) < 1e-9 ? "площадь схлопнулась в 0" : det < 0 ? "ориентация перевернулась" : `площадь ×${Math.abs(det).toFixed(2)}`}
            </div>
          </div>
          <div className="col-span-2 rounded-xl border border-line bg-bg/50 p-3 md:col-span-1">
            <div className="mb-1 font-mono text-[11px] uppercase tracking-wider text-mute">Собственные значения</div>
            <div className="font-mono text-[14px] text-amber">
              {eig.length ? eig.map((e) => `λ = ${e.l.toFixed(2)}`).join("   ") : "комплексные"}
            </div>
            <div className="mt-0.5 text-[12px] leading-snug text-mute">
              {eig.length ? "пунктир: эти направления только растягиваются" : "нет реальных: A что-то поворачивает"}
            </div>
          </div>
        </div>
      </div>
    </Frame>
  );
}
