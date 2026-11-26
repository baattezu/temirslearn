import { useMemo, useState } from "react";
import { useIsPhone } from "../lib/hooks";
import { Slider } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { Frame } from "./Frame";

// Упрощённая модель стоимости планировщика PostgreSQL (costsize.c):
// те же константы и та же интерполяция для bitmap heap scan, но без кэша и корреляции.
const SEQ_PAGE = 1.0;
const CPU_TUPLE = 0.01;
const CPU_INDEX_TUPLE = 0.005;
const CPU_OPERATOR = 0.0025;
const PAGE = 8192;

type Plan = "seq" | "index" | "bitmap";
const PLANS: { id: Plan; label: string; color: string }[] = [
  { id: "seq", label: "Seq Scan", color: "var(--color-amber)" },
  { id: "index", label: "Index Scan", color: "var(--color-blue)" },
  { id: "bitmap", label: "Bitmap Heap Scan", color: "var(--color-accent)" },
];

function costs(rows: number, width: number, sel: number, randomPage: number) {
  const perPage = Math.max(1, Math.floor((PAGE * 0.9) / (width + 28)));
  const T = Math.ceil(rows / perPage);
  const N = Math.max(1, rows * sel);
  const leafPages = Math.ceil(N / 350); // ~350 ссылок на лист B-tree
  const descent = Math.ceil(Math.log(rows) / Math.log(350)) * randomPage;

  const seq = T * SEQ_PAGE + rows * (CPU_TUPLE + CPU_OPERATOR);
  // без корреляции каждый кортеж — случайное чтение страницы кучи
  const index = descent + leafPages * randomPage + N * randomPage + N * (CPU_INDEX_TUPLE + CPU_TUPLE + CPU_OPERATOR);
  // bitmap: читает каждую нужную страницу один раз и по порядку
  const fetched = T * (1 - Math.exp(-N / T));
  const perPageCost = randomPage - (randomPage - SEQ_PAGE) * Math.sqrt(fetched / T);
  const bitmap = descent + leafPages * randomPage + N * CPU_INDEX_TUPLE + fetched * perPageCost + N * (CPU_TUPLE + CPU_OPERATOR);
  return { seq, index, bitmap, T, N };
}

const SEL_LABEL: Record<number, string> = { [-6]: "0.0001%", [-5]: "0.001%", [-4]: "0.01%", [-3]: "0.1%", [-2]: "1%", [-1]: "10%", 0: "100%" };

const trim0 = (s: string) => s.replace(/\.0(?=[A-Z]|$)/, "");
const fmtNum = (n: number): string =>
  trim0(
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(n >= 1e4 ? 0 : 1)}K` : `${Math.round(n)}`);
const fmtSel = (s: number) => (s >= 0.01 ? `${(s * 100).toFixed(s >= 0.1 ? 0 : 1)}%` : s >= 0.0001 ? `${(s * 100).toFixed(2)}%` : `${(s * 100).toFixed(4)}%`);

export function PlannerCost() {
  const [rowsExp, setRowsExp] = useState(6.7); // 10^6.7 ≈ 5M
  const [width, setWidth] = useState(120);
  const [selExp, setSelExp] = useState(-3); // 0.1%
  const [disk, setDisk] = useState<"hdd" | "ssd">("hdd");

  const phone = useIsPhone();
  const fs = phone ? 17 : 10.5;
  const rows = Math.round(10 ** rowsExp);
  const sel = 10 ** selExp;
  const rpc = disk === "hdd" ? 4 : 1.1;
  const now = costs(rows, width, sel, rpc);
  const best = (["seq", "index", "bitmap"] as Plan[]).reduce((a, b) => (now[a] <= now[b] ? a : b));

  // кривые по селективности 10^-6 .. 10^0
  const W = 560;
  const H = 220;
  const pad = { l: phone ? 62 : 46, r: 12, t: 10, b: phone ? 32 : 26 };
  const xs = useMemo(() => Array.from({ length: 121 }, (_, i) => -6 + (i * 6) / 120), []);
  const series = useMemo(() => xs.map((e) => costs(rows, width, 10 ** e, rpc)), [xs, rows, width, rpc]);
  const all = series.flatMap((c) => [c.seq, c.index, c.bitmap]);
  const yMin = Math.log10(Math.max(1, Math.min(...all)));
  const yMax = Math.log10(Math.max(...all));
  const X = (e: number) => pad.l + ((e + 6) / 6) * (W - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - (Math.log10(Math.max(1, v)) - yMin) / (yMax - yMin || 1)) * (H - pad.t - pad.b);

  // точка, где seq начинает выигрывать у лучшего индексного плана
  const crossIdx = series.findIndex((c) => c.seq < Math.min(c.index, c.bitmap));
  const cross = crossIdx >= 0 ? xs[crossIdx] : null;

  return (
    <Frame
      title="Планировщик: индекс или Seq Scan"
      hint="двигай селективность"
      controls={
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <Slider label="Строк в таблице" value={rowsExp} min={3} max={9} step={0.1} onChange={setRowsExp} display={fmtNum(rows)} />
          <Slider label="Ширина строки" value={width} min={16} max={2000} step={8} onChange={setWidth} display={`${width} B`} />
          <Slider
            label="Селективность WHERE (доля строк)"
            value={selExp}
            min={-6}
            max={0}
            step={0.05}
            onChange={setSelExp}
            display={`${fmtSel(sel)} · ${fmtNum(rows * sel)} строк`}
          />
          <div>
            <div className="mb-1.5 text-[13px] text-dim">
              Диск · <span className="font-mono text-ink">random_page_cost = {rpc}</span>
            </div>
            <Segmented
              value={disk}
              onChange={setDisk}
              block
              options={[
                { value: "hdd", label: "HDD (4.0, дефолт)" },
                { value: "ssd", label: "SSD (1.1)" },
              ]}
            />
          </div>
        </div>
      }
    >
      <div className="mb-4 grid grid-cols-3 gap-2">
        {PLANS.map((p) => (
          <div
            key={p.id}
            className="rounded-xl border px-3 py-2.5 transition"
            style={{
              borderColor: best === p.id ? p.color : "var(--color-line)",
              background: best === p.id ? `color-mix(in oklab, ${p.color} 10%, transparent)` : undefined,
            }}
          >
            <div className="truncate text-[12px]" style={{ color: p.color }}>
              {p.label}
            </div>
            <div className="font-mono text-[15px] tabular-nums text-ink sm:text-lg">{fmtNum(now[p.id])}</div>
            <div className="h-4 text-[11px] text-mute">{best === p.id ? "выберет планировщик" : ""}</div>
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Стоимость планов в зависимости от селективности">
        {[-6, -5, -4, -3, -2, -1, 0].map((e) => (
          <g key={e}>
            <line x1={X(e)} x2={X(e)} y1={pad.t} y2={H - pad.b} stroke="var(--color-line)" strokeWidth="1" />
            {(!phone || e % 2 === 0) && (
              <text x={X(e)} y={H - 6} textAnchor={e === -6 ? "start" : e === 0 ? "end" : "middle"} fontSize={fs} className="fill-mute font-mono">
                {SEL_LABEL[e]}
              </text>
            )}
          </g>
        ))}
        {Array.from({ length: Math.floor(yMax) - Math.ceil(yMin) + 1 }, (_, i) => Math.ceil(yMin) + i).map((p) => (
          <text key={p} x={pad.l - 6} y={Y(10 ** p) + fs / 3} textAnchor="end" fontSize={fs} className="fill-mute font-mono">
            {fmtNum(10 ** p)}
          </text>
        ))}
        {cross !== null && (
          <rect x={X(cross)} y={pad.t} width={X(0) - X(cross)} height={H - pad.t - pad.b} fill="var(--color-amber)" opacity="0.05" />
        )}
        {PLANS.map((p) => (
          <polyline
            key={p.id}
            fill="none"
            stroke={p.color}
            strokeWidth={best === p.id ? 2.5 : 1.5}
            strokeOpacity={best === p.id ? 1 : 0.55}
            points={series.map((c, i) => `${X(xs[i]).toFixed(1)},${Y(c[p.id]).toFixed(1)}`).join(" ")}
          />
        ))}
        <line x1={X(selExp)} x2={X(selExp)} y1={pad.t} y2={H - pad.b} stroke="var(--color-ink)" strokeDasharray="3 3" strokeWidth="1" />
        {PLANS.map((p) => (
          <circle key={p.id} cx={X(selExp)} cy={Y(now[p.id])} r="3.5" fill={p.color} />
        ))}
      </svg>
      <p className="mt-2 text-[13px] leading-relaxed text-mute">
        Таблица ≈ <span className="font-mono text-dim">{fmtNum(now.T)}</span> страниц по 8 КБ.{" "}
        {cross !== null ? (
          <>
            Seq Scan выигрывает, начиная примерно с <span className="font-mono text-amber">{fmtSel(10 ** cross)}</span> строк.
          </>
        ) : (
          <>Индекс выгоднее на всём диапазоне.</>
        )}{" "}
        Ось Y логарифмическая — единицы стоимости планировщика, не миллисекунды.
      </p>
    </Frame>
  );
}
