import { useMemo, useState } from "react";
import { Slider } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { Code } from "../ui/Compare";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Log, Metric, Metrics, StepControls, useHistory, usePlayer } from "./kit";

// ── Имена: один и тот же код, разные имена ─────────────────────────

const NAME_LEVELS = [
  {
    label: "Как вышло",
    code: `List<int[]> get(List<int[]> l) {
    List<int[]> r = new ArrayList<>();
    for (int[] x : l)
        if (x[0] == 4) r.add(x);
    return r;
}`,
    note: "Что такое l, x, x[0] и 4? Чтобы понять, придётся найти, кто вызывает функцию и что он передаёт.",
  },
  {
    label: "Говорящие имена",
    code: `List<int[]> getFlaggedCells(List<int[]> gameBoard) {
    List<int[]> flaggedCells = new ArrayList<>();
    for (int[] cell : gameBoard)
        if (cell[STATUS_VALUE] == FLAGGED) flaggedCells.add(cell);
    return flaggedCells;
}`,
    note: "Та же логика, но видно намерение: это игровое поле, ищем отмеченные клетки. Магические 0 и 4 стали константами.",
  },
  {
    label: "Тип вместо массива",
    code: `List<Cell> flaggedCells(List<Cell> board) {
    return board.stream()
        .filter(Cell::isFlagged)
        .toList();
}`,
    note: "Клетка стала классом с методом isFlagged — индекс STATUS_VALUE и константа спрятаны внутри. Код читается как фраза.",
  },
];

/** Пример из «Чистого кода» Роберта Мартина: та же функция с тремя уровнями именования. */
export function NameReveal() {
  const [lvl, setLvl] = useState(0);
  const l = NAME_LEVELS[lvl];
  return (
    <Frame title="Имя как документация" hint="логика не меняется — меняются только имена">
      <Segmented size="sm" value={lvl} onChange={setLvl} options={NAME_LEVELS.map((x, i) => ({ value: i, label: x.label }))} className="max-w-full overflow-x-auto" />
      <Code code={l.code} className="mt-3" />
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">{l.note}</p>
    </Frame>
  );
}

// ── Охота на запахи ────────────────────────────────────────────────

const SMELL_CODE = [
  "public class OrderService {",
  "    public double process(Order o, boolean isAdmin, boolean sendMail) {",
  "        if (o == null) return -1;",
  "        double t = 0;",
  "        for (Item i : o.getItems()) t += i.getPrice() * i.getQty();",
  "        if (o.getCustomer().getAddress().getCountry().equals(\"KZ\")) t *= 1.12;",
  "        if (t > 100000) t = t * 0.95;",
  "        // сохраняем",
  "        db.execute(\"UPDATE orders SET total=\" + t + \" WHERE id=\" + o.getId());",
  "        if (sendMail) mailer.send(o.getCustomer().getEmail(), \"Заказ \" + o.getId());",
  "        if (isAdmin) log.info(\"admin processed\");",
  "        return t;",
  "    }",
  "}",
];
const SMELLS: Record<number, { name: string; why: string }> = {
  1: { name: "Флаговые аргументы", why: "`isAdmin` и `sendMail` — признак, что метод делает несколько разных вещей. Раздели на отдельные методы или вынеси решения наружу." },
  2: { name: "Магическое значение вместо ошибки", why: "`-1` как сигнал ошибки легко перепутать с суммой. Бросай исключение или верни Optional." },
  3: { name: "Невыразительное имя", why: "`t` — это итог заказа. Назови `total`." },
  5: { name: "Цепочка вызовов (закон Деметры)", why: "`o.getCustomer().getAddress().getCountry()` — метод знает устройство трёх чужих объектов. Спроси у заказа: `o.isDomestic()`." },
  6: { name: "Магические числа", why: "`100000` и `0.95` — что это? Скидка за крупный заказ: `BULK_THRESHOLD`, `BULK_DISCOUNT`. Плюс 1.12 строкой выше — НДС." },
  7: { name: "Комментарий вместо кода", why: "«сохраняем» ничего не добавляет. Вынеси в метод `save(order)` — имя скажет то же самое." },
  8: { name: "SQL-инъекция и смешение уровней", why: "Склейка SQL строкой — дыра в безопасности, а SQL в сервисе расчёта — смешение уровней абстракции. Репозиторий + параметризованный запрос." },
  9: { name: "Побочный эффект в расчёте", why: "Метод «process» ещё и шлёт письма. Отправка — отдельная ответственность (лучше событие «заказ обработан»)." },
};

export function SmellHunt() {
  const [picked, setPicked] = useState<number[]>([]);
  const [shown, setShown] = useState(false);
  const toggle = (i: number) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  const found = picked.filter((i) => SMELLS[i]).length;
  const total = Object.keys(SMELLS).length;
  return (
    <Frame title="Найди запахи" hint="нажимай на строки, которые пахнут">
      <div className="overflow-x-auto rounded-xl border border-line bg-bg py-1.5 font-mono text-[12px] leading-[1.7]">
        {SMELL_CODE.map((line, i) => {
          const isSmell = !!SMELLS[i];
          const p = picked.includes(i);
          return (
            <button
              key={i}
              type="button"
              onClick={() => toggle(i)}
              className={cx(
                "flex w-max min-w-full items-start gap-3 px-3 text-left transition",
                shown && isSmell ? (p ? "bg-ok/15" : "bg-amber/15") : p ? (shown ? "bg-bad/15" : "bg-blue/15") : "hover:bg-raised",
              )}
            >
              <span className="w-5 shrink-0 text-right text-mute">{i + 1}</span>
              <span className="whitespace-pre text-dim">{line}</span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {!shown ? (
          <button type="button" onClick={() => setShown(true)} className="h-9 rounded-xl bg-accent px-4 text-[13px] font-semibold text-accent-ink">
            Проверить ({picked.length} отмечено)
          </button>
        ) : (
          <span className="text-[13.5px] text-dim">
            Нашёл <span className="font-mono text-ok">{found}</span> из {total}. Зелёные — нашёл, жёлтые — пропустил{picked.some((i) => !SMELLS[i]) ? ", красные — здесь всё нормально" : ""}.
          </span>
        )}
        {shown && (
          <button type="button" onClick={() => { setPicked([]); setShown(false); }} className="h-9 rounded-xl border border-line px-3 text-[13px] text-dim hover:text-ink">
            Заново
          </button>
        )}
      </div>
      {shown && (
        <ul className="anim-fade mt-4 grid gap-2">
          {Object.entries(SMELLS).map(([i, s]) => (
            <li key={i} className="rounded-xl bg-raised/60 p-3 text-[13.5px] leading-relaxed text-dim">
              <span className="font-mono text-mute">стр. {Number(i) + 1}</span> · <span className="font-medium text-ink">{s.name}.</span> {s.why.replace(/`/g, "")}
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

// ── Инварианты: открытые поля против инкапсуляции ──────────────────

type Acc = { balance: number; limit: number; log: string[] };

export function InvariantDemo() {
  const [mode, setMode] = useState<"open" | "closed">("open");
  const [acc, setAcc] = useState<Acc>({ balance: 1000, limit: 0, log: [] });
  const broken = acc.balance < -acc.limit;
  const act = (label: string, f: (a: Acc) => Acc | string) => {
    const r = f(acc);
    if (typeof r === "string") setAcc({ ...acc, log: [...acc.log, `✗ ${label}: ${r}`] });
    else setAcc({ ...r, log: [...acc.log, `✓ ${label}`] });
  };
  const withdraw = (n: number) =>
    act(`withdraw(${n})`, (a) => (mode === "closed" && a.balance - n < -a.limit ? "IllegalStateException: недостаточно средств" : { ...a, balance: a.balance - n }));
  const direct = () =>
    act(mode === "open" ? "account.balance = -5000" : "account.balance = -5000", (a) => (mode === "closed" ? "не компилируется: balance is private" : { ...a, balance: -5000 }));
  const reset = (m = mode) => {
    setMode(m);
    setAcc({ balance: 1000, limit: 0, log: [] });
  };
  return (
    <Frame title="Кто охраняет инвариант" hint="баланс не может уйти ниже лимита">
      <Segmented
        size="sm"
        value={mode}
        onChange={(m) => reset(m)}
        options={[
          { value: "open", label: "public поля" },
          { value: "closed", label: "инкапсуляция" },
        ]}
      />
      <Code
        className="mt-3"
        code={
          mode === "open"
            ? `class Account {
    public long balance;      // кто угодно пишет что угодно
    public long limit;
}
// правило «balance >= -limit» живёт в головах
// и в десятке сервисов, которые должны его проверять`
            : `class Account {
    private long balance;
    private final long limit;

    void withdraw(long amount) {
        if (balance - amount < -limit)
            throw new IllegalStateException("недостаточно средств");
        balance -= amount;
    }
    long balance() { return balance; }
}`
        }
      />
      <Metrics className="mt-3">
        <Metric label="баланс" value={acc.balance} tone={broken ? "bad" : "ok"} />
        <Metric label="инвариант" value={broken ? "нарушен" : "соблюдён"} tone={broken ? "bad" : "ok"} />
      </Metrics>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={() => withdraw(300)} className="h-9 rounded-xl border border-line px-3 font-mono text-[12.5px] text-dim hover:text-ink">withdraw(300)</button>
        <button type="button" onClick={() => withdraw(2000)} className="h-9 rounded-xl border border-line px-3 font-mono text-[12.5px] text-dim hover:text-ink">withdraw(2000)</button>
        <button type="button" onClick={direct} className="h-9 rounded-xl border border-line px-3 font-mono text-[12.5px] text-dim hover:text-ink">balance = -5000</button>
        <button type="button" onClick={() => reset()} className="h-9 rounded-xl px-3 text-[12.5px] text-mute hover:text-ink">сначала</button>
      </div>
      <Log className="mt-3" lines={acc.log} empty="Попробуй снять больше, чем есть, или записать в поле напрямую." />
    </Frame>
  );
}

// ── Виртуальный вызов: объект → класс → vtable → метод ──────────────

const SHAPES = [
  { id: "circle", cls: "Circle", vt: ["Shape.toString", "Circle.area", "Shape.describe"], fields: "r = 2.0" },
  { id: "square", cls: "Square", vt: ["Shape.toString", "Square.area", "Shape.describe"], fields: "side = 3.0" },
  { id: "tri", cls: "Triangle", vt: ["Shape.toString", "Triangle.area", "Triangle.describe"], fields: "a, b, c" },
];

export function VtableDispatch() {
  const [mix, setMix] = useState(1);
  const h = useHistory(() => ({ step: 0, obj: 0 }));
  const s = h.cur;
  const objs = SHAPES.slice(0, mix);
  const o = SHAPES[s.obj % mix];
  const stepTo = () => h.push((x) => (x.step >= 4 ? { step: 1, obj: (x.obj + 1) % mix } : { ...x, step: x.step + 1 }));
  const player = usePlayer(() => {
    stepTo();
    return true;
  }, 700);
  const ic = mix === 1 ? "мономорфный" : mix === 2 ? "биморфный" : "мегаморфный";
  const steps = [
    "Вызов shape.area(): тип переменной — Shape, реальный класс ещё не известен.",
    `Читаем заголовок объекта: указатель на класс ${o.cls}.`,
    `У класса есть таблица виртуальных методов (vtable). area() — слот 1.`,
    `В слоте 1 у ${o.cls} лежит адрес ${o.vt[1]} — прыгаем туда.`,
    `Выполняется ${o.vt[1]}. Два чтения памяти и косвенный переход — цена позднего связывания.`,
  ];
  return (
    <Frame
      title="Как работает shape.area()"
      hint="позднее связывание"
      controls={<StepControls onStep={stepTo} onBack={h.back} canBack={h.canBack} onReset={() => h.reset()} player={player} />}
    >
      <Slider label="Сколько разных классов приходит в это место кода" value={mix} min={1} max={3} onChange={(v) => { setMix(v); h.reset(); }} display={`${mix} · ${ic}`} />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <Caption>объект в куче</Caption>
          <div className={cx("rounded-xl border p-2.5 font-mono text-[12px] transition", s.step >= 1 ? "border-accent/60" : "border-line")}>
            <div className={cx("rounded-md px-2 py-1", s.step === 1 ? "bg-accent/20 text-ink" : "bg-raised text-dim")}>klass → {o.cls}</div>
            <div className="mt-1 px-2 text-mute">{o.fields}</div>
          </div>
        </div>
        <div>
          <Caption>vtable {o.cls}</Caption>
          <div className="rounded-xl border border-line p-1.5 font-mono text-[12px]">
            {o.vt.map((m, i) => (
              <div key={i} className={cx("rounded-md px-2 py-1", s.step >= 2 && i === 1 ? (s.step >= 3 ? "bg-accent/20 text-ink" : "bg-raised text-ink") : "text-mute")}>
                [{i}] {m}
              </div>
            ))}
          </div>
        </div>
        <div>
          <Caption>машинный код</Caption>
          <div className={cx("rounded-xl border p-2.5 font-mono text-[12px] transition", s.step >= 4 ? "border-ok/60 text-ink" : "border-line text-mute")}>{o.vt[1]}()</div>
        </div>
      </div>
      <p className="mt-3 min-h-[44px] text-[13.5px] leading-relaxed text-dim">{steps[s.step]}</p>
      <div className="mt-1 rounded-xl bg-raised/60 p-3 text-[13px] leading-relaxed text-dim">
        <span className="font-medium text-ink">JIT и {ic} вызов. </span>
        {mix === 1
          ? "Сюда всегда приходит Circle — JIT ставит проверку класса и встраивает Circle.area прямо в вызывающий код. Виртуальный вызов становится бесплатным."
          : mix === 2
            ? "Два класса — JIT встроит оба варианта за проверкой «если Circle… иначе Square…». Всё ещё быстро."
            : `Классов ${objs.length} и больше — inline cache сдаётся, остаётся честный поиск по vtable на каждом вызове.`}
      </div>
    </Frame>
  );
}

// ── Хрупкий базовый класс (Effective Java, item 18) ─────────────────

export function FragileBase() {
  const [mode, setMode] = useState<"extends" | "compose">("extends");
  const [log, setLog] = useState<string[]>([]);
  const [count, setCount] = useState(0);
  const run = () => {
    const lines: string[] = [];
    let c = 0;
    if (mode === "extends") {
      lines.push("s.addAll([a, b, c])  → CountingSet.addAll: addCount += 3  (3)");
      c += 3;
      lines.push("  super.addAll(...)   → HashSet.addAll внутри вызывает add() на каждый элемент");
      for (const x of ["a", "b", "c"]) {
        c += 1;
        lines.push(`    add("${x}")        → переопределённый CountingSet.add: addCount++  (${c})`);
      }
    } else {
      lines.push("s.addAll([a, b, c])  → CountingSet.addAll: addCount += 3  (3)");
      c += 3;
      lines.push("  inner.addAll(...)   → вызывает add() у HashSet, а не у нашего класса");
      lines.push("  наш add() не вызывается — счётчик не трогается");
    }
    setLog(lines);
    setCount(c);
  };
  return (
    <Frame title="Сколько элементов добавили?" hint="ожидаем 3">
      <Segmented
        size="sm"
        value={mode}
        onChange={(m) => {
          setMode(m);
          setLog([]);
          setCount(0);
        }}
        options={[
          { value: "extends", label: "extends HashSet" },
          { value: "compose", label: "композиция" },
        ]}
      />
      <Code
        className="mt-3"
        code={
          mode === "extends"
            ? `class CountingSet<E> extends HashSet<E> {
    int addCount = 0;
    @Override public boolean add(E e) {
        addCount++;
        return super.add(e);
    }
    @Override public boolean addAll(Collection<? extends E> c) {
        addCount += c.size();
        return super.addAll(c);
    }
}`
            : `class CountingSet<E> implements Set<E> {   // обёртка
    private final Set<E> inner = new HashSet<>();
    int addCount = 0;
    public boolean add(E e) { addCount++; return inner.add(e); }
    public boolean addAll(Collection<? extends E> c) {
        addCount += c.size();
        return inner.addAll(c);
    }
    // остальные методы Set просто делегируют inner
}`
        }
      />
      <button type="button" onClick={run} className="mt-3 h-9 rounded-xl bg-accent px-4 font-mono text-[12.5px] font-semibold text-accent-ink">
        s.addAll(List.of("a", "b", "c"))
      </button>
      {log.length > 0 && (
        <div className="anim-fade mt-3">
          <pre className="overflow-x-auto rounded-xl border border-line bg-bg p-3 font-mono text-[12px] leading-relaxed text-dim">{log.join("\n")}</pre>
          <Metrics className="mt-3">
            <Metric label="addCount" value={count} tone={count === 3 ? "ok" : "bad"} />
          </Metrics>
          <p className="mt-2 text-[13.5px] leading-relaxed text-dim">
            {count === 3
              ? "Обёртка зависит только от публичного контракта Set, а не от того, как HashSet устроен внутри."
              : "Наследник зависит от деталей реализации родителя: HashSet.addAll вызывает add, о чём нигде не обещано. Поменяют реализацию в новой версии JDK — поведение снова изменится."}
          </p>
        </div>
      )}
    </Frame>
  );
}

// ── Ленивый стрим: элементы идут по одному ──────────────────────────

const SRC = [7, 2, 9, 4, 6, 1, 8, 3];
type Ev = { el: number; stage: "filter" | "map" | "limit"; pass: boolean; out?: number };

function streamEvents(lazy: boolean): Ev[] {
  const ev: Ev[] = [];
  if (lazy) {
    let taken = 0;
    for (const x of SRC) {
      const ok = x % 2 === 0;
      ev.push({ el: x, stage: "filter", pass: ok });
      if (!ok) continue;
      ev.push({ el: x, stage: "map", pass: true, out: x * x });
      taken++;
      ev.push({ el: x, stage: "limit", pass: true, out: x * x });
      if (taken === 2) break;
    }
  } else {
    const f = SRC.filter((x) => {
      ev.push({ el: x, stage: "filter", pass: x % 2 === 0 });
      return x % 2 === 0;
    });
    const m = f.map((x) => {
      ev.push({ el: x, stage: "map", pass: true, out: x * x });
      return x * x;
    });
    m.slice(0, 2).forEach((v, i) => ev.push({ el: f[i], stage: "limit", pass: true, out: v }));
  }
  return ev;
}

export function StreamFlow() {
  const [lazy, setLazy] = useState(true);
  const events = useMemo(() => streamEvents(lazy), [lazy]);
  const [i, setI] = useState(0);
  // тик плеера читает i из замыкания текущего рендера (kit держит ref на свежий tick)
  const player = usePlayer(() => {
    if (i >= events.length) return false;
    setI(i + 1);
    return i + 1 < events.length;
  }, 500);
  const done = events.slice(0, i);
  const out = done.filter((e) => e.stage === "limit").map((e) => e.out);
  const calls = { filter: done.filter((e) => e.stage === "filter").length, map: done.filter((e) => e.stage === "map").length };
  const cur = events[i - 1];
  return (
    <Frame
      title="Ленивый конвейер"
      hint="filter(чётные) → map(x²) → limit(2)"
      controls={<StepControls onStep={() => setI((v) => Math.min(events.length, v + 1))} onBack={() => setI((v) => Math.max(0, v - 1))} canBack={i > 0} canStep={i < events.length} onReset={() => setI(0)} player={player} />}
    >
      <Segmented
        size="sm"
        value={lazy ? "lazy" : "eager"}
        onChange={(v) => {
          setLazy(v === "lazy");
          setI(0);
        }}
        options={[
          { value: "lazy", label: "Stream (лениво)" },
          { value: "eager", label: "Списки (жадно)" },
        ]}
      />
      <div className="mt-4 flex flex-wrap gap-1.5">
        {SRC.map((x, k) => {
          const seen = done.some((e) => e.el === x && e.stage === "filter");
          const dropped = done.some((e) => e.el === x && e.stage === "filter" && !e.pass);
          const isCur = cur?.el === x;
          return (
            <span
              key={k}
              className={cx(
                "flex size-9 items-center justify-center rounded-lg border font-mono text-[14px] transition",
                isCur ? "border-accent bg-accent/20 text-ink" : dropped ? "border-line text-line-strong line-through" : seen ? "border-line-strong text-dim" : "border-line text-mute",
              )}
            >
              {x}
            </span>
          );
        })}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 font-mono text-[12px]">
        {(["filter", "map", "limit"] as const).map((st) => (
          <div key={st} className={cx("rounded-xl border p-2.5", cur?.stage === st ? "border-accent/60 bg-accent/10" : "border-line")}>
            <div className="text-mute">{st}</div>
            <div className="mt-1 text-ink">{cur?.stage === st ? (st === "filter" ? `${cur.el} ${cur.pass ? "✓" : "✗"}` : `${cur.el} → ${cur.out}`) : "—"}</div>
          </div>
        ))}
      </div>
      <Metrics className="mt-3">
        <Metric label="вызовов filter" value={calls.filter} />
        <Metric label="вызовов map" value={calls.map} />
        <Metric label="результат" value={`[${out.join(", ")}]`} tone={out.length === 2 ? "ok" : undefined} />
      </Metrics>
      <p className="mt-3 text-[13px] leading-relaxed text-dim">
        {lazy
          ? "Каждый элемент проходит весь конвейер, прежде чем взять следующий. Как только limit набрал 2 — работа прекращается: 9, 1, 8 и 3 даже не проверялись."
          : "Сначала фильтруется весь список, потом возводится в квадрат весь отфильтрованный — и только потом берутся первые два. Лишние вызовы и промежуточные списки."}
      </p>
    </Frame>
  );
}

// ── Принцип Лисков: квадрат и прямоугольник ─────────────────────────

export function LspTest() {
  const [cls, setCls] = useState<"rect" | "square">("rect");
  const [ran, setRan] = useState(false);
  const w = 5;
  const hgt = 4;
  const area = cls === "rect" ? w * hgt : hgt * hgt;
  return (
    <Frame title="Тест, написанный для Rectangle" hint="подставь наследника">
      <Code
        code={`void resize(Rectangle r) {
    r.setWidth(5);
    r.setHeight(4);
    assert r.area() == 20;   // для прямоугольника — очевидно
}`}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Segmented
          size="sm"
          value={cls}
          onChange={(v) => {
            setCls(v);
            setRan(false);
          }}
          options={[
            { value: "rect", label: "new Rectangle()" },
            { value: "square", label: "new Square()" },
          ]}
        />
        <button type="button" onClick={() => setRan(true)} className="h-8 rounded-lg bg-accent px-3 text-[12.5px] font-semibold text-accent-ink">
          Запустить
        </button>
      </div>
      {cls === "square" && (
        <Code
          className="mt-3"
          code={`class Square extends Rectangle {
    @Override void setWidth(int w)  { this.w = w; this.h = w; }  // квадрат обязан
    @Override void setHeight(int h) { this.w = h; this.h = h; }  // держать стороны равными
}`}
        />
      )}
      {ran && (
        <div className="anim-fade mt-3 flex items-center gap-4">
          <svg width={110} height={90} aria-hidden>
            <rect x={5} y={5} width={(cls === "rect" ? w : hgt) * 18} height={hgt * 18} fill="rgb(106 167 255 / 0.2)" stroke={C.blue} />
          </svg>
          <div className="text-[13.5px] leading-relaxed text-dim">
            area() = <span className={cx("font-mono", area === 20 ? "text-ok" : "text-bad")}>{area}</span>.{" "}
            {area === 20 ? "Тест прошёл." : "Assertion failed: setHeight(4) молча поменял и ширину. Square нельзя подставить вместо Rectangle — LSP нарушен, хотя «квадрат — это прямоугольник» в геометрии."}
          </div>
        </div>
      )}
    </Frame>
  );
}

// ── DIP: направление зависимостей ──────────────────────────────────

export function DipArrows() {
  const [inv, setInv] = useState(false);
  const box = (x: number, y: number, w: number, label: string, sub: string, tone: string) => (
    <g>
      <rect x={x} y={y} width={w} height={46} rx={10} fill={C.raised} stroke={tone} />
      <text x={x + w / 2} y={y + 20} textAnchor="middle" fontSize={13} fill={C.ink} fontWeight={600}>
        {label}
      </text>
      <text x={x + w / 2} y={y + 36} textAnchor="middle" fontSize={10.5} fill={C.mute}>
        {sub}
      </text>
    </g>
  );
  return (
    <Frame title="Куда смотрят стрелки зависимостей" hint="стрелка = «знает о / импортирует»">
      <Segmented
        size="sm"
        value={inv ? "dip" : "plain"}
        onChange={(v) => setInv(v === "dip")}
        options={[
          { value: "plain", label: "Напрямую" },
          { value: "dip", label: "Через интерфейс" },
        ]}
      />
      <svg viewBox="0 0 420 230" className="mt-3 w-full" role="img" aria-label="Схема зависимостей">
        <defs>
          <marker id="dip-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M0 0 L10 5 L0 10 z" fill={C.dim} />
          </marker>
        </defs>
        {box(20, 20, 170, "OrderService", "бизнес-правила", C.accent)}
        {inv ? (
          <>
            {box(230, 20, 170, "PaymentGateway", "interface · у бизнеса", C.violet)}
            {box(230, 160, 170, "StripeGateway", "адаптер · инфраструктура", C.line)}
            <line x1={190} y1={43} x2={228} y2={43} stroke={C.dim} strokeWidth={2} markerEnd="url(#dip-arrow)" />
            <line x1={315} y1={160} x2={315} y2={68} stroke={C.dim} strokeWidth={2} markerEnd="url(#dip-arrow)" strokeDasharray="5 4" />
            <text x={322} y={120} fontSize={11} fill={C.mute}>implements</text>
          </>
        ) : (
          <>
            {box(230, 160, 170, "StripeClient", "SDK · инфраструктура", C.line)}
            <path d="M105 66 C 105 140, 230 150, 255 158" fill="none" stroke={C.dim} strokeWidth={2} markerEnd="url(#dip-arrow)" />
          </>
        )}
      </svg>
      <p className="text-[13.5px] leading-relaxed text-dim">
        {inv
          ? "Бизнес-код зависит от интерфейса, который сам и определил. Инфраструктура зависит от бизнеса (реализует его интерфейс), а не наоборот. Сменить Stripe на другой провайдер или подставить фейк в тесте — без правки OrderService."
          : "Бизнес-правила импортируют SDK платёжки. Меняется SDK — меняется сервис; тест сервиса требует настоящего Stripe или сложного мока."}
      </p>
    </Frame>
  );
}

// ── Декоратор: слои вокруг потока ──────────────────────────────────

const LAYERS = [
  { id: "buf", name: "BufferedOutputStream", what: "копит байты в буфере 8 КБ и пишет крупно" },
  { id: "gzip", name: "GZIPOutputStream", what: "сжимает поток на лету" },
  { id: "cipher", name: "CipherOutputStream", what: "шифрует" },
];

export function DecoratorStack() {
  const [on, setOn] = useState<string[]>(["buf"]);
  const active = LAYERS.filter((l) => on.includes(l.id));
  const code = `OutputStream out = new FileOutputStream("data.bin");\n${active
    .slice()
    .reverse()
    .map((l) => `out = new ${l.name}(out${l.id === "cipher" ? ", cipher" : ""});`)
    .join("\n")}\nout.write(bytes);   // один и тот же вызов`;
  return (
    <Frame title="Декоратор: слои вокруг одного интерфейса" hint="java.io — учебник по декораторам">
      <div className="flex flex-wrap gap-2">
        {LAYERS.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setOn((o) => (o.includes(l.id) ? o.filter((x) => x !== l.id) : [...o, l.id]))}
            className={cx("h-8 rounded-lg border px-3 font-mono text-[12px] transition", on.includes(l.id) ? "border-accent/60 bg-accent/10 text-ink" : "border-line text-mute")}
          >
            {l.name.replace("OutputStream", "")}
          </button>
        ))}
      </div>
      <div className="mt-4 flex flex-col items-center gap-1">
        <div className="rounded-lg border border-line px-3 py-1.5 font-mono text-[12px] text-dim">out.write(bytes)</div>
        {active.map((l) => (
          <div key={l.id} className="flex w-full max-w-sm flex-col items-center">
            <span className="text-mute">↓</span>
            <div className="w-full rounded-lg border border-accent/40 bg-accent/[0.06] px-3 py-1.5 text-center">
              <div className="font-mono text-[12px] text-ink">{l.name}</div>
              <div className="text-[11.5px] text-mute">{l.what}</div>
            </div>
          </div>
        ))}
        <span className="text-mute">↓</span>
        <div className="w-full max-w-sm rounded-lg border border-line bg-raised px-3 py-1.5 text-center font-mono text-[12px] text-dim">FileOutputStream → диск</div>
      </div>
      <Code className="mt-4" code={code} />
      <p className="mt-2 text-[13px] text-mute">Каждый слой — тот же интерфейс OutputStream и оборачивает следующий. Комбинаций 2³ = 8, а классов — всего 3. Наследованием понадобилось бы по классу на каждую комбинацию.</p>
    </Frame>
  );
}
