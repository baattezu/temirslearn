import { useMemo, useState } from "react";
import { Slider } from "../ui/Field";
import { MathText } from "../ui/MathText";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Metric, Metrics, StepControls, useHistory, usePlayer } from "./kit";

// ── JVM: байткод на стековой машине ─────────────────────────────────
// Байткод — настоящий вывод `javap -c` (javac 17) для метода ниже.

const JAVA_SRC = `static int sumSq(int[] xs) {
    int s = 0;
    for (int x : xs)
        if (x % 2 == 0) s += x * x;
    return s;
}`;

type Ins = { pc: number; op: string; arg?: number; arg2?: number; note: string };
const CODE: Ins[] = [
  { pc: 0, op: "iconst_0", note: "положить константу 0 на стек" },
  { pc: 1, op: "istore_1", note: "снять со стека → локальная 1 (s = 0)" },
  { pc: 2, op: "aload_0", note: "ссылку на массив xs → стек" },
  { pc: 3, op: "astore_2", note: "→ локальная 2 (скрытая копия массива для for-each)" },
  { pc: 4, op: "aload_2", note: "массив → стек" },
  { pc: 5, op: "arraylength", note: "заменить массив его длиной" },
  { pc: 6, op: "istore_3", note: "→ локальная 3 (длина)" },
  { pc: 7, op: "iconst_0", note: "0 → стек" },
  { pc: 8, op: "istore", arg: 4, note: "→ локальная 4 (скрытый индекс i = 0)" },
  { pc: 10, op: "iload", arg: 4, note: "i → стек" },
  { pc: 12, op: "iload_3", note: "длина → стек" },
  { pc: 13, op: "if_icmpge", arg: 43, note: "снять два числа; если i ≥ длины — прыжок на 43 (выход из цикла)" },
  { pc: 16, op: "aload_2", note: "массив → стек" },
  { pc: 17, op: "iload", arg: 4, note: "i → стек" },
  { pc: 19, op: "iaload", note: "снять массив и i, положить xs[i]" },
  { pc: 20, op: "istore", arg: 5, note: "→ локальная 5 (x)" },
  { pc: 22, op: "iload", arg: 5, note: "x → стек" },
  { pc: 24, op: "iconst_2", note: "2 → стек" },
  { pc: 25, op: "irem", note: "снять два, положить x % 2" },
  { pc: 26, op: "ifne", arg: 37, note: "если остаток ≠ 0 (нечётное) — прыжок на 37, мимо сложения" },
  { pc: 29, op: "iload_1", note: "s → стек" },
  { pc: 30, op: "iload", arg: 5, note: "x → стек" },
  { pc: 32, op: "iload", arg: 5, note: "x → стек ещё раз" },
  { pc: 34, op: "imul", note: "снять два x, положить x * x" },
  { pc: 35, op: "iadd", note: "снять s и x*x, положить сумму" },
  { pc: 36, op: "istore_1", note: "→ локальная 1 (s)" },
  { pc: 37, op: "iinc", arg: 4, arg2: 1, note: "i += 1 прямо в локальной переменной, без стека" },
  { pc: 40, op: "goto", arg: 10, note: "назад к проверке условия цикла" },
  { pc: 43, op: "iload_1", note: "s → стек" },
  { pc: 44, op: "ireturn", note: "вернуть вершину стека вызывающему" },
];

type Val = number | "xs";
interface VM {
  pc: number;
  stack: Val[];
  locals: (Val | undefined)[];
  steps: number;
  done: boolean;
  ret?: number;
}
const ARR = [3, 4, 6];
const start = (): VM => ({ pc: 0, stack: [], locals: ["xs"], steps: 0, done: false });

function exec(vm: VM): VM {
  if (vm.done) return vm;
  const ins = CODE.find((c) => c.pc === vm.pc)!;
  const st = [...vm.stack];
  const lo = [...vm.locals];
  const idx = CODE.indexOf(ins);
  let next = CODE[idx + 1]?.pc ?? vm.pc;
  const num = () => st.pop() as number;
  const m = ins.op.match(/^(i|a)(load|store)(?:_(\d))?$/);
  if (m) {
    const n = m[3] !== undefined ? Number(m[3]) : ins.arg!;
    if (m[2] === "load") st.push(lo[n]!);
    else lo[n] = st.pop();
  } else if (ins.op.startsWith("iconst_")) st.push(Number(ins.op.slice(7)));
  else if (ins.op === "arraylength") {
    st.pop();
    st.push(ARR.length);
  } else if (ins.op === "iaload") {
    const i = num();
    st.pop();
    st.push(ARR[i]);
  } else if (ins.op === "irem") {
    const b = num();
    const a = num();
    st.push(a % b);
  } else if (ins.op === "imul") st.push(num() * num());
  else if (ins.op === "iadd") st.push(num() + num());
  else if (ins.op === "if_icmpge") {
    const b = num();
    const a = num();
    if (a >= b) next = ins.arg!;
  } else if (ins.op === "ifne") {
    if (num() !== 0) next = ins.arg!;
  } else if (ins.op === "iinc") lo[ins.arg!] = (lo[ins.arg!] as number) + ins.arg2!;
  else if (ins.op === "goto") next = ins.arg!;
  else if (ins.op === "ireturn") return { ...vm, stack: [], locals: lo, steps: vm.steps + 1, done: true, ret: num() };
  return { pc: next, stack: st, locals: lo, steps: vm.steps + 1, done: false };
}

const LOCAL_NAMES = ["xs", "s", "arr$", "len$", "i$", "x"];

export function BytecodeStepper() {
  const h = useHistory(start);
  const vm = h.cur;
  const player = usePlayer(() => {
    if (h.cur.done) return false;
    h.push(exec);
    return true;
  }, 450);
  const cur = CODE.find((c) => c.pc === vm.pc);

  return (
    <Frame
      title="Байткод на стековой машине"
      hint={`xs = [${ARR.join(", ")}]`}
      controls={<StepControls onStep={() => h.push(exec)} onBack={h.back} canBack={h.canBack} canStep={!vm.done} onReset={() => h.reset()} player={player} />}
    >
      <div className="grid gap-4 md:grid-cols-[1fr_1.15fr]">
        <div className="min-w-0">
          <Caption>исходник Java</Caption>
          <pre className="overflow-x-auto rounded-xl border border-line bg-bg p-3 font-mono text-[12px] leading-relaxed text-dim">{JAVA_SRC}</pre>
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-3">
            <div>
              <Caption>стек операндов</Caption>
              <div className="flex min-h-[132px] w-20 flex-col-reverse gap-1 rounded-xl border border-line bg-bg p-1.5">
                {vm.stack.map((v, i) => (
                  <div key={i} className={cx("anim-pop rounded-md py-1 text-center font-mono text-[13px]", i === vm.stack.length - 1 ? "bg-accent/20 text-ink" : "bg-raised text-dim")}>
                    {v === "xs" ? "&xs" : v}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Caption>локальные переменные</Caption>
              <div className="grid gap-1">
                {LOCAL_NAMES.map((n, i) => (
                  <div key={n} className="flex items-center gap-2 font-mono text-[12.5px]">
                    <span className="w-4 text-mute">{i}</span>
                    <span className="w-10 text-dim">{n}</span>
                    <span className={cx("min-w-10 rounded-md px-2 py-0.5", vm.locals[i] === undefined ? "text-line-strong" : "bg-raised text-ink")}>
                      {vm.locals[i] === undefined ? "—" : vm.locals[i] === "xs" ? "&xs" : vm.locals[i]}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <Caption>javap -c · {CODE.length} инструкций</Caption>
          <div className="max-h-[330px] overflow-y-auto rounded-xl border border-line bg-bg py-1 font-mono text-[12px]">
            {CODE.map((c) => (
              <div key={c.pc} className={cx("flex gap-3 px-3 py-[1px]", c.pc === vm.pc && !vm.done ? "bg-accent/15 text-ink" : "text-dim")}>
                <span className="w-6 text-right text-mute">{c.pc}</span>
                <span>
                  {c.op}
                  {c.arg !== undefined && <span className="text-blue"> {c.arg}{c.arg2 !== undefined ? `, ${c.arg2}` : ""}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-3 min-h-[40px] text-[13.5px] leading-relaxed text-dim">
        {vm.done ? (
          <span className="text-ok">
            ireturn → {vm.ret}. Метод вернул 4² + 6² = 52 за {vm.steps} инструкций. Теперь представь, что их миллиарды, — поэтому есть JIT.
          </span>
        ) : (
          <>
            <span className="font-mono text-ink">{cur?.op}</span> — {cur?.note}.
          </>
        )}
      </div>
    </Frame>
  );
}

/** Уровни исполнения HotSpot: интерпретатор → C1 → C2. Пороги примерные. */
export function JitTiers() {
  const [calls, setCalls] = useState(0);
  const tiers = [
    { at: 0, name: "Интерпретатор", tier: "tier 0", speed: 1, text: "Байткод исполняется инструкция за инструкцией. Заодно собирается профиль: какие ветки горячие, какие типы приходят." },
    { at: 200, name: "C1 + профилирование", tier: "tier 3", speed: 8, text: "Метод вызывали часто — быстрый компилятор C1 собирает машинный код без тяжёлых оптимизаций и продолжает профилировать." },
    { at: 5000, name: "C2", tier: "tier 4", speed: 30, text: "Метод горячий — C2 компилирует с агрессивными оптимизациями по профилю: инлайнинг, развёртка циклов, escape analysis, векторизация. Если допущение сломается (пришёл новый тип) — деоптимизация назад в интерпретатор." },
  ];
  const t = [...tiers].reverse().find((x) => calls >= x.at)!;
  return (
    <Frame title="JIT: как JVM разгоняет горячий код" hint="пороги HotSpot примерные">
      <Slider label="Сколько раз метод уже вызвали" value={calls} min={0} max={10000} step={50} onChange={setCalls} display={calls.toLocaleString("ru")} />
      <div className="mt-4 grid grid-cols-3 gap-2">
        {tiers.map((x) => (
          <div
            key={x.tier}
            className={cx("rounded-xl border p-2.5 transition", x === t ? "border-accent/60 bg-accent/10" : calls >= x.at ? "border-line text-mute" : "border-dashed border-line opacity-50")}
          >
            <div className="font-mono text-[10.5px] text-mute">{x.tier} · от {x.at}</div>
            <div className="text-[13px] font-medium text-ink">{x.name}</div>
          </div>
        ))}
      </div>
      <Metrics className="mt-3">
        <Metric label="скорость относительно интерпретатора" value={`×${t.speed}`} tone={t.speed > 10 ? "ok" : t.speed > 1 ? "amber" : undefined} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">{t.text}</p>
      <p className="mt-2 text-[12px] text-mute">Пороги учитывают и вызовы, и итерации циклов; множители скорости условные — порядок, а не замер.</p>
    </Frame>
  );
}

// ── Python: имена и объекты ────────────────────────────────────────

const PY_SNIPPETS = [
  { id: "int", label: "a = 256", lines: ["a = 256", "b = 256", "a is b"], result: "True", why: "CPython заранее создаёт объекты для целых от −5 до 256 и раздаёт одни и те же. Это деталь реализации, а не правило языка." },
  { id: "int2", label: "a = 1000", lines: ["a = 1000", "b = int('1000')", "a is b"], result: "False", why: "Вне кэша каждое вычисленное число — новый объект. `is` сравнивает идентичность объектов, `==` — значения. Числа сравнивай через `==`." },
  { id: "list", label: "b = a", lines: ["a = [1, 2]", "b = a", "b.append(3)", "a"], result: "[1, 2, 3]", why: "Присваивание не копирует: `b` — второе имя того же списка. Копия — `a.copy()` или `list(a)`." },
  { id: "default", label: "def f(x=[])", lines: ["def f(x=[]):", "    x.append(1); return x", "f(); f()"], result: "[1, 1]", why: "Значение по умолчанию создаётся один раз при `def` и живёт в функции. Идиома: `x=None`, внутри `if x is None: x = []`." },
];

export function PyGotchas() {
  const [id, setId] = useState("list");
  const [shown, setShown] = useState(false);
  const s = PY_SNIPPETS.find((x) => x.id === id)!;
  const lines = useMemo(() => s.lines, [s]);
  return (
    <Frame title="Python: имена, а не коробки" hint="сначала угадай результат">
      <Segmented
        size="sm"
        value={id}
        onChange={(v) => {
          setId(v);
          setShown(false);
        }}
        options={PY_SNIPPETS.map((x) => ({ value: x.id, label: x.label }))}
        className="max-w-full overflow-x-auto"
      />
      <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-bg p-3 font-mono text-[13px] leading-relaxed text-ink">
        {lines.map((l, i) => (
          <div key={i}>
            <span className="select-none text-mute">{l.startsWith(" ") ? "... " : ">>> "}</span>
            {l}
          </div>
        ))}
        {shown && <div className="anim-fade" style={{ color: C.accent }}>{s.result}</div>}
      </pre>
      {!shown ? (
        <button type="button" onClick={() => setShown(true)} className="mt-3 h-9 rounded-xl border border-line px-3 text-[13px] text-dim hover:text-ink">
          Я угадал — показать
        </button>
      ) : (
        <p className="anim-fade mt-3 text-[13.5px] leading-relaxed text-dim"><MathText text={s.why} /></p>
      )}
    </Frame>
  );
}
