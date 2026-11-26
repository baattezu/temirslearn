import { useMemo, useState } from "react";
import { Input, Slider, Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Legend, Metric, Metrics } from "./kit";

// ══ volatile и регистр статуса ═══════════════════════════════

export function VolatilePoll() {
  const [vol, setVol] = useState(false);
  const [opt, setOpt] = useState<"O0" | "O2">("O2");
  const hoisted = !vol && opt === "O2";
  const asm = hoisted
    ? ["  ldr r1, [r0]        ; прочитать UART->SR ОДИН раз", "  tst r1, #RXNE", ".loop:", "  beq .loop           ; вечный цикл: значение не перечитывается"]
    : [".loop:", "  ldr r1, [r0]        ; читать UART->SR каждый оборот", "  tst r1, #RXNE", "  beq .loop", "  ldr r2, [r0, #4]    ; UART->DR"];
  // моделируем: флаг RXNE поднимается на 6-м такте
  const reads = Array.from({ length: 12 }, (_, t) => (hoisted ? t === 0 : true));
  const exitAt = hoisted ? null : 6;
  return (
    <Frame title="Ожидание байта по UART" hint="while (!(UART->SR & RXNE)) {}">
      <div className="grid gap-3 sm:grid-cols-2 sm:items-center">
        <Toggle checked={vol} onChange={setVol} label="регистр объявлен volatile" />
        <Segmented value={opt} onChange={setOpt} block options={[{ value: "O0", label: "-O0" }, { value: "O2", label: "-O2" }]} />
      </div>
      <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-bg/60 px-3 py-2 font-mono text-[12px] leading-[1.7] text-dim">{asm.join("\n")}</pre>
      <div className="mt-3 grid gap-[3px]" style={{ gridTemplateColumns: "repeat(12, minmax(0, 1fr))" }}>
        {reads.map((r, t) => (
          <div key={t} className="flex flex-col items-center gap-1">
            <div className="h-6 w-full rounded" style={{ background: t >= 6 ? "color-mix(in oklab, var(--color-ok) 35%, transparent)" : "var(--color-raised)" }} />
            <div className="h-5 w-full rounded" style={{ background: r && (exitAt === null || t <= exitAt) ? C.blue : "transparent", border: "1px dashed var(--color-line)" }} />
          </div>
        ))}
      </div>
      <Legend className="mt-2" items={[{ color: C.ok, label: "железо подняло RXNE (байт пришёл)" }, { color: C.blue, label: "CPU читает регистр" }]} />
      <div className={cx("mt-3 rounded-xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed", hoisted ? "border-bad/40 bg-bad/10 text-bad" : "border-ok/40 bg-ok/10 text-ok")}>
        {hoisted
          ? "Компилятор видит обычную переменную, которую никто в цикле не меняет, и выносит чтение из цикла. Байт пришёл, а программа висит. На -O0 «работало» — поэтому баг всплывает при сборке релиза."
          : "volatile запрещает компилятору кэшировать значение: каждое обращение в коде — реальное обращение к памяти. Цикл видит RXNE на 6-м такте и выходит."}
      </div>
    </Frame>
  );
}

// ══ Прерывание посреди чтения 16-битного счётчика ════════════

export function TornRead() {
  const [crit, setCrit] = useState(false);
  const [at, setAt] = useState(1);
  // 8-битный MCU: ticks = 0x00FF, ISR делает ticks++ → 0x0100. main читает ticks байтами: lo, потом hi.
  const steps = ["main: lo = ticks.lo", "main: hi = ticks.hi", "main: value = hi:lo"];
  const isrBefore = (k: number) => !crit && at === k;
  let lo = 0xff;
  let hi = 0x00;
  let mem = 0x00ff;
  const trace: { t: string; isr?: boolean }[] = [];
  if (crit) trace.push({ t: "cli — прерывания запрещены" });
  for (let k = 0; k < 3; k++) {
    if (isrBefore(k)) {
      mem = 0x0100;
      trace.push({ t: "ISR: ticks++ → 0x0100", isr: true });
    }
    if (k === 0) lo = mem & 0xff;
    if (k === 1) hi = mem >> 8;
    trace.push({ t: `${steps[k]}${k === 0 ? ` = 0x${lo.toString(16).padStart(2, "0")}` : k === 1 ? ` = 0x${hi.toString(16).padStart(2, "0")}` : ""}` });
  }
  if (crit) {
    trace.push({ t: "sei — прерывания разрешены" });
    trace.push({ t: "ISR (отложенное): ticks++ → 0x0100", isr: true });
  }
  const value = (hi << 8) | lo;
  const ok = value === 0x00ff || value === 0x0100;
  return (
    <Frame title="16-битный счётчик на 8-битном МК" hint="ISR таймера делает ticks++">
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <Slider label="Когда сработает прерывание" value={at} min={0} max={3} onChange={setAt} display={at === 3 ? "после чтения" : `перед шагом ${at + 1}`} />
        <Toggle checked={crit} onChange={setCrit} label="Критическая секция (запрет прерываний)" />
      </div>
      <div className="mt-3 grid gap-1">
        {trace.map((x, k) => (
          <div key={k} className={cx("rounded-md px-2.5 py-1 font-mono text-[12px]", x.isr ? "ml-6 bg-amber/15 text-amber" : "bg-raised text-ink")}>
            {x.t}
          </div>
        ))}
      </div>
      <Metrics className="mt-3 sm:grid-cols-2">
        <Metric label="прочитано" value={`0x${value.toString(16).padStart(4, "0")} = ${value}`} tone={ok ? "ok" : "bad"} />
        <Metric label="возможные честные значения" value="255 или 256" />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {ok
          ? "Значение согласованное: прерывание пришло до или после всего чтения."
          : "Рваное чтение: младший байт до прерывания (0xFF), старший — после (0x01). Получилось 0x01FF = 511 — значение, которого счётчик никогда не имел. volatile здесь не помогает: нужна атомарность — запрет прерываний на время чтения или двойное чтение до совпадения."}
      </p>
    </Frame>
  );
}

// ══ RTOS: инверсия приоритетов ════════════════════════════════

export function PriorityInversion() {
  const [inherit, setInherit] = useState(false);
  // L берёт мьютекс на такте 1. H приходит на 2-м и хочет тот же мьютекс. M (не связан с мьютексом) приходит на 3-м и работает 8 тактов.
  const timeline = useMemo(() => {
    const T = 24;
    const rows: Record<"H" | "M" | "L", string[]> = { H: Array(T).fill(""), M: Array(T).fill(""), L: Array(T).fill("") };
    let lWork = 6; // работа L (большая часть — под мьютексом)
    let mWork = 8;
    let hWork = 3;
    let lHas = false;
    let hDone = -1;
    for (let t = 0; t < T; t++) {
      const hReady = t >= 2 && hWork > 0;
      const mReady = t >= 3 && mWork > 0;
      const lReady = lWork > 0;
      if (t === 1) lHas = true;
      const hBlocked = hReady && lHas;
      const lPrio = inherit && hBlocked ? 3 : 1;
      // выбрать готовую задачу с наивысшим приоритетом
      const cands: { k: "H" | "M" | "L"; p: number }[] = [];
      if (hReady && !hBlocked) cands.push({ k: "H", p: 3 });
      if (mReady) cands.push({ k: "M", p: 2 });
      if (lReady) cands.push({ k: "L", p: lPrio });
      cands.sort((a, b) => b.p - a.p);
      const run = cands[0]?.k;
      if (hBlocked) rows.H[t] = "wait";
      if (run === "H") {
        rows.H[t] = "run";
        hWork--;
        if (hWork === 0) hDone = t;
      } else if (run === "M") {
        rows.M[t] = "run";
        mWork--;
      } else if (run === "L") {
        rows.L[t] = lPrio > 1 ? "boost" : lHas ? "lock" : "run";
        lWork--;
        if (lWork === 0) lHas = false;
      }
      if (mReady && run !== "M") rows.M[t] ||= "ready";
    }
    return { rows, hDone, T };
  }, [inherit]);
  const color: Record<string, string> = { run: C.accent, lock: C.violet, boost: C.amber, wait: C.bad, ready: "var(--color-raised)" };
  const deadline = 9;
  return (
    <Frame title="Инверсия приоритетов" hint="H — высокий, M — средний, L — низкий; L и H делят мьютекс">
      <Toggle checked={inherit} onChange={setInherit} label="Наследование приоритета (priority inheritance)" />
      <div className="mt-4 overflow-x-auto">
        <div className="min-w-[460px]">
          {(["H", "M", "L"] as const).map((k) => (
            <div key={k} className="mb-1 flex items-center gap-2">
              <span className="w-7 shrink-0 font-mono text-[12px] text-ink">{k}</span>
              <div className="grid flex-1 gap-[2px]" style={{ gridTemplateColumns: `repeat(${timeline.T}, minmax(0, 1fr))` }}>
                {timeline.rows[k].map((c, t) => (
                  <div key={t} className="h-6 rounded-[3px]" style={{ background: c ? color[c] : "transparent", opacity: c === "ready" ? 1 : 0.85, outline: t === deadline && k === "H" ? "2px dashed var(--color-rose)" : undefined }} />
                ))}
              </div>
            </div>
          ))}
          <div className="ml-[36px] flex justify-between font-mono text-[10px] text-mute">
            <span>0</span>
            <span>такты →</span>
            <span>{timeline.T}</span>
          </div>
        </div>
      </div>
      <Legend className="mt-2" items={[{ color: C.accent, label: "выполняется" }, { color: C.violet, label: "L держит мьютекс" }, { color: C.amber, label: "L с приоритетом H" }, { color: C.bad, label: "H ждёт мьютекс" }]} />
      <Metrics className="mt-3 sm:grid-cols-2">
        <Metric label="H закончил на такте" value={timeline.hDone + 1} tone={timeline.hDone < deadline ? "ok" : "bad"} />
        <Metric label="дедлайн H" value={deadline} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {inherit
          ? "Пока H ждёт мьютекс, L временно получает приоритет H: M не может его вытеснить, L быстро освобождает мьютекс, H успевает."
          : "H ждёт мьютекс у L, а L вытеснен средней задачей M, которая к мьютексу не относится. Высокоприоритетная задача фактически ждёт среднюю. Так в 1997 году перезагружался Mars Pathfinder — пока на нём не включили наследование приоритета."}
      </p>
    </Frame>
  );
}

// ══ UART: кадр на линии ═══════════════════════════════════════

export function UartFrame() {
  const [ch, setCh] = useState("K");
  const [parity, setParity] = useState(false);
  const [baud, setBaud] = useState(115200);
  const code = (ch.charCodeAt(0) || 0) & 0xff;
  const data = Array.from({ length: 8 }, (_, i) => (code >> i) & 1); // LSB первым
  const ones = data.reduce((a, b) => a + b, 0);
  const bits = [{ v: 0, label: "start" }, ...data.map((v, i) => ({ v, label: `d${i}` })), ...(parity ? [{ v: ones % 2, label: "parity" }] : []), { v: 1, label: "stop" }];
  const line = [{ v: 1, label: "idle" }, ...bits, { v: 1, label: "idle" }];
  const W = 540;
  const H = 60;
  const step = W / line.length;
  const path = line.map((b, i) => `${i === 0 ? "M" : "L"}${i * step} ${b.v ? 10 : H - 10} L${(i + 1) * step} ${b.v ? 10 : H - 10}`).join(" ");
  const bitUs = 1e6 / baud;
  return (
    <Frame title="UART: один байт на проводе" hint="8N1: старт, 8 бит данных, стоп">
      <div className="grid gap-3 sm:grid-cols-3 sm:items-end">
        <div>
          <div className="mb-1 text-[13px] text-dim">Символ</div>
          <Input value={ch} onChange={(e) => setCh(e.target.value.slice(-1) || " ")} className="h-10 font-mono" maxLength={2} />
        </div>
        <Segmented value={baud} onChange={setBaud} block options={[{ value: 9600, label: "9600" }, { value: 115200, label: "115200" }, { value: 1000000, label: "1M" }]} />
        <Toggle checked={parity} onChange={setParity} label="Бит чётности (8E1)" />
      </div>
      <svg viewBox={`0 0 ${W} ${H + 26}`} className="mt-4 block w-full">
        {line.map((b, i) => (
          <g key={i}>
            <rect x={i * step} y={0} width={step} height={H} fill={b.label.startsWith("d") ? "color-mix(in oklab, var(--color-accent) 6%, transparent)" : b.label === "start" || b.label === "stop" || b.label === "parity" ? "color-mix(in oklab, var(--color-blue) 8%, transparent)" : "transparent"} />
            <line x1={i * step} x2={i * step} y1={0} y2={H} stroke={C.line} />
            <text x={i * step + step / 2} y={H + 14} textAnchor="middle" fontSize={9.5} fill={C.mute} fontFamily="var(--font-mono)">
              {b.label}
            </text>
            {b.label !== "idle" && (
              <text x={i * step + step / 2} y={H / 2 + 4} textAnchor="middle" fontSize={11} fill={C.ink} fontFamily="var(--font-mono)">
                {b.v}
              </text>
            )}
          </g>
        ))}
        <path d={path} fill="none" stroke={C.amber} strokeWidth={2.2} />
      </svg>
      <Metrics className="mt-2">
        <Metric label="байт" value={`0x${code.toString(16).padStart(2, "0")} = ${code.toString(2).padStart(8, "0")}`} />
        <Metric label="бит на кадр" value={bits.length} />
        <Metric label="длительность бита" value={`${bitUs.toFixed(bitUs < 10 ? 2 : 1)} мкс`} />
        <Metric label="полезная скорость" value={`${Math.round(baud / bits.length / 1000 * 8)} кбит/с`} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Тактового провода нет: приёмник ловит спад стартового бита и дальше читает середину каждого бита по своим часам. Поэтому обе стороны должны договориться о скорости, а расхождение тактов больше ~2–3% даёт ошибки кадра. Биты идут младшим вперёд; на 10 бит линии приходится 8 бит данных.
      </p>
    </Frame>
  );
}
