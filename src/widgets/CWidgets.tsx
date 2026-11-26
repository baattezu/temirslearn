import { useState } from "react";
import { Button } from "../ui/Button";
import { Slider, Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Legend, Log, Metric, Metrics, StepControls } from "./kit";

const hx = (n: number) => "0x" + n.toString(16);

// ══ Указатели и адресная арифметика ═══════════════════════════

const TYPES = { char: 1, int: 4, double: 8 } as const;
type TName = keyof typeof TYPES;

export function PointerArith() {
  const [t, setT] = useState<TName>("int");
  const [i, setI] = useState(2);
  const size = TYPES[t];
  const N = 6;
  const base = 0x7ffc1000;
  const bytes = 48;
  const addr = base + i * size;
  const oob = i >= N || i < 0;
  const vals = { char: "'hello!'", int: "{10,20,30,40,50,60}", double: "{1.5,…}" }[t];
  return (
    <Frame title="Адресная арифметика" hint={`${t} a[${N}] = ${vals}; ${t} *p = a;`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Segmented<TName> value={t} onChange={setT} block options={[{ value: "char", label: "char (1 Б)" }, { value: "int", label: "int (4 Б)" }, { value: "double", label: "double (8 Б)" }]} />
        <Slider label="i в выражении p + i" value={i} min={0} max={8} onChange={setI} />
      </div>
      <div className="mt-4 grid gap-[2px]" style={{ gridTemplateColumns: "repeat(16, minmax(0, 1fr))" }}>
        {Array.from({ length: bytes }, (_, b) => {
          const el = Math.floor(b / size);
          const inArr = el < N;
          const target = b >= i * size && b < (i + 1) * size;
          return (
            <div
              key={b}
              className="h-7 rounded-[3px]"
              style={{
                background: target ? (oob ? C.bad : C.amber) : inArr ? `color-mix(in oklab, ${el % 2 ? C.blue : C.accent} 30%, transparent)` : "var(--color-raised)",
                opacity: inArr || target ? 1 : 0.6,
              }}
              title={`${hx(base + b)}`}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-mute">
        <span>{hx(base)}</span>
        <span>байты, по 16 в ряд</span>
      </div>
      <Metrics className="mt-3">
        <Metric label="p + i" value={hx(addr)} tone={oob ? "bad" : "amber"} />
        <Metric label="сдвиг в байтах" value={`${i} × ${size} = ${i * size}`} />
        <Metric label="sizeof(a)" value={`${N * size} Б`} />
        <Metric label="sizeof(p)" value="8 Б" />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {oob
          ? `a[${i}] — за концом массива. Это не ошибка компиляции и не исключение, а undefined behaviour: прочитаем соседние байты стека (другие переменные, адрес возврата) или упадём. Указатель на элемент сразу за концом (p + ${N}) создавать можно, разыменовывать — нет.`
          : `p + i прибавляет не i байт, а i × sizeof(${t}). a[i] — это просто *(a + i), поэтому и i[a] скомпилируется. В выражениях имя массива «распадается» в указатель на первый элемент — и в функцию массив передаётся как указатель, теряя размер.`}
      </p>
    </Frame>
  );
}

// ══ Срыв стека ══════════════════════════════════════════════

export function StackSmash() {
  const [len, setLen] = useState(6);
  const [canary, setCanary] = useState(false);
  // раскладка кадра снизу вверх по адресам: buf[8] | (canary 8) | saved rbp 8 | return addr 8
  const slots = [
    { name: "buf[0..7]", size: 8, color: C.accent },
    ...(canary ? [{ name: "канарейка", size: 8, color: C.ok }] : []),
    { name: "saved rbp", size: 8, color: C.violet },
    { name: "адрес возврата", size: 8, color: C.rose },
  ];
  let off = 0;
  const written = len + 1; // + '\0'
  const hits = slots.map((s) => {
    const from = off;
    off += s.size;
    return { ...s, from, over: Math.max(0, Math.min(s.size, written - from)) };
  });
  const smashed = hits.filter((h) => h.name !== "buf[0..7]" && h.over > 0);
  const outcome = smashed.length === 0 ? "ok" : canary ? "canary" : smashed.some((h) => h.name === "адрес возврата") ? "rip" : "rbp";
  return (
    <Frame title="strcpy(buf, input) в char buf[8]" hint="стек растёт вниз, запись — вверх">
      <Slider label="Длина input" value={len} min={1} max={32} onChange={setLen} display={`${len} символов + '\\0'`} />
      <Toggle checked={canary} onChange={setCanary} label="-fstack-protector (канарейка)" />
      <div className="mt-4 grid gap-1.5">
        {[...hits].reverse().map((h) => (
          <div key={h.name} className="grid grid-cols-[120px_1fr] items-center gap-2">
            <span className="font-mono text-[11.5px] text-dim">{h.name}</span>
            <div className="flex h-8 overflow-hidden rounded-md border border-line">
              {Array.from({ length: h.size }, (_, b) => (
                <div
                  key={b}
                  className="flex flex-1 items-center justify-center border-r border-bg font-mono text-[10px]"
                  style={{
                    background: b < h.over ? (h.name === "buf[0..7]" ? `color-mix(in oklab, ${C.accent} 40%, transparent)` : `color-mix(in oklab, ${C.bad} 45%, transparent)`) : `color-mix(in oklab, ${h.color} 12%, transparent)`,
                    color: b < h.over ? C.ink : C.mute,
                  }}
                >
                  {b < h.over ? (h.from + b === len ? "\\0" : "A") : ""}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 text-right font-mono text-[10.5px] text-mute">↑ старшие адреса</div>
      <div
        className={cx(
          "mt-3 rounded-xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed",
          outcome === "ok" ? "border-ok/40 bg-ok/10 text-ok" : outcome === "canary" ? "border-amber/40 bg-amber/10 text-amber" : "border-bad/40 bg-bad/10 text-bad",
        )}
      >
        {outcome === "ok"
          ? "Влезло: строка и терминатор внутри буфера."
          : outcome === "canary"
            ? "*** stack smashing detected ***: перед возвратом функция сверила канарейку — она испорчена, процесс аварийно завершён. Атака превратилась в падение."
            : outcome === "rip"
              ? "Перезаписан адрес возврата: на ret процессор прыгнет на 0x4141414141414141 («AAAA…»). Если вместо «A» подставить нужный адрес — атакующий управляет исполнением. Классическая уязвимость, отсюда канарейки, ASLR, NX и запрет gets()."
              : "Испорчен сохранённый rbp: вызывающая функция после возврата будет работать с неверным кадром — падение или порча данных позже, вдали от причины."}
      </div>
    </Frame>
  );
}

// ══ malloc / free изнутри ═══════════════════════════════════

interface Blk {
  id: number;
  size: number;
  free: boolean;
  tag?: string;
}
const HEAP = 64;
export function MallocViz() {
  const [blocks, setBlocks] = useState<Blk[]>([{ id: 0, size: HEAP, free: true }]);
  const [next, setNext] = useState(1);
  const [ptrs, setPtrs] = useState<Record<string, number>>({});
  const [log, setLog] = useState<string[]>([]);
  const [freed, setFreed] = useState<Record<string, number>>({});
  const malloc = (name: string, size: number) => {
    const need = size + 1; // 1 ячейка заголовка (размер + флаги)
    const i = blocks.findIndex((b) => b.free && b.size >= need);
    if (i < 0) {
      const total = blocks.filter((b) => b.free).reduce((a, b) => a + b.size, 0);
      setLog((l) => [...l, `malloc(${size}) = NULL: свободно ${total}, но нет непрерывного куска ${need} — фрагментация`]);
      return;
    }
    const b = blocks[i];
    const parts: Blk[] = [{ id: next, size: need, free: false, tag: name }];
    if (b.size > need) parts.push({ id: next + 1, size: b.size - need, free: true });
    setBlocks([...blocks.slice(0, i), ...parts, ...blocks.slice(i + 1)]);
    setPtrs({ ...ptrs, [name]: next });
    setNext(next + 2);
    setLog((l) => [...l, `${name} = malloc(${size}): first-fit, блок ${need} (+1 на заголовок с размером)`]);
  };
  const free = (name: string) => {
    const id = ptrs[name];
    if (id === undefined) {
      if (freed[name] !== undefined) setLog((l) => [...l, `free(${name}) повторно: double free — порча структуры кучи. glibc часто ловит и падает с «double free detected», но не всегда`]);
      return;
    }
    let bl = blocks.map((b) => (b.id === id ? { ...b, free: true, tag: undefined } : b));
    // слияние соседних свободных
    const merged: Blk[] = [];
    for (const b of bl) {
      const last = merged[merged.length - 1];
      if (last && last.free && b.free) last.size += b.size;
      else merged.push({ ...b });
    }
    bl = merged;
    const rest = { ...ptrs };
    delete rest[name];
    setBlocks(bl);
    setPtrs(rest);
    setFreed({ ...freed, [name]: id });
    setLog((l) => [...l, `free(${name}): блок свободен, соседние свободные склеены. Сам указатель ${name} по-прежнему хранит старый адрес — висячий`]);
  };
  const useAfter = (name: string) => {
    if (ptrs[name] !== undefined) return setLog((l) => [...l, `${name}[0] = 1: нормально, память наша`]);
    const reused = blocks.some((bl) => !bl.free && bl.id > freed[name]);
    setLog((l) => [...l, `${name}[0] = 1 после free: use-after-free! ${reused ? "Эту память, скорее всего, уже отдали другому malloc — мы молча портим чужие данные" : "Пишем в свободный блок — портим служебные данные аллокатора (списки свободных блоков)"}`]);
  };
  const reset = () => {
    setBlocks([{ id: 0, size: HEAP, free: true }]);
    setNext(1);
    setPtrs({});
    setFreed({});
    setLog([]);
  };
  const freeTotal = blocks.filter((b) => b.free).reduce((a, b) => a + b.size, 0);
  const largest = Math.max(0, ...blocks.filter((b) => b.free).map((b) => b.size));
  const colors: Record<string, string> = { a: C.accent, b: C.blue, c: C.violet, d: C.teal };
  return (
    <Frame title="Куча: malloc и free" hint={`${HEAP} ячеек, first-fit`}>
      <div className="flex h-12 overflow-hidden rounded-lg border border-line">
        {blocks.map((b) => (
          <div
            key={b.id}
            className="relative flex items-center justify-center border-r border-bg font-mono text-[11px]"
            style={{ width: `${(b.size / HEAP) * 100}%`, background: b.free ? "var(--color-raised)" : `color-mix(in oklab, ${colors[b.tag!]} 40%, transparent)` }}
          >
            {!b.free && <span className="absolute inset-y-0 left-0 w-[6px] bg-ink/30" title="заголовок" />}
            <span className={b.free ? "text-mute" : "text-ink"}>{b.free ? b.size : `${b.tag}:${b.size - 1}`}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["a", 12],
          ["b", 20],
          ["c", 8],
          ["d", 24],
        ].map(([n, sz]) => (
          <div key={n} className="grid gap-1 rounded-xl border border-line p-2">
            <span className="font-mono text-[11.5px]" style={{ color: colors[n as string] }}>
              {n} · {sz} байт
            </span>
            <div className="grid grid-cols-3 gap-1">
              <Button size="sm" onClick={() => malloc(n as string, sz as number)} disabled={ptrs[n as string] !== undefined} className="px-1">
                malloc
              </Button>
              <Button size="sm" onClick={() => free(n as string)} className="px-1">
                free
              </Button>
              <Button size="sm" onClick={() => useAfter(n as string)} className="px-1">
                [0]=1
              </Button>
            </div>
          </div>
        ))}
      </div>
      <Metrics className="mt-3">
        <Metric label="свободно" value={freeTotal} />
        <Metric label="крупнейший кусок" value={largest} tone={largest < freeTotal ? "amber" : undefined} />
        <Metric label="фрагментация" value={freeTotal ? `${Math.round((1 - largest / freeTotal) * 100)}%` : "—"} />
        <Metric label="утечка при выходе" value={Object.keys(ptrs).length ? `${Object.keys(ptrs).length} блок(а)` : "нет"} />
      </Metrics>
      <div className="mt-2 flex justify-end">
        <Button size="sm" variant="ghost" onClick={reset}>
          Сначала
        </Button>
      </div>
      <Log lines={log} max={3} empty="Попробуй: malloc a, b, c → free b → malloc d (не влезет в дыру b). Потом free a и use-after-free." />
    </Frame>
  );
}

// ══ C++: RAII и раскрутка стека ════════════════════════════════

interface RStep {
  line: number;
  alive: string[];
  out: string[];
  note: string;
  bad?: boolean;
}
const RAII_CODE = {
  raii: ["void handle() {", "  std::lock_guard lk(mu);      // lock", "  auto f = std::ifstream(path);   // open", "  auto buf = std::make_unique<char[]>(4096);", "  parse(f, buf.get());  // бросает!", "  commit();", "}"],
  raw: ["void handle() {", "  mu.lock();", "  FILE* f = fopen(path, \"r\");", "  char* buf = new char[4096];", "  parse(f, buf);   // бросает!", "  delete[] buf; fclose(f); mu.unlock();", "}"],
};
const RAII_STEPS: Record<"raii" | "raw", RStep[]> = {
  raii: [
    { line: 1, alive: ["lk (mutex захвачен)"], out: [], note: "Конструктор lock_guard захватывает мьютекс." },
    { line: 2, alive: ["lk (mutex захвачен)", "f (файл открыт)"], out: [], note: "ifstream открыл файл в конструкторе." },
    { line: 3, alive: ["lk (mutex захвачен)", "f (файл открыт)", "buf (4 КБ в куче)"], out: [], note: "unique_ptr владеет буфером." },
    { line: 4, alive: ["lk (mutex захвачен)", "f (файл открыт)", "buf (4 КБ в куче)"], out: ["throw ParseError"], note: "Исключение! Дальше — раскрутка стека: выходим из функции, не выполняя commit()." },
    { line: 6, alive: [], out: ["throw ParseError", "~unique_ptr: delete[] buf", "~ifstream: close(f)", "~lock_guard: mu.unlock()"], note: "При раскрутке деструкторы локальных объектов вызываются в обратном порядке создания. Мьютекс освобождён, файл закрыт, память возвращена — без единой строчки очистки." },
  ],
  raw: [
    { line: 1, alive: ["mutex захвачен"], out: [], note: "Ручной lock." },
    { line: 2, alive: ["mutex захвачен", "FILE* открыт"], out: [], note: "Ручной fopen." },
    { line: 3, alive: ["mutex захвачен", "FILE* открыт", "4 КБ в куче"], out: [], note: "Ручной new." },
    { line: 4, alive: ["mutex захвачен", "FILE* открыт", "4 КБ в куче"], out: ["throw ParseError"], note: "Исключение — строка с очисткой никогда не выполнится.", bad: true },
    { line: 6, alive: ["mutex захвачен НАВСЕГДА", "FILE* утёк", "4 КБ утекли"], out: ["throw ParseError"], note: "Утечка памяти и дескриптора, а мьютекс не отпущен — следующий вызов handle() зависнет навсегда (deadlock).", bad: true },
  ],
};

export function RaiiViz() {
  const [mode, setMode] = useState<"raii" | "raw">("raii");
  const [i, setI] = useState(0);
  const steps = RAII_STEPS[mode];
  const s = steps[Math.min(i, steps.length - 1)];
  return (
    <Frame
      title="Исключение посреди функции"
      hint="кто освободит ресурсы?"
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <Segmented value={mode} onChange={(m) => { setMode(m); setI(0); }} block options={[{ value: "raii", label: "RAII" }, { value: "raw", label: "Вручную" }]} />
          <StepControls onStep={() => setI(i + 1)} onBack={() => setI(i - 1)} canBack={i > 0} canStep={i < steps.length - 1} onReset={() => setI(0)} />
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <pre className="overflow-x-auto rounded-xl border border-line bg-bg/60 py-2 font-mono text-[11.5px] leading-[1.7]">
          {RAII_CODE[mode].map((l, k) => (
            <div key={k} className={cx("px-3", k === s.line ? (s.bad ? "bg-bad/15 text-ink" : "bg-accent/15 text-ink") : "text-dim")}>
              {l}
            </div>
          ))}
        </pre>
        <div className="grid content-start gap-3">
          <div>
            <Caption>Живые ресурсы</Caption>
            <div className="grid gap-1">
              {s.alive.length === 0 && <span className="font-mono text-[11.5px] text-ok">ничего не утекло</span>}
              {s.alive.map((a) => (
                <span key={a} className={cx("rounded-md px-2 py-1 font-mono text-[11.5px]", s.bad && s.line === 6 ? "bg-bad/15 text-bad" : "bg-blue/15 text-ink")}>
                  {a}
                </span>
              ))}
            </div>
          </div>
          <div>
            <Caption>События</Caption>
            {s.out.map((o) => (
              <div key={o} className={cx("font-mono text-[11.5px]", o.startsWith("throw") ? "text-amber" : "text-ok")}>
                {o}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 rounded-xl border border-line bg-bg/40 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-dim">{s.note}</p>
    </Frame>
  );
}

// ══ C++: копирование против перемещения ═══════════════════════

export function MoveViz() {
  const [op, setOp] = useState<"copy" | "move" | "none">("none");
  const [log, setLog] = useState<string[]>([]);
  const a = { name: "a", buf: "B1", text: "очень длинная строка…" };
  const b = op === "copy" ? { name: "b", buf: "B2", text: "очень длинная строка…" } : op === "move" ? { name: "b", buf: "B1", text: "очень длинная строка…" } : null;
  const aAfter = op === "move" ? { ...a, buf: "—", text: "\"\" (валидное, но пустое)" } : a;
  const Obj = ({ o, color }: { o: { name: string; buf: string; text: string }; color: string }) => (
    <div className="rounded-xl border border-line bg-bg/40 p-2.5">
      <div className="font-mono text-[12px] text-ink">std::string {o.name}</div>
      <div className="mt-1 grid grid-cols-3 gap-1 font-mono text-[10.5px]">
        <span className="rounded bg-raised px-1 py-0.5 text-dim">ptr → {o.buf}</span>
        <span className="rounded bg-raised px-1 py-0.5 text-dim">size</span>
        <span className="rounded bg-raised px-1 py-0.5 text-dim">cap</span>
      </div>
      <div className="mt-1 truncate text-[11.5px]" style={{ color }}>
        {o.text}
      </div>
    </div>
  );
  return (
    <Frame title="Копирование против перемещения" hint="std::string на 10 МБ">
      <div className="grid grid-cols-3 gap-2">
        <Button variant={op === "copy" ? "primary" : "secondary"} onClick={() => { setOp("copy"); setLog((l) => [...l, "auto b = a; — копирующий конструктор: new char[10 МБ] + memcpy. O(n), и теперь два буфера"]); }}>
          b = a
        </Button>
        <Button variant={op === "move" ? "primary" : "secondary"} onClick={() => { setOp("move"); setLog((l) => [...l, "auto b = std::move(a); — перемещающий конструктор: забрать указатель, у a обнулить. O(1), ни байта данных не скопировано"]); }}>
          b = std::move(a)
        </Button>
        <Button onClick={() => { setOp("none"); setLog([]); }}>Сначала</Button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_1fr]">
        <Obj o={aAfter} color={op === "move" ? C.mute : C.ink} />
        {b ? <Obj o={b} color={C.ink} /> : <div className="rounded-xl border border-dashed border-line p-2.5 font-mono text-[11.5px] text-mute">b ещё не создан</div>}
        <div className="grid gap-1.5">
          <Caption className="mb-0">Буферы в куче</Caption>
          <div className={cx("rounded-md px-2 py-1.5 font-mono text-[11.5px]", op === "move" ? "bg-accent/15 text-ink" : "bg-blue/15 text-ink")}>B1 · 10 МБ {op === "move" ? "→ теперь владеет b" : "→ владеет a"}</div>
          {op === "copy" && <div className="rounded-md bg-amber/15 px-2 py-1.5 font-mono text-[11.5px] text-ink">B2 · 10 МБ копия → b</div>}
        </div>
      </div>
      <Legend className="mt-3" items={[{ color: C.amber, label: "лишняя аллокация и копирование" }, { color: C.accent, label: "буфер сменил владельца" }]} />
      <Log className="mt-3" lines={log} max={3} empty="std::move ничего не перемещает сам — это просто приведение к rvalue-ссылке, которое выбирает перемещающий конструктор." />
    </Frame>
  );
}

// ══ C++: инвалидация итераторов vector ════════════════════════

export function VectorInvalidation() {
  const [size, setSize] = useState(3);
  const [cap, setCap] = useState(4);
  const [bufAddr, setBufAddr] = useState(0x1000);
  const [ptrAddr] = useState(0x1000 + 1 * 4);
  const [dangling, setDangling] = useState(false);
  const [log, setLog] = useState<string[]>(["int* p = &v[1]; // запомнили адрес второго элемента"]);
  const push = () => {
    if (size < cap) {
      setSize(size + 1);
      setLog((l) => [...l, `push_back: место есть (size ${size + 1}/${cap}) — буфер тот же, p валиден`]);
    } else {
      const nb = bufAddr + 0x400;
      setCap(cap * 2);
      setSize(size + 1);
      setBufAddr(nb);
      setDangling(true);
      setLog((l) => [...l, `push_back: ёмкость кончилась → новый буфер ${hx(nb)} на ${cap * 2}, элементы перенесены, старый освобождён. p указывает в освобождённую память!`]);
    }
  };
  return (
    <Frame title="std::vector: указатель на элемент после push_back" hint="vector<int> v = {1, 2, 3}">
      <div className="grid gap-2">
        {[
          { addr: dangling ? 0x1000 : bufAddr, cells: dangling ? cap / 2 : cap, old: dangling },
          ...(dangling ? [{ addr: bufAddr, cells: cap, old: false }] : []),
        ].map((buf) => (
          <div key={buf.addr} className="grid grid-cols-[72px_1fr] items-center gap-2">
            <span className={cx("font-mono text-[11px]", buf.old ? "text-bad" : "text-dim")}>{hx(buf.addr)}</span>
            <div className="flex gap-1">
              {Array.from({ length: buf.cells }, (_, k) => {
                const filled = buf.old ? true : k < size;
                const isP = buf.addr + k * 4 === ptrAddr;
                return (
                  <div
                    key={k}
                    className="flex h-9 flex-1 items-center justify-center rounded-md border font-mono text-[12px]"
                    style={{
                      borderColor: isP ? (buf.old ? C.bad : C.amber) : "var(--color-line)",
                      borderWidth: isP ? 2 : 1,
                      background: buf.old ? "repeating-linear-gradient(135deg, color-mix(in oklab, var(--color-bad) 25%, transparent) 0 2px, transparent 2px 6px)" : filled ? "color-mix(in oklab, var(--color-accent) 20%, transparent)" : "transparent",
                      color: filled ? C.ink : C.mute,
                    }}
                  >
                    {buf.old ? "?" : filled ? k + 1 : ""}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
        <Button variant="primary" onClick={push}>
          v.push_back(x)
        </Button>
        <Button onClick={() => { setSize(3); setCap(4); setBufAddr(0x1000); setDangling(false); setLog(["int* p = &v[1];"]); }}>Сначала</Button>
      </div>
      <Metrics className="mt-3">
        <Metric label="size / capacity" value={`${size} / ${cap}`} />
        <Metric label="p" value={hx(ptrAddr)} tone={dangling ? "bad" : "amber"} />
        <Metric label="*p" value={dangling ? "UB" : "2"} tone={dangling ? "bad" : "ok"} />
        <Metric label="буфер" value={hx(bufAddr)} />
      </Metrics>
      <Log className="mt-3" lines={log} max={3} />
    </Frame>
  );
}

// ══ Undefined behaviour: что делает оптимизатор ══════════════

const UB_CASES: { id: string; title: string; code: string; o0: string; o2: string; why: string }[] = [
  {
    id: "overflow",
    title: "Переполнение int",
    code: "bool will_overflow(int x) {\n  return x + 1 < x;\n}",
    o0: "will_overflow(INT_MAX) → true (сложение «завернулось»)",
    o2: "компилятор заменил тело на `return false;` → false",
    why: "Переполнение знакового int — UB. Значит, компилятор вправе считать, что x + 1 всегда больше x, и выкинуть проверку. Проверяй до операции: x == INT_MAX, или __builtin_add_overflow.",
  },
  {
    id: "loop",
    title: "Бесконечный цикл",
    code: "for (int i = 1; i > 0; i++) {\n  if (i == 1000) puts(\"тысяча\");\n}",
    o0: "цикл дойдёт до INT_MAX, переполнится в отрицательное и закончится",
    o2: "условие i > 0 «всегда истинно» → бесконечный цикл",
    why: "Из-за того же UB оптимизатор доказывает, что i, начиная с 1 и только увеличиваясь, никогда не станет ≤ 0.",
  },
  {
    id: "null",
    title: "Разыменование до проверки",
    code: "int get(struct S* p) {\n  int v = p->x;\n  if (p == NULL) return -1;\n  return v;\n}",
    o0: "get(NULL) → падение на p->x",
    o2: "проверка p == NULL удалена: раз p уже разыменован, он «не может» быть NULL",
    why: "Такой баг в ядре Linux (2009) превратил проверку на NULL в мёртвый код и стал уязвимостью. Проверяй до использования.",
  },
  {
    id: "oob",
    title: "Выход за массив",
    code: "int t[4];\nbool exists(int v) {\n  for (int i = 0; i <= 4; i++)\n    if (t[i] == v) return true;\n  return false;\n}",
    o0: "читает t[4] — чужую память, иногда находит «v»",
    o2: "компилятор вправе решить, что функция всегда возвращает true",
    why: "Доступ к t[4] — UB, значит, «до него дело не дойдёт» — то есть цикл обязательно вернётся раньше. Классический пример из GCC.",
  },
];

export function UbViz() {
  const [id, setId] = useState("overflow");
  const [opt, setOpt] = useState<"o0" | "o2">("o2");
  const c = UB_CASES.find((x) => x.id === id)!;
  return (
    <Frame title="Undefined behaviour и оптимизатор" hint="одна программа — разные результаты">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
        {UB_CASES.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setId(x.id)}
            className={cx("shrink-0 rounded-full border px-3 py-1.5 text-[13px] transition", x.id === id ? "border-accent/60 bg-accent/12 text-accent" : "border-line text-dim hover:text-ink")}
          >
            {x.title}
          </button>
        ))}
      </div>
      <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-bg/60 px-3 py-2 font-mono text-[12px] leading-[1.65] text-ink">{c.code}</pre>
      <div className="mt-3">
        <Segmented value={opt} onChange={setOpt} block options={[{ value: "o0", label: "gcc -O0" }, { value: "o2", label: "gcc -O2" }]} />
      </div>
      <div className={cx("mt-3 rounded-xl border px-3.5 py-2.5 font-mono text-[12.5px]", opt === "o2" ? "border-bad/40 bg-bad/10 text-bad" : "border-amber/40 bg-amber/10 text-amber")}>{opt === "o0" ? c.o0 : c.o2}</div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">{c.why}</p>
    </Frame>
  );
}
