import { useMemo, useState } from "react";
import { Slider, Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Legend, Metric, Metrics, StepControls } from "./kit";

// ══ Градиентный спуск на вытянутой «долине» ═══════════════════

type Opt = "sgd" | "momentum" | "adam";
// f(x, y) = 0.5·(x² + 12·y²) — вытянутая чаша, плюс лёгкий наклон: минимум в (0,0)
const LOSS = (x: number, y: number) => 0.5 * (x * x + 12 * y * y);
const GRAD = (x: number, y: number): [number, number] => [x, 12 * y];

function run(opt: Opt, lr: number, steps = 60) {
  let x = -4.5;
  let y = 1.6;
  let vx = 0;
  let vy = 0;
  let mx = 0;
  let my = 0;
  let sx = 0;
  let sy = 0;
  const pts: [number, number][] = [[x, y]];
  for (let t = 1; t <= steps; t++) {
    const [gx, gy] = GRAD(x, y);
    if (opt === "sgd") {
      x -= lr * gx;
      y -= lr * gy;
    } else if (opt === "momentum") {
      vx = 0.9 * vx + gx;
      vy = 0.9 * vy + gy;
      x -= lr * vx;
      y -= lr * vy;
    } else {
      mx = 0.9 * mx + 0.1 * gx;
      my = 0.9 * my + 0.1 * gy;
      sx = 0.999 * sx + 0.001 * gx * gx;
      sy = 0.999 * sy + 0.001 * gy * gy;
      const mhx = mx / (1 - 0.9 ** t);
      const mhy = my / (1 - 0.9 ** t);
      const shx = sx / (1 - 0.999 ** t);
      const shy = sy / (1 - 0.999 ** t);
      x -= (lr * 3 * mhx) / (Math.sqrt(shx) + 1e-8);
      y -= (lr * 3 * mhy) / (Math.sqrt(shy) + 1e-8);
    }
    if (!Number.isFinite(x) || Math.abs(x) > 1e3 || Math.abs(y) > 1e3) break;
    pts.push([x, y]);
  }
  return pts;
}

export function GradientDescent() {
  const [opt, setOpt] = useState<Opt>("sgd");
  const [lr, setLr] = useState(0.15);
  const [t, setT] = useState(60);
  const pts = useMemo(() => run(opt, lr), [opt, lr]);
  const shown = pts.slice(0, t + 1);
  const W = 520;
  const H = 260;
  const X = (x: number) => W / 2 + (x / 5.5) * (W / 2);
  const Y = (y: number) => H / 2 - (y / 2.2) * (H / 2);
  const last = shown[shown.length - 1];
  const diverged = pts.length < 61;
  const loss = LOSS(last[0], last[1]);
  return (
    <Frame title="Градиентный спуск" hint="L = ½(x² + 12y²): крутая по y, пологая по x">
      <div className="grid gap-3 sm:grid-cols-2">
        <Segmented<Opt>
          value={opt}
          onChange={setOpt}
          block
          options={[
            { value: "sgd", label: "SGD" },
            { value: "momentum", label: "Momentum" },
            { value: "adam", label: "Adam" },
          ]}
        />
        <Slider label="Learning rate" value={lr} min={0.01} max={0.18} step={0.005} onChange={setLr} display={lr.toFixed(3)} />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-4 block w-full rounded-xl border border-line bg-bg/50">
        {[0.5, 2, 5, 10, 20, 40].map((l) => (
          <ellipse key={l} cx={X(0)} cy={Y(0)} rx={X(Math.sqrt(2 * l)) - X(0)} ry={Y(0) - Y(Math.sqrt((2 * l) / 12))} fill="none" stroke={C.lineStrong} strokeOpacity={0.7} />
        ))}
        <circle cx={X(0)} cy={Y(0)} r={4} fill={C.ok} />
        <polyline points={shown.map((p) => `${X(p[0])},${Y(p[1])}`).join(" ")} fill="none" stroke={C.amber} strokeWidth={1.8} />
        {shown.map((p, i) => (
          <circle key={i} cx={X(p[0])} cy={Y(p[1])} r={i === shown.length - 1 ? 5 : 2} fill={C.amber} />
        ))}
      </svg>
      <div className="mt-3">
        <Slider label="Шагов" value={t} min={0} max={60} onChange={setT} />
      </div>
      <Metrics className="mt-3">
        <Metric label="loss" value={diverged && t >= pts.length - 1 ? "∞" : loss < 0.001 ? loss.toExponential(1) : loss.toFixed(3)} tone={loss < 0.01 ? "ok" : diverged ? "bad" : undefined} />
        <Metric label="x" value={last[0].toFixed(2)} />
        <Metric label="y" value={last[1].toFixed(2)} />
        <Metric label="статус" value={diverged ? "расходится" : loss < 0.01 ? "сошёлся" : "в пути"} tone={diverged ? "bad" : loss < 0.01 ? "ok" : "amber"} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {opt === "sgd"
          ? lr > 1 / 6
            ? "lr больше 2/12: по крутой оси y шаг перелетает минимум всё дальше — спуск расходится. Максимальный lr задаёт самая крутая ось."
            : lr * 12 > 1
              ? "По крутой оси y шаг перелетает дно и спуск скачет из стороны в сторону, а по пологой x ползёт. Один lr не подходит обоим направлениям."
              : "lr маленький: по крутой y всё хорошо, но по пологой x каждый шаг крошечный — уменьши lr ещё, и за 60 шагов не дойдёт. Один lr не подходит обоим направлениям."
          : opt === "momentum"
            ? "Инерция: колебания по y гасят друг друга, а движение по x накапливается. Как шар, скатывающийся по долине."
            : "Adam делит шаг на корень из среднего квадрата градиента — по каждой оси отдельно. Крутое направление получает меньший шаг, пологое — больший."}
      </p>
    </Frame>
  );
}

// ══ Backprop на графе вычислений ══════════════════════════════

// L = (w·x + b − y)²
export function Backprop() {
  const [w, setW] = useState(0.5);
  const x = 2;
  const b = 0.3;
  const y = 3;
  const [phase, setPhase] = useState(0); // 0 ничего, 1–4 вперёд, 5–9 назад
  const m = w * x;
  const z = m + b;
  const d = z - y;
  const L = d * d;
  const dL_dd = 2 * d;
  const dL_dz = dL_dd;
  const dL_dm = dL_dz;
  const dL_db = dL_dz;
  const dL_dw = dL_dm * x;
  const nodes: { id: string; label: string; x: number; y: number; val: number; grad: number; f: number; bk: number; rule: string }[] = [
    { id: "w", label: "w", x: 40, y: 50, val: w, grad: dL_dw, f: 1, bk: 9, rule: "∂L/∂w = ∂L/∂m · x" },
    { id: "x", label: "x", x: 40, y: 130, val: x, grad: NaN, f: 1, bk: 99, rule: "" },
    { id: "m", label: "m = w·x", x: 170, y: 90, val: m, grad: dL_dm, f: 2, bk: 8, rule: "∂L/∂m = ∂L/∂z · 1" },
    { id: "b", label: "b", x: 170, y: 180, val: b, grad: dL_db, f: 1, bk: 8, rule: "∂L/∂b = ∂L/∂z · 1" },
    { id: "z", label: "z = m + b", x: 300, y: 120, val: z, grad: dL_dz, f: 3, bk: 7, rule: "∂L/∂z = ∂L/∂d · 1" },
    { id: "y", label: "y", x: 300, y: 200, val: y, grad: NaN, f: 1, bk: 99, rule: "" },
    { id: "d", label: "d = z − y", x: 420, y: 150, val: d, grad: dL_dd, f: 4, bk: 6, rule: "∂L/∂d = 2d" },
    { id: "L", label: "L = d²", x: 530, y: 150, val: L, grad: 1, f: 5, bk: 5, rule: "∂L/∂L = 1" },
  ];
  const edges: [string, string, string][] = [
    ["w", "m", "×x"],
    ["x", "m", ""],
    ["m", "z", "×1"],
    ["b", "z", "×1"],
    ["z", "d", "×1"],
    ["y", "d", ""],
    ["d", "L", "×2d"],
  ];
  const N = Object.fromEntries(nodes.map((n) => [n.id, n]));
  const fwd = (n: (typeof nodes)[number]) => phase >= n.f;
  const bwd = (n: (typeof nodes)[number]) => phase >= n.bk;
  return (
    <Frame title="Backprop: цепное правило на графе" hint="x = 2, b = 0.3, y = 3">
      <div className="overflow-x-auto">
        <svg viewBox="0 0 600 230" className="block w-full min-w-[520px]">
          {edges.map(([a, bb, lab]) => {
            const A = N[a];
            const B = N[bb];
            const back = bwd(B) && Number.isFinite(A.grad) && phase >= A.bk;
            return (
              <g key={a + bb}>
                <line x1={A.x + 34} y1={A.y} x2={B.x - 34} y2={B.y} stroke={back ? C.rose : fwd(B) ? C.blue : C.lineStrong} strokeWidth={back || fwd(B) ? 2 : 1} />
                {lab && back && (
                  <text x={(A.x + B.x) / 2} y={(A.y + B.y) / 2 - 6} textAnchor="middle" fontSize={10} fill={C.rose} fontFamily="var(--font-mono)">
                    {lab}
                  </text>
                )}
              </g>
            );
          })}
          {nodes.map((n) => (
            <g key={n.id} transform={`translate(${n.x - 34} ${n.y - 22})`}>
              <rect width={68} height={44} rx={8} fill={C.raised} stroke={fwd(n) ? C.blue : C.lineStrong} />
              <text x={34} y={14} textAnchor="middle" fontSize={9.5} fill={C.mute} fontFamily="var(--font-mono)">
                {n.label}
              </text>
              <text x={34} y={28} textAnchor="middle" fontSize={11.5} fill={fwd(n) ? C.ink : C.mute} fontFamily="var(--font-mono)">
                {fwd(n) ? n.val.toFixed(2) : "?"}
              </text>
              {Number.isFinite(n.grad) && (
                <text x={34} y={40} textAnchor="middle" fontSize={10} fill={bwd(n) ? C.rose : "transparent"} fontFamily="var(--font-mono)">
                  ∂={n.grad.toFixed(2)}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <Slider label="w" value={w} min={-1} max={2} step={0.05} onChange={setW} />
        <StepControls onStep={() => setPhase(phase + 1)} onBack={() => setPhase(phase - 1)} canBack={phase > 0} canStep={phase < 9} onReset={() => setPhase(0)} stepLabel={phase < 5 ? "Вперёд" : "Назад ←"} />
      </div>
      <Legend className="mt-2" items={[{ color: C.blue, label: "прямой проход: значения" }, { color: C.rose, label: "обратный: ∂L/∂узел" }]} />
      <div className="mt-3 rounded-xl border border-line bg-bg/40 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-dim">
        {phase === 0 && "Прямой проход: считаем значения от входов к потере."}
        {phase > 0 && phase < 5 && "Каждый узел знает только свою локальную операцию."}
        {phase === 5 && `L = ${L.toFixed(3)}. Теперь назад: начинаем с ∂L/∂L = 1.`}
        {phase > 5 && phase < 9 && `Каждый узел умножает пришедший градиент на свою локальную производную: ${nodes.find((n) => n.bk === phase)?.rule ?? ""}.`}
        {phase >= 9 && (
          <>
            ∂L/∂w = {dL_dw.toFixed(2)}. Шаг спуска: w ← w − lr·{dL_dw.toFixed(2)} — {dL_dw > 0 ? "уменьшить" : "увеличить"} w. Один проход назад даёт градиенты по <b className="text-ink">всем</b> параметрам сразу — за ту же цену, что и прямой.
          </>
        )}
      </div>
    </Frame>
  );
}

// ══ Self-attention ════════════════════════════════════════════

const TOKENS = ["Кот", "не", "залез", "на", "шкаф", ",", "потому", "что", "он", "устал"];
// игрушечные 4-мерные Q/K: [животное, предмет, действие, местоимение-ищет-существительное]
const K: number[][] = [
  [2.2, 0, 0.2, 0.1],
  [0, 0, 0.3, 0],
  [0.2, 0, 1.6, 0],
  [0, 0.3, 0.2, 0],
  [0, 2.0, 0, 0.1],
  [0, 0, 0, 0],
  [0, 0, 0.4, 0],
  [0, 0, 0.3, 0],
  [0.4, 0, 0, 1.2],
  [0.6, 0, 1.4, 0],
];
const Q: number[][] = [
  [0.2, 0.3, 1.2, 0],
  [0, 0, 1.0, 0],
  [1.4, 1.0, 0.2, 0],
  [0, 1.2, 0.4, 0],
  [0.2, 0, 1.0, 0],
  [0, 0, 0.2, 0],
  [0, 0, 1.0, 0],
  [0, 0, 0.8, 0],
  [1.8, 0.7, 0.2, 0.3], // «он» ищет существительное — сильнее животное
  [1.6, 0, 0.3, 0.6],
];

export function AttentionViz() {
  const [qi, setQi] = useState(8);
  const [causal, setCausal] = useState(true);
  const [temp, setTemp] = useState(1);
  const d = 4;
  const scores = K.map((k, j) => (causal && j > qi ? -Infinity : Q[qi].reduce((a, q, t) => a + q * k[t], 0) / Math.sqrt(d) / temp));
  const mx = Math.max(...scores.filter(Number.isFinite));
  const ex = scores.map((s) => (Number.isFinite(s) ? Math.exp(s - mx) : 0));
  const sum = ex.reduce((a, b) => a + b, 0);
  const w = ex.map((e) => e / sum);
  const top = w.indexOf(Math.max(...w));
  return (
    <Frame title="Self-attention: на кого смотрит токен" hint="softmax(q·kᵀ / √d)">
      <Caption>Выбери токен-запрос</Caption>
      <div className="flex flex-wrap gap-1.5">
        {TOKENS.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setQi(i)}
            className={cx("relative overflow-hidden rounded-lg border px-2.5 py-1.5 text-[14px] transition", i === qi ? "border-amber text-ink" : causal && i > qi ? "border-line text-mute/50" : "border-line text-ink")}
          >
            <span className="absolute inset-0" style={{ background: C.accent, opacity: i === qi ? 0 : w[i] * 0.9 }} />
            <span className="relative">{t}</span>
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-1">
        {TOKENS.map((t, j) => (
          <div key={j} className="grid grid-cols-[72px_1fr_96px] items-center gap-2">
            <span className={cx("truncate text-[12.5px]", causal && j > qi ? "text-mute/50" : "text-dim")}>{t}</span>
            <div className="h-3.5 overflow-hidden rounded bg-raised">
              <div className="h-full rounded transition-all" style={{ width: `${w[j] * 100}%`, background: j === top ? C.accent : C.blue }} />
            </div>
            <span className="text-right font-mono text-[11px] text-mute">{Number.isFinite(scores[j]) ? `${scores[j].toFixed(2)} → ${(w[j] * 100).toFixed(0)}%` : "маска"}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 sm:items-end">
        <Slider label="Температура (делитель)" value={temp} min={0.25} max={3} step={0.05} onChange={setTemp} display={temp.toFixed(2)} />
        <Toggle checked={causal} onChange={setCausal} label="Каузальная маска (как в GPT)" />
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Каждый токен — вектор запроса q, ключа k и значения v (у нас — игрушечные 4-мерные). Вес внимания — softmax скалярных произведений q с ключами всех токенов. Выход токена — взвешенная сумма значений v. «он» должен смотреть на «Кот», а не на «шкаф» — это и есть разрешение кореференции, которое модель выучивает сама.
      </p>
    </Frame>
  );
}

// ══ Инференс LLM: память и скорость ══════════════════════════

const MODELS = {
  "8b": { label: "8B", params: 8e9, layers: 32, kvHeads: 8, headDim: 128 },
  "70b": { label: "70B", params: 70e9, layers: 80, kvHeads: 8, headDim: 128 },
  "405b": { label: "405B", params: 405e9, layers: 126, kvHeads: 8, headDim: 128 },
};
type MId = keyof typeof MODELS;

export function InferenceCalc() {
  const [mid, setMid] = useState<MId>("70b");
  const [bits, setBits] = useState(16);
  const [ctx, setCtx] = useState(32);
  const [batch, setBatch] = useState(8);
  const [gpus, setGpus] = useState(4);
  const m = MODELS[mid];
  const weights = (m.params * bits) / 8;
  // KV-кэш: 2 (K и V) × слои × KV-головы × размер головы × байт × токены × батч
  const kvPerToken = 2 * m.layers * m.kvHeads * m.headDim * 2;
  const kv = kvPerToken * ctx * 1024 * batch;
  const mem = 80e9 * gpus;
  const bw = 3.35e12 * gpus;
  // декодирование: на каждый шаг читаем все веса + KV-кэш; шаг даёт по токену каждому запросу в батче
  const stepTime = (weights + kv) / bw;
  const tps = batch / stepTime;
  const fits = weights + kv < mem * 0.9;
  const gb = (b: number) => `${(b / 1e9).toFixed(b < 10e9 ? 1 : 0)} ГБ`;
  return (
    <Frame title="Инференс LLM: влезет ли и как быстро" hint={`H100 80 ГБ × ${gpus}`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Segmented<MId> value={mid} onChange={setMid} block options={Object.entries(MODELS).map(([k, v]) => ({ value: k as MId, label: v.label }))} />
        <Segmented value={bits} onChange={setBits} block options={[{ value: 16, label: "bf16" }, { value: 8, label: "int8 / fp8" }, { value: 4, label: "int4" }]} />
        <Slider label="Контекст" value={ctx} min={1} max={128} onChange={setCtx} display={`${ctx}K токенов`} />
        <Slider label="Запросов в батче" value={batch} min={1} max={64} onChange={setBatch} />
        <Slider label="GPU" value={gpus} min={1} max={8} onChange={setGpus} />
      </div>
      <div className="mt-4">
        <div className="mb-1 flex justify-between font-mono text-[11px] text-mute">
          <span>память</span>
          <span>{gb(weights + kv)} из {gb(mem)}</span>
        </div>
        <div className="flex h-5 overflow-hidden rounded-md bg-raised">
          <div style={{ width: `${Math.min(100, (weights / mem) * 100)}%`, background: C.blue }} />
          <div style={{ width: `${Math.min(100, (kv / mem) * 100)}%`, background: C.amber }} />
        </div>
        <Legend className="mt-1.5" items={[{ color: C.blue, label: `веса ${gb(weights)}` }, { color: C.amber, label: `KV-кэш ${gb(kv)}` }]} />
      </div>
      <Metrics className="mt-3">
        <Metric label="влезает" value={fits ? "да" : "нет"} tone={fits ? "ok" : "bad"} />
        <Metric label="KV на токен" value={`${(kvPerToken / 1024).toFixed(0)} КБ`} />
        <Metric label="токенов/с на запрос" value={fits ? (1 / stepTime).toFixed(0) : "—"} tone="accent" />
        <Metric label="токенов/с всего" value={fits ? tps.toFixed(0) : "—"} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Оценка сверху по пропускной способности памяти: каждый шаг генерации читает все веса и весь KV-кэш. Поэтому квантизация ускоряет почти пропорционально, а батчинг почти бесплатно умножает общую пропускную способность — пока KV-кэш не съест память. GQA (8 KV-голов вместо 64) уже уменьшает кэш в 8 раз.
      </p>
    </Frame>
  );
}
