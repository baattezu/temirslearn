import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Legend, Log, Metric, Metrics, rng, StepControls, usePlayer } from "./kit";

// ══ Spring: транзакционный прокси ═══════════════════════════

type Box = "ctrl" | "proxy" | "svc" | "audit";
interface SpStep {
  at: Box;
  from?: Box;
  line: string;
  tx: string[];
  db: string[];
  note: string;
  bad?: boolean;
}
interface SpScenario {
  id: string;
  title: string;
  code: string[];
  steps: SpStep[];
}
const SP: SpScenario[] = [
  {
    id: "ok",
    title: "Вызов снаружи",
    code: ["@Service class OrderService {", "  @Transactional", "  public void place(Order o) {", "    orders.save(o);", "    stock.decrement(o);", "  }", "}"],
    steps: [
      { at: "ctrl", line: "controller: orderService.place(o)", tx: [], db: [], note: "В контроллер внедрён не OrderService, а его прокси (CGLIB-подкласс), созданный Spring." },
      { at: "proxy", from: "ctrl", line: "TransactionInterceptor: getTransaction(REQUIRED)", tx: ["T1"], db: [], note: "Прокси видит @Transactional, берёт соединение из пула, делает BEGIN и привязывает транзакцию к потоку (ThreadLocal)." },
      { at: "svc", from: "proxy", line: "target.place(o): save + decrement", tx: ["T1"], db: ["INSERT order (T1)", "UPDATE stock (T1)"], note: "Настоящий метод. Все репозитории берут то же соединение из ThreadLocal — работают в T1." },
      { at: "proxy", from: "svc", line: "метод вернулся без исключения → commit", tx: [], db: ["INSERT order ✓", "UPDATE stock ✓"], note: "Прокси делает COMMIT и возвращает соединение в пул." },
    ],
  },
  {
    id: "self",
    title: "Self-invocation",
    code: ["@Service class OrderService {", "  public void process(Order o) {", "    validate(o);", "    this.place(o);   // ← мимо прокси", "  }", "  @Transactional", "  public void place(Order o) { … }", "}"],
    steps: [
      { at: "ctrl", line: "controller: orderService.process(o)", tx: [], db: [], note: "Вызываем метод без @Transactional." },
      { at: "proxy", from: "ctrl", line: "у process нет @Transactional → просто делегирую", tx: [], db: [], note: "Прокси ничего не открывает." },
      { at: "svc", from: "proxy", line: "this.place(o)", tx: [], db: [], note: "Внутри объекта this — это сам объект, а не прокси. Вызов place не проходит через перехватчик — аннотация не работает.", bad: true },
      { at: "svc", line: "save → autocommit; decrement → исключение", tx: [], db: ["INSERT order (autocommit ✓)", "UPDATE stock ✗"], note: "Каждый запрос в своей автотранзакции. Заказ сохранился, остаток — нет. Данные несогласованы.", bad: true },
    ],
  },
  {
    id: "checked",
    title: "Checked exception",
    code: ["@Transactional", "public void importFile(Path p) throws IOException {", "  rows.saveAll(parse(p));", "  archive(p);  // бросает IOException", "}"],
    steps: [
      { at: "ctrl", line: "controller: importFile(p)", tx: [], db: [], note: "Вызов снаружи — через прокси." },
      { at: "proxy", from: "ctrl", line: "BEGIN", tx: ["T1"], db: [], note: "Транзакция открыта." },
      { at: "svc", from: "proxy", line: "saveAll + archive → IOException", tx: ["T1"], db: ["INSERT ×1000 (T1)"], note: "Метод бросил checked-исключение." },
      { at: "proxy", from: "svc", line: "IOException — не RuntimeException → COMMIT!", tx: [], db: ["INSERT ×1000 ✓ закоммичены"], note: "По умолчанию Spring откатывает только RuntimeException и Error. На checked — коммит. Нужно @Transactional(rollbackFor = Exception.class).", bad: true },
    ],
  },
  {
    id: "new",
    title: "REQUIRES_NEW",
    code: ["@Transactional", "public void pay(Payment p) {", "  payments.save(p);", "  audit.log(p);       // REQUIRES_NEW в другом бине", "  gateway.charge(p);  // падает", "}"],
    steps: [
      { at: "proxy", from: "ctrl", line: "pay(): BEGIN T1", tx: ["T1"], db: [], note: "Внешняя транзакция." },
      { at: "svc", from: "proxy", line: "payments.save", tx: ["T1"], db: ["INSERT payment (T1)"], note: "Пишем в T1." },
      { at: "audit", from: "svc", line: "audit.log → прокси AuditService: REQUIRES_NEW", tx: ["T1 (приостановлена)", "T2"], db: ["INSERT payment (T1)", "INSERT audit (T2)"], note: "T1 приостановлена, взято ВТОРОЕ соединение из пула, открыта T2." },
      { at: "svc", from: "audit", line: "audit вернулся → COMMIT T2", tx: ["T1"], db: ["INSERT payment (T1)", "INSERT audit ✓"], note: "Аудит закоммичен независимо." },
      { at: "proxy", from: "svc", line: "charge бросил RuntimeException → ROLLBACK T1", tx: [], db: ["INSERT payment ✗ откат", "INSERT audit ✓ остался"], note: "Платёж откатился, запись аудита — нет. Так и задумано. Но помни: REQUIRES_NEW занимает второе соединение — при маленьком пуле это путь к взаимоблокировке пула." },
    ],
  },
];

export function SpringProxy() {
  const [id, setId] = useState("ok");
  const sc = SP.find((s) => s.id === id)!;
  const [i, setI] = useState(0);
  const s = sc.steps[Math.min(i, sc.steps.length - 1)];
  const boxes: { id: Box; title: string; sub: string }[] = [
    { id: "ctrl", title: "Controller", sub: "вызывающий" },
    { id: "proxy", title: "Прокси", sub: "TransactionInterceptor" },
    { id: "svc", title: "OrderService", sub: "настоящий объект" },
    ...(id === "new" ? [{ id: "audit" as Box, title: "AuditService", sub: "через свой прокси" }] : []),
  ];
  return (
    <Frame
      title="@Transactional: что делает прокси"
      hint="шаг за шагом"
      controls={
        <div className="grid gap-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
            {SP.map((x) => (
              <Chip key={x.id} active={x.id === id} onClick={() => { setId(x.id); setI(0); }}>
                {x.title}
              </Chip>
            ))}
          </div>
          <StepControls onStep={() => setI(i + 1)} onBack={() => setI(i - 1)} canBack={i > 0} canStep={i < sc.steps.length - 1} onReset={() => setI(0)} />
        </div>
      }
    >
      <div className={cx("grid gap-2", boxes.length === 4 ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-3")}>
        {boxes.map((b) => (
          <div
            key={b.id}
            className={cx(
              "rounded-xl border px-2.5 py-2 text-center transition",
              s.at === b.id ? (s.bad ? "border-bad bg-bad/10" : "border-accent bg-accent/10") : s.from === b.id ? "border-blue/50" : "border-line",
            )}
          >
            <div className="text-[13px] font-medium text-ink">{b.title}</div>
            <div className="font-mono text-[10px] text-mute">{b.sub}</div>
          </div>
        ))}
      </div>
      <div className={cx("mt-2 rounded-lg px-3 py-1.5 font-mono text-[12px]", s.bad ? "bg-bad/10 text-bad" : "bg-raised text-ink")}>→ {s.line}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1.2fr_1fr]">
        <pre className="overflow-x-auto rounded-xl border border-line bg-bg/60 px-3 py-2 font-mono text-[11.5px] leading-[1.65] text-dim">{sc.code.join("\n")}</pre>
        <div className="grid content-start gap-2">
          <div>
            <Caption>Транзакции потока</Caption>
            <div className="flex min-h-8 flex-wrap gap-1">
              {s.tx.length ? s.tx.map((t) => <span key={t} className="rounded-md bg-violet/15 px-2 py-1 font-mono text-[11.5px] text-violet">{t}</span>) : <span className="font-mono text-[11.5px] text-mute">нет</span>}
            </div>
          </div>
          <div>
            <Caption>База</Caption>
            <div className="grid gap-1">
              {s.db.length ? s.db.map((d) => <span key={d} className={cx("font-mono text-[11.5px]", d.includes("✗") ? "text-bad" : d.includes("✓") ? "text-ok" : "text-dim")}>{d}</span>) : <span className="font-mono text-[11.5px] text-mute">—</span>}
            </div>
          </div>
        </div>
      </div>
      <p className="mt-3 rounded-xl border border-line bg-bg/40 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-dim">{s.note}</p>
    </Frame>
  );
}

// ══ Гонка на counter++ ══════════════════════════════════════

type RMode = "plain" | "sync" | "cas";
interface Th {
  pc: number;
  r: number | null;
  done: number;
  retries: number;
}
interface RS {
  mem: number;
  t: [Th, Th];
  lock: number | null;
  log: string[];
}
const r0 = (): RS => ({ mem: 0, t: [{ pc: 0, r: null, done: 0, retries: 0 }, { pc: 0, r: null, done: 0, retries: 0 }], lock: null, log: [] });
const ITERS = 2;

function rstep(s0: RS, k: 0 | 1, mode: RMode): RS {
  const s: RS = structuredClone(s0);
  const th = s.t[k];
  const name = `T${k + 1}`;
  if (th.done >= ITERS) return s;
  if (mode === "cas") {
    if (th.pc === 0) {
      th.r = s.mem;
      th.pc = 1;
      s.log.push(`${name}: expected = counter (${th.r})`);
    } else {
      if (s.mem === th.r) {
        s.mem = th.r! + 1;
        th.done++;
        th.pc = 0;
        s.log.push(`${name}: CAS(${th.r} → ${th.r! + 1}) успех — атомарная инструкция lock cmpxchg`);
      } else {
        th.retries++;
        th.pc = 0;
        s.log.push(`${name}: CAS(${th.r} → ${th.r! + 1}) НЕУДАЧА: counter уже ${s.mem}. Повтор`);
      }
    }
    return s;
  }
  if (mode === "sync" && th.pc === 0) {
    if (s.lock !== null && s.lock !== k) {
      s.log.push(`${name}: монитор занят T${s.lock + 1} — поток блокируется`);
      return s;
    }
    s.lock = k;
  }
  if (th.pc === 0) {
    th.r = s.mem;
    th.pc = 1;
    s.log.push(`${name}: r = counter (${th.r})${mode === "sync" ? " — внутри synchronized" : ""}`);
  } else if (th.pc === 1) {
    th.r = th.r! + 1;
    th.pc = 2;
    s.log.push(`${name}: r = r + 1 (${th.r}) — в регистре`);
  } else {
    s.mem = th.r!;
    th.pc = 0;
    th.done++;
    s.log.push(`${name}: counter = r (${th.r})`);
    if (mode === "sync") s.lock = null;
  }
  return s;
}

export function RaceViz() {
  const [mode, setMode] = useState<RMode>("plain");
  const [s, setS] = useState(r0);
  const done = s.t.every((t) => t.done >= ITERS);
  const OPS = mode === "cas" ? ["expected = counter", "CAS(expected, expected+1)"] : ["r = counter", "r = r + 1", "counter = r"];
  const blocked = (k: number) => mode === "sync" && s.lock !== null && s.lock !== k && s.t[k].pc === 0;
  return (
    <Frame
      title="Гонка: два потока делают counter++ по 2 раза"
      hint="ты — планировщик ОС"
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <Segmented<RMode>
            value={mode}
            onChange={(m) => {
              setMode(m);
              setS(r0());
            }}
            block
            options={[
              { value: "plain", label: "count++" },
              { value: "sync", label: "synchronized" },
              { value: "cas", label: "AtomicInteger" },
            ]}
          />
          <Button onClick={() => setS(r0())}>Сначала</Button>
        </div>
      }
    >
      <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-3">
        {([0, 1] as const).map((k) => (
          <div key={k} className={cx("rounded-xl border p-3", k === 1 && "col-start-3", blocked(k) ? "border-amber/50" : "border-line")}>
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2">
              <span className="font-mono text-[13px] text-ink">T{k + 1}</span>
              <span className="whitespace-nowrap font-mono text-[11px] text-mute">
                r = {s.t[k].r ?? "—"} · {s.t[k].done}/{ITERS}
              </span>
            </div>
            <div className="grid gap-1">
              {OPS.map((op, j) => (
                <div key={j} className={cx("rounded-md px-2 py-1 font-mono text-[11.5px]", s.t[k].pc === j && s.t[k].done < ITERS ? "bg-accent/15 text-ink" : "text-mute")}>
                  {op}
                </div>
              ))}
            </div>
            <Button variant="primary" size="sm" block className="mt-2" disabled={s.t[k].done >= ITERS} onClick={() => setS(rstep(s, k, mode))}>
              {blocked(k) ? "ждёт монитор" : `шаг T${k + 1}`}
            </Button>
            {mode === "cas" && s.t[k].retries > 0 && <div className="mt-1 text-center font-mono text-[11px] text-amber">повторов: {s.t[k].retries}</div>}
          </div>
        ))}
        <div className="col-start-2 row-start-1 flex flex-col items-center justify-center self-center rounded-xl border border-line-strong bg-raised px-3 py-3">
          <span className="font-mono text-[10px] uppercase text-mute">counter</span>
          <span className="font-mono text-[26px] font-semibold text-ink">{s.mem}</span>
          {mode === "sync" && <span className="mt-1 font-mono text-[10px] text-mute">монитор: {s.lock === null ? "свободен" : `T${s.lock + 1}`}</span>}
        </div>
      </div>
      {done && (
        <div className={cx("mt-3 rounded-xl border px-3.5 py-2.5 text-[13.5px]", s.mem === 4 ? "border-ok/40 bg-ok/10 text-ok" : "border-bad/40 bg-bad/10 text-bad")}>
          {s.mem === 4 ? "counter = 4 — все инкременты на месте." : `counter = ${s.mem}, а должно быть 4: инкременты потеряны. Оба потока прочитали одно значение и записали одно и то же.`}
        </div>
      )}
      <Log className="mt-3" lines={s.log} max={4} empty="Попробуй: шаг T1, шаг T2, шаг T1, шаг T2… — перемешай потоки посреди инкремента." />
    </Frame>
  );
}

// ══ Конвейер процессора ═════════════════════════════════════

const STAGES = ["IF", "ID", "EX", "MEM", "WB"];
const STAGE_COLOR = [C.blue, C.violet, C.accent, C.amber, C.teal];
const PROG = ["ld  r1, [a]", "add r2, r1, 4", "mul r3, r4, r5", "cmp r3, 0; jne L", "sub r6, r6, 1", "add r7, r7, 1", "L: or r8, r8, r9"];

export function Pipeline() {
  const [mispredict, setMis] = useState(false);
  const [hazard, setHazard] = useState(false);
  const [forward, setForward] = useState(true);
  // расписание: для каждой инструкции — цикл начала и список стадий с задержками
  const rows = useMemo(() => {
    const out: { ins: string; cells: (string | null)[]; flushed?: boolean }[] = [];
    let fetch = 0;
    const take = mispredict ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 6];
    for (let k = 0; k < take.length; k++) {
      const idx = take[k];
      const cells: (string | null)[] = Array(20).fill(null);
      let stall = 0;
      // add r2, r1 зависит от ld r1: без forwarding ждёт WB (3 пузыря), с forwarding из MEM — 1 пузырь
      if (hazard && idx === 1) stall = forward ? 1 : 2;
      const flushed = mispredict && (idx === 4 || idx === 5);
      let c = fetch;
      cells[c] = "IF";
      c++;
      for (let st = 0; st < stall; st++) cells[c++] = "··";
      for (let sIdx = 1; sIdx < 5; sIdx++) {
        if (flushed && sIdx >= 2) break;
        cells[c++] = STAGES[sIdx];
      }
      out.push({ ins: PROG[idx], cells, flushed });
      fetch += 1 + stall;
      // после неверно предсказанного перехода (решается в EX инструкции 3) правильная ветка начинается после сброса
      if (mispredict && idx === 5) fetch = Math.max(fetch, out[3].cells.indexOf("EX") + 1);
    }
    return out;
  }, [mispredict, hazard, forward]);
  const last = Math.max(...rows.map((r) => r.cells.lastIndexOf(r.cells.filter(Boolean).at(-1)!)));
  const cycles = last + 1;
  const useful = rows.filter((r) => !r.flushed).length;
  return (
    <Frame title="Конвейер: 5 стадий" hint="каждый столбец — такт">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Toggle checked={hazard} onChange={setHazard} label="add ждёт результат ld" />
        {hazard && <Toggle checked={forward} onChange={setForward} label="Forwarding" />}
        <Toggle checked={mispredict} onChange={setMis} label="Переход предсказан неверно" />
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="border-separate border-spacing-[2px] font-mono text-[11px]">
          <thead>
            <tr>
              <th />
              {Array.from({ length: cycles }, (_, c) => (
                <th key={c} className="w-8 text-center font-normal text-mute">{c + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => (
              <tr key={k}>
                <td className={cx("whitespace-nowrap pr-2", r.flushed ? "text-bad line-through" : "text-dim")}>{r.ins}</td>
                {Array.from({ length: cycles }, (_, c) => {
                  const v = r.cells[c];
                  const si = v ? STAGES.indexOf(v) : -1;
                  return (
                    <td key={c} className="h-7 w-8 rounded text-center" style={{ background: v === "··" ? "color-mix(in oklab, var(--color-bad) 18%, transparent)" : si >= 0 ? `color-mix(in oklab, ${STAGE_COLOR[si]} ${r.flushed ? 12 : 30}%, transparent)` : undefined, color: si >= 0 ? C.ink : C.bad }}>
                      {v === "··" ? "○" : v ?? ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend className="mt-2" items={[...STAGES.map((s, i) => ({ color: STAGE_COLOR[i], label: s })), { color: C.bad, label: "пузырь / сброс" }]} />
      <Metrics className="mt-3">
        <Metric label="тактов" value={cycles} />
        <Metric label="полезных инструкций" value={useful} />
        <Metric label="CPI" value={(cycles / useful).toFixed(2)} tone={cycles / useful > 1.8 ? "bad" : "ok"} />
        <Metric label="идеал при ∞ длине" value="1.00" />
      </Metrics>
    </Frame>
  );
}

// ══ Сортировки ══════════════════════════════════════════════

type SAlgo = "insertion" | "merge" | "quick";
interface SFrame {
  a: number[];
  hl: number[];
  done: number[];
  cmp: number;
  wr: number;
}
function frames(algo: SAlgo, input: number[]): SFrame[] {
  const a = [...input];
  const out: SFrame[] = [];
  let cmp = 0;
  let wr = 0;
  const done = new Set<number>();
  const snap = (hl: number[]) => out.push({ a: [...a], hl, done: [...done], cmp, wr });
  if (algo === "insertion") {
    for (let i = 1; i < a.length; i++) {
      let j = i;
      while (j > 0) {
        cmp++;
        snap([j - 1, j]);
        if (a[j - 1] <= a[j]) break;
        [a[j - 1], a[j]] = [a[j], a[j - 1]];
        wr += 2;
        j--;
      }
    }
  } else if (algo === "merge") {
    for (let w = 1; w < a.length; w *= 2) {
      for (let lo = 0; lo < a.length; lo += 2 * w) {
        const mid = Math.min(lo + w, a.length);
        const hi = Math.min(lo + 2 * w, a.length);
        const L = a.slice(lo, mid);
        const R = a.slice(mid, hi);
        let i = 0;
        let j = 0;
        let k = lo;
        while (i < L.length || j < R.length) {
          if (i < L.length && j < R.length) cmp++;
          a[k] = j >= R.length || (i < L.length && L[i] <= R[j]) ? L[i++] : R[j++];
          wr++;
          snap([k]);
          k++;
        }
      }
    }
  } else {
    const qs = (lo: number, hi: number) => {
      if (lo >= hi) {
        if (lo === hi) done.add(lo);
        return;
      }
      const p = a[hi];
      let i = lo;
      for (let j = lo; j < hi; j++) {
        cmp++;
        snap([j, hi]);
        if (a[j] < p) {
          [a[i], a[j]] = [a[j], a[i]];
          wr += 2;
          i++;
        }
      }
      [a[i], a[hi]] = [a[hi], a[i]];
      wr += 2;
      done.add(i);
      snap([i]);
      qs(lo, i - 1);
      qs(i + 1, hi);
    };
    qs(0, a.length - 1);
  }
  out.push({ a: [...a], hl: [], done: a.map((_, i) => i), cmp, wr });
  return out;
}

export function SortViz() {
  const [algo, setAlgo] = useState<SAlgo>("quick");
  const [shape, setShape] = useState<"random" | "sorted" | "reversed">("random");
  const input = useMemo(() => {
    const r = rng(12);
    const base = Array.from({ length: 28 }, () => 2 + Math.floor(r() * 30));
    return shape === "random" ? base : shape === "sorted" ? [...base].sort((x, y) => x - y) : [...base].sort((x, y) => y - x);
  }, [shape]);
  const fr = useMemo(() => frames(algo, input), [algo, input]);
  const [i, setI] = useState(0);
  const f = fr[Math.min(i, fr.length - 1)];
  const player = usePlayer(() => {
    if (i >= fr.length - 1) return false;
    setI((x) => Math.min(fr.length - 1, x + Math.max(1, Math.floor(fr.length / 160))));
    return true;
  }, 40);
  const reset = () => {
    player.stop();
    setI(0);
  };
  return (
    <Frame
      title="Сортировки на одном массиве"
      hint="28 элементов"
      controls={
        <div className="grid gap-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <Segmented<SAlgo> value={algo} onChange={(a) => { setAlgo(a); reset(); }} block options={[{ value: "insertion", label: "Вставками" }, { value: "merge", label: "Слиянием" }, { value: "quick", label: "Быстрая" }]} />
            <Segmented value={shape} onChange={(s) => { setShape(s); reset(); }} block options={[{ value: "random", label: "Случайный" }, { value: "sorted", label: "Отсортир." }, { value: "reversed", label: "Обратный" }]} />
          </div>
          <StepControls onStep={() => setI(Math.min(fr.length - 1, i + 1))} onReset={reset} canStep={i < fr.length - 1} player={player} />
        </div>
      }
    >
      <div className="flex h-40 items-end gap-[3px]">
        {f.a.map((v, k) => (
          <div
            key={k}
            className="flex-1 rounded-t-[3px] transition-[height] duration-75"
            style={{ height: `${(v / 32) * 100}%`, background: f.hl.includes(k) ? C.amber : f.done.includes(k) && i > 0 ? C.accent : "var(--color-line-strong)" }}
          />
        ))}
      </div>
      <Metrics className="mt-4">
        <Metric label="сравнений" value={f.cmp} />
        <Metric label="записей" value={f.wr} />
        <Metric label="n log₂ n" value={Math.round(28 * Math.log2(28))} />
        <Metric label="n²/2" value={392} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {algo === "insertion"
          ? shape === "sorted"
            ? "На уже отсортированном вставки делают n−1 сравнение — O(n). Поэтому TimSort использует их для коротких и почти упорядоченных кусков."
            : "Каждый элемент «просачивается» влево до своего места — O(n²) в среднем, но очень быстро на маленьких и почти отсортированных массивах."
          : algo === "merge"
            ? "Сливаем отсортированные куски длиной 1, 2, 4… — всегда O(n log n), стабильна, но нужна дополнительная память O(n)."
            : shape === "random"
              ? "Опорный — последний элемент; разбиение ставит его на финальное место (зелёный). В среднем O(n log n), на месте, нестабильна."
              : "Опорный — последний элемент, а массив упорядочен: разбиения вырождаются, глубина n, сравнений ~n²/2. Поэтому pivot берут случайно или медианой из трёх."}
      </p>
    </Frame>
  );
}

// ══ Монотонный стек ═════════════════════════════════════════

const MS = [2, 7, 3, 5, 4, 6, 1, 8, 3];
export function MonoStack() {
  const steps = useMemo(() => {
    const res: number[] = Array(MS.length).fill(-1);
    const st: number[] = [];
    const out: { i: number; st: number[]; res: number[]; msg: string }[] = [];
    for (let i = 0; i < MS.length; i++) {
      const popped: number[] = [];
      while (st.length && MS[st[st.length - 1]] < MS[i]) {
        const j = st.pop()!;
        res[j] = MS[i];
        popped.push(j);
      }
      st.push(i);
      out.push({ i, st: [...st], res: [...res], msg: popped.length ? `${MS[i]} больше вершин стека → для ${popped.map((j) => MS[j]).join(", ")} ответ ${MS[i]}; кладём ${MS[i]}` : `${MS[i]} не больше вершины — просто кладём` });
    }
    return out;
  }, []);
  const [k, setK] = useState(-1);
  const s = k >= 0 ? steps[k] : null;
  return (
    <Frame
      title="Монотонный стек: следующий больший"
      hint="каждый индекс входит и выходит один раз"
      controls={<StepControls onStep={() => setK(k + 1)} onBack={() => setK(k - 1)} canBack={k >= 0} canStep={k < steps.length - 1} onReset={() => setK(-1)} />}
    >
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${MS.length}, minmax(0, 1fr))` }}>
        {MS.map((v, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className={cx("flex h-10 w-full items-center justify-center rounded-lg border font-mono text-[15px]", s?.i === i ? "border-amber bg-amber/15 text-ink" : s?.st.includes(i) ? "border-blue/60 bg-blue/10 text-ink" : "border-line text-dim")}>{v}</div>
            <div className={cx("font-mono text-[12px]", s && s.res[i] !== -1 ? "text-accent" : "text-mute")}>{s ? (s.res[i] === -1 ? "·" : s.res[i]) : "·"}</div>
          </div>
        ))}
      </div>
      <div className="mt-1 text-right font-mono text-[10.5px] text-mute">нижняя строка — ответ (−1, если правее нет большего)</div>
      <div className="mt-3 flex items-end gap-3">
        <Caption className="mb-0 shrink-0">Стек</Caption>
        <div className="flex min-h-10 flex-1 items-end gap-1 rounded-xl border border-line bg-bg/40 p-1.5">
          {(s?.st ?? []).map((j) => (
            <span key={j} className="rounded-md bg-blue/20 px-2 py-1 font-mono text-[12px] text-ink">{MS[j]}</span>
          ))}
          {s && <span className="ml-auto font-mono text-[10.5px] text-mute">← вершина</span>}
        </div>
      </div>
      <p className="mt-3 rounded-xl border border-line bg-bg/40 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-dim">{s?.msg ?? "Стек хранит индексы, для которых ответ ещё не найден. Значения в нём убывают снизу вверх — поэтому «монотонный»."}</p>
    </Frame>
  );
}
