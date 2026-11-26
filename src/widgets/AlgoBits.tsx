import { useMemo, useState } from "react";
import { Segmented } from "../ui/Segmented";
import { Slider } from "../ui/Field";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Log, Metric, Metrics, StepControls, usePlayer } from "./kit";

// ── Скользящее окно: самая длинная подстрока без повторов ────

const STR = "abcabcbbxyzwab";

interface W {
  l: number;
  r: number;
  last: Record<string, number>;
  best: { l: number; len: number };
  log: string[];
  ops: number;
}
const w0 = (): W => ({ l: 0, r: 0, last: {}, best: { l: 0, len: 0 }, log: [], ops: 0 });

function wstep(w: W): W {
  if (w.r >= STR.length) return w;
  const c = STR[w.r];
  let l = w.l;
  const log = [...w.log];
  if (w.last[c] !== undefined && w.last[c] >= l) {
    l = w.last[c] + 1;
    log.push(`'${c}' уже в окне на ${w.last[c]} → левый край прыгает на ${l}`);
  } else log.push(`'${c}' новая → окно растёт вправо`);
  const last = { ...w.last, [c]: w.r };
  const len = w.r - l + 1;
  const best = len > w.best.len ? { l, len } : w.best;
  if (best !== w.best) log[log.length - 1] += ` · рекорд ${len}: "${STR.slice(l, w.r + 1)}"`;
  return { l, r: w.r + 1, last, best, log, ops: w.ops + 1 };
}

export function SlidingWindow() {
  const [w, setW] = useState(w0);
  const done = w.r >= STR.length;
  const player = usePlayer(() => {
    if (done) return false;
    setW(wstep(w));
    return true;
  }, 700);
  const n = STR.length;
  return (
    <Frame
      title="Скользящее окно"
      hint="длиннейшая подстрока без повторов"
      controls={<StepControls onStep={() => setW(wstep(w))} onReset={() => { player.stop(); setW(w0()); }} canStep={!done} player={player} />}
    >
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {STR.split("").map((ch, i) => {
          const inWin = i >= w.l && i < w.r;
          const inBest = i >= w.best.l && i < w.best.l + w.best.len;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className={cx(
                  "flex h-10 w-full items-center justify-center rounded-lg border font-mono text-[15px] transition",
                  inWin ? "border-accent bg-accent/15 text-ink" : i < w.r ? "border-line text-mute" : "border-line-strong text-dim",
                  done && inBest && "border-ok bg-ok/15 text-ok",
                )}
              >
                {ch}
              </div>
              <div className="h-4 font-mono text-[10px] text-accent">{!done && (i === w.l ? "l" : i === w.r - 1 ? "r" : "")}</div>
            </div>
          );
        })}
      </div>
      <Metrics className="mt-3">
        <Metric label="окно" value={`[${w.l}, ${w.r})`} />
        <Metric label="лучшее" value={w.best.len} tone="accent" />
        <Metric label="шагов окна" value={w.ops} tone="ok" />
        <Metric label="наивно, подстрок" value={(n * (n + 1)) / 2} tone="bad" />
      </Metrics>
      <div className="mt-3 flex flex-wrap gap-1.5 font-mono text-[11.5px]">
        <span className="text-mute">last =</span>
        {Object.entries(w.last).map(([k, v]) => (
          <span key={k} className={cx("rounded border px-1.5", v >= w.l ? "border-accent/40 text-ink" : "border-line text-mute")}>
            {k}:{v}
          </span>
        ))}
      </div>
      <Log className="mt-3" lines={w.log} max={3} empty="Правый край идёт по одному символу. Левый только прыгает вперёд — поэтому каждый индекс трогаем O(1) раз." />
    </Frame>
  );
}

// ── Сложность: что влезет в секунду ───────────────────────────

const CLASSES: { id: string; f: (n: number) => number; color: string }[] = [
  { id: "O(1)", f: () => 1, color: C.ok },
  { id: "O(log n)", f: (n) => Math.log2(n), color: C.ok },
  { id: "O(n)", f: (n) => n, color: C.teal },
  { id: "O(n log n)", f: (n) => n * Math.log2(n), color: C.blue },
  { id: "O(n²)", f: (n) => n * n, color: C.amber },
  { id: "O(n³)", f: (n) => n ** 3, color: C.rose },
  { id: "O(2ⁿ)", f: (n) => 2 ** n, color: C.bad },
  { id: "O(n!)", f: (n) => (n > 170 ? Infinity : Array.from({ length: n }, (_, i) => i + 1).reduce((a, b) => a * b, 1)), color: C.bad },
];

const fmtTime = (s: number) => {
  if (!Number.isFinite(s) || s > 3.15e7 * 1e6) return "вечность";
  if (s >= 3.15e7) return `${(s / 3.15e7).toPrecision(2)} лет`;
  if (s >= 86400) return `${(s / 86400).toPrecision(2)} дн`;
  if (s >= 3600) return `${(s / 3600).toPrecision(2)} ч`;
  if (s >= 60) return `${(s / 60).toPrecision(2)} мин`;
  if (s >= 1) return `${s.toPrecision(2)} с`;
  if (s >= 1e-3) return `${(s * 1e3).toPrecision(2)} мс`;
  if (s >= 1e-6) return `${(s * 1e6).toPrecision(2)} мкс`;
  return `${Math.max(1, Math.round(s * 1e9))} нс`;
};
const fmtN = (n: number) => (n >= 1e9 ? `${+(n / 1e9).toPrecision(2)}·10⁹` : n >= 1e6 ? `${+(n / 1e6).toPrecision(2)} млн` : n >= 1e3 ? `${+(n / 1e3).toPrecision(2)} тыс` : `${Math.round(n)}`);

export function Growth() {
  const [exp, setExp] = useState(5);
  const [lang, setLang] = useState<"fast" | "py">("fast");
  const n = Math.round(10 ** exp);
  const speed = lang === "fast" ? 1e8 : 1e7;
  return (
    <Frame
      title="Что успеет за секунду"
      hint={lang === "fast" ? "≈10⁸ простых операций/с" : "≈10⁷ операций/с"}
      controls={
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Slider label="Размер входа n" value={exp} min={1} max={9} step={0.25} onChange={setExp} display={fmtN(n)} />
          <Segmented
            value={lang}
            onChange={setLang}
            options={[
              { value: "fast", label: "Java / C++ / Go" },
              { value: "py", label: "Python" },
            ]}
          />
        </div>
      }
    >
      <div className="grid gap-1.5">
        {CLASSES.map((c) => {
          const ops = c.f(n);
          const t = ops / speed;
          const ok = t <= 1;
          const width = Number.isFinite(ops) ? Math.min(100, (Math.log10(Math.max(1, ops)) / 18) * 100) : 100;
          return (
            <div key={c.id} className="grid grid-cols-[78px_1fr_86px] items-center gap-2 sm:grid-cols-[92px_1fr_110px]">
              <span className="font-mono text-[12.5px] text-ink">{c.id}</span>
              <div className="h-5 overflow-hidden rounded-md bg-raised">
                <div className="h-full rounded-md transition-all duration-300" style={{ width: `${Math.max(1.5, width)}%`, background: c.color, opacity: ok ? 0.85 : 0.45 }} />
              </div>
              <span className={cx("text-right font-mono text-[12px]", ok ? "text-ok" : "text-bad")}>{fmtTime(t)}</span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-[12px] text-mute">Полоса — число операций в логарифмической шкале. Зелёным — уложится в секунду.</div>
      <div className="mt-4 overflow-x-auto rounded-xl border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-bg/50 text-mute">
            <tr>
              <th className="px-3 py-1.5 text-left font-normal">Если n до…</th>
              <th className="px-3 py-1.5 text-left font-normal">ищи решение</th>
            </tr>
          </thead>
          <tbody className="font-mono text-[12.5px] text-dim">
            {[
              ["10–12", "O(n!) — перебор перестановок"],
              ["20–25", "O(2ⁿ) — перебор подмножеств, битмаски"],
              ["500", "O(n³) — Флойд, DP по отрезкам"],
              ["5 000–10⁴", "O(n²) — DP на двух строках"],
              ["10⁵–10⁶", "O(n log n) — сортировка, куча, бинпоиск"],
              ["10⁷–10⁸", "O(n) — один проход, два указателя"],
              ["больше", "O(log n) или O(1) — математика"],
            ].map(([a, b]) => (
              <tr key={a} className="border-t border-line">
                <td className="whitespace-nowrap px-3 py-1.5 text-ink">{a}</td>
                <td className="px-3 py-1.5">{b}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

// ── DP-таблица: наибольшая общая подпоследовательность ────────

const A = "ABCBDAB";
const B = "BDCABA";

export function LcsTable() {
  const rows = A.length + 1;
  const cols = B.length + 1;
  const full = useMemo(() => {
    const d = Array.from({ length: rows }, () => Array(cols).fill(0) as number[]);
    for (let i = 1; i < rows; i++) for (let j = 1; j < cols; j++) d[i][j] = A[i - 1] === B[j - 1] ? d[i - 1][j - 1] + 1 : Math.max(d[i - 1][j], d[i][j - 1]);
    return d;
  }, [rows, cols]);
  const total = (rows - 1) * (cols - 1);
  const [k, setK] = useState(0); // сколько клеток заполнено
  const done = k >= total;
  const player = usePlayer(() => {
    if (k >= total) return false;
    setK(k + 1);
    return true;
  }, 260);
  const cur = k > 0 ? { i: Math.floor((k - 1) / (cols - 1)) + 1, j: ((k - 1) % (cols - 1)) + 1 } : null;
  const filled = (i: number, j: number) => i === 0 || j === 0 || (i - 1) * (cols - 1) + (j - 1) < k;

  // восстановление ответа
  const path = new Set<string>();
  let lcs = "";
  if (done) {
    let i = rows - 1;
    let j = cols - 1;
    while (i > 0 && j > 0) {
      if (A[i - 1] === B[j - 1]) {
        path.add(`${i},${j}`);
        lcs = A[i - 1] + lcs;
        i--;
        j--;
      } else if (full[i - 1][j] >= full[i][j - 1]) i--;
      else j--;
    }
  }
  const explain = cur
    ? A[cur.i - 1] === B[cur.j - 1]
      ? `A[${cur.i - 1}] = B[${cur.j - 1}] = '${A[cur.i - 1]}' → диагональ + 1 = ${full[cur.i][cur.j]}`
      : `'${A[cur.i - 1]}' ≠ '${B[cur.j - 1]}' → max(сверху ${full[cur.i - 1][cur.j]}, слева ${full[cur.i][cur.j - 1]}) = ${full[cur.i][cur.j]}`
    : "dp[i][j] = длина LCS префиксов A[:i] и B[:j]. Нулевые строка и столбец — пустой префикс.";

  return (
    <Frame
      title="DP-таблица: LCS"
      hint={`A = ${A}, B = ${B}`}
      controls={<StepControls onStep={() => setK(k + 1)} onReset={() => { player.stop(); setK(0); }} canStep={!done} player={player} stepLabel="Клетка" />}
    >
      <div className="overflow-x-auto">
        <table className="mx-auto border-separate border-spacing-[3px] font-mono text-[13px]">
          <thead>
            <tr>
              <th />
              <th className="w-9 text-mute">∅</th>
              {B.split("").map((c, j) => (
                <th key={j} className={cx("w-9", cur?.j === j + 1 ? "text-amber" : "text-dim")}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }, (_, i) => (
              <tr key={i}>
                <th className={cx("w-7 pr-1 text-right", cur?.i === i ? "text-amber" : i ? "text-dim" : "text-mute")}>{i ? A[i - 1] : "∅"}</th>
                {Array.from({ length: cols }, (_, j) => {
                  const isCur = cur?.i === i && cur?.j === j;
                  const isDep = cur && ((i === cur.i - 1 && j === cur.j - 1) || (i === cur.i - 1 && j === cur.j) || (i === cur.i && j === cur.j - 1));
                  const onPath = path.has(`${i},${j}`);
                  return (
                    <td
                      key={j}
                      className={cx(
                        "h-9 w-9 rounded-md border text-center transition",
                        onPath ? "border-ok bg-ok/20 text-ok" : isCur ? "border-amber bg-amber/20 text-ink" : isDep && !done ? "border-blue/60 bg-blue/10 text-ink" : filled(i, j) ? "border-line text-ink" : "border-line/50 text-transparent",
                        (i === 0 || j === 0) && "text-mute",
                      )}
                    >
                      {filled(i, j) ? full[i][j] : "·"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={cx("mt-3 rounded-xl border px-3.5 py-2.5 font-mono text-[12.5px]", done ? "border-ok/40 bg-ok/10 text-ok" : "border-line bg-bg/40 text-dim")}>
        {done ? `Готово: LCS = "${lcs}", длина ${full[rows - 1][cols - 1]}. Восстановили, идя из угла назад по диагоналям совпадений.` : explain}
      </div>
      <div className="mt-2 text-[12px] text-mute">Синие клетки — от чего зависит текущая. Порядок заполнения (по строкам) гарантирует, что они уже посчитаны.</div>
    </Frame>
  );
}
