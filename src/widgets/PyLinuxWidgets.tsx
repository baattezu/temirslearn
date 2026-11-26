import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Slider, Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Legend, Log, Metric, Metrics, rng, StepControls } from "./kit";

// ══ Python: имена и объекты ═════════════════════════════════

interface PObj {
  id: string;
  type: string;
  repr: string;
}
interface PSnap {
  line: number;
  names: [string, string][];
  objs: PObj[];
  note: string;
}
const PY_CODE = ["a = [1, 2]", "b = a", "b.append(3)", "c = a[:]", "def f(xs): xs += [4]", "f(a)", "x = 1000; y = 1000", "x is y, 5 is 2 + 3", "t = (a, 'k')"];
const L1 = (r: string): PObj => ({ id: "L1", type: "list", repr: r });
const PY_SNAPS: PSnap[] = [
  { line: 0, names: [["a", "L1"]], objs: [L1("[1, 2]")], note: "Присваивание не копирует — оно привязывает имя к объекту. Переменная в Python — ярлык, а не ячейка." },
  { line: 1, names: [["a", "L1"], ["b", "L1"]], objs: [L1("[1, 2]")], note: "b = a — второй ярлык на тот же объект. refcount списка = 2." },
  { line: 2, names: [["a", "L1"], ["b", "L1"]], objs: [L1("[1, 2, 3]")], note: "Меняем объект через b — меняется «и a», потому что это один объект." },
  { line: 3, names: [["a", "L1"], ["b", "L1"], ["c", "L2"]], objs: [L1("[1, 2, 3]"), { id: "L2", type: "list", repr: "[1, 2, 3]" }], note: "Срез создаёт новый список (поверхностная копия). Элементы — те же объекты int." },
  { line: 5, names: [["a", "L1"], ["b", "L1"], ["c", "L2"], ["f.xs", "L1"]], objs: [L1("[1, 2, 3, 4]"), { id: "L2", type: "list", repr: "[1, 2, 3]" }], note: "Аргумент передаётся как ссылка на объект. += для списка — это extend на месте: изменился исходный список. (Для кортежа или int += создал бы новый объект.)" },
  {
    line: 6,
    names: [["a", "L1"], ["b", "L1"], ["c", "L2"], ["x", "I1"], ["y", "I2"]],
    objs: [L1("[1, 2, 3, 4]"), { id: "L2", type: "list", repr: "[1, 2, 3]" }, { id: "I1", type: "int", repr: "1000" }, { id: "I2", type: "int", repr: "1000" }],
    note: "Два разных объекта int со значением 1000 (в REPL — точно; в одном модуле компилятор может их объединить).",
  },
  {
    line: 7,
    names: [["a", "L1"], ["b", "L1"], ["c", "L2"], ["x", "I1"], ["y", "I2"]],
    objs: [L1("[1, 2, 3, 4]"), { id: "L2", type: "list", repr: "[1, 2, 3]" }, { id: "I1", type: "int", repr: "1000" }, { id: "I2", type: "int", repr: "1000" }, { id: "S5", type: "int (кэш)", repr: "5" }],
    note: "x == y — True, x is y — False. А 5 is 2 + 3 — True: числа от −5 до 256 кэшированы. Сравнивай значения через ==, is — только для None и синглтонов.",
  },
  {
    line: 8,
    names: [["a", "L1"], ["b", "L1"], ["c", "L2"], ["t", "T1"]],
    objs: [L1("[1, 2, 3, 4]"), { id: "L2", type: "list", repr: "[1, 2, 3]" }, { id: "T1", type: "tuple", repr: "(→L1, 'k')" }],
    note: "Кортеж неизменяем — нельзя заменить его элементы. Но элемент-список внутри изменяем: t[0].append(5) сработает. Поэтому такой кортеж нельзя использовать как ключ dict — он не хешируется.",
  },
];

export function PyNames() {
  const [i, setI] = useState(0);
  const s = PY_SNAPS[i];
  const refc = (id: string) => s.names.filter(([, o]) => o === id).length + (id === "L1" && s.objs.some((o) => o.id === "T1") ? 1 : 0);
  return (
    <Frame title="Имена и объекты" hint="как в Python Tutor" controls={<StepControls onStep={() => setI(i + 1)} onBack={() => setI(i - 1)} canBack={i > 0} canStep={i < PY_SNAPS.length - 1} onReset={() => setI(0)} />}>
      <div className="grid gap-4 md:grid-cols-[1fr_0.8fr_1.1fr]">
        <pre className="overflow-x-auto rounded-xl border border-line bg-bg/60 py-2 font-mono text-[11.5px] leading-[1.7]">
          {PY_CODE.map((l, k) => (
            <div key={k} className={cx("px-3", k === s.line ? "bg-accent/15 text-ink" : k < s.line ? "text-dim" : "text-mute")}>
              {l}
            </div>
          ))}
        </pre>
        <div>
          <Caption>Имена</Caption>
          <div className="grid gap-1">
            {s.names.map(([n, o]) => (
              <div key={n} className="flex justify-between rounded-md border border-line px-2.5 py-1 font-mono text-[12px]">
                <span className="text-ink">{n}</span>
                <span className="text-amber">→ {o}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <Caption>Объекты в куче</Caption>
          <div className="grid gap-1.5">
            {s.objs.map((o) => (
              <div key={o.id} className="rounded-lg border border-line-strong bg-raised px-2.5 py-1.5">
                <div className="flex justify-between font-mono text-[11px] text-mute">
                  <span>
                    {o.id} · {o.type}
                  </span>
                  <span>refcount {refc(o.id) || "—"}</span>
                </div>
                <div className="font-mono text-[13px] text-ink">{o.repr}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 rounded-xl border border-line bg-bg/40 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-dim">{s.note}</p>
    </Frame>
  );
}

// ══ GIL: потоки, процессы, asyncio ═══════════════════════════

type PyMode = "threads" | "procs" | "async";
type Seg = { kind: "cpu" | "io"; ms: number };
const WORKLOADS: Record<string, { label: string; tasks: Seg[][] }> = {
  io: {
    label: "I/O: 3 HTTP-запроса",
    tasks: [0, 1, 2].map(() => [{ kind: "cpu", ms: 5 }, { kind: "io", ms: 100 }, { kind: "cpu", ms: 5 }] as Seg[]),
  },
  cpu: {
    label: "CPU: 3 расчёта",
    tasks: [0, 1, 2].map(() => [{ kind: "cpu", ms: 100 }] as Seg[]),
  },
};

function schedule(tasks: Seg[][], mode: PyMode) {
  // возвращает для каждой задачи список [start, end, kind, waiting?]
  const out: { s: number; e: number; kind: "cpu" | "io" | "wait" }[][] = tasks.map(() => []);
  if (mode === "procs") {
    tasks.forEach((t, k) => {
      let time = 20; // старт процесса
      out[k].push({ s: 0, e: 20, kind: "wait" });
      for (const seg of t) {
        out[k].push({ s: time, e: time + seg.ms, kind: seg.kind });
        time += seg.ms;
      }
    });
    return out;
  }
  // один исполнитель Python-байткода (GIL или event loop): CPU-сегменты сериализуются, I/O идёт параллельно
  const ptr = tasks.map(() => 0);
  const ready = tasks.map(() => 0);
  let cpuFree = 0;
  for (let guard = 0; guard < 200; guard++) {
    let best = -1;
    for (let k = 0; k < tasks.length; k++) if (ptr[k] < tasks[k].length && (best < 0 || ready[k] < ready[best])) best = k;
    if (best < 0) break;
    const seg = tasks[best][ptr[best]];
    if (seg.kind === "io") {
      out[best].push({ s: ready[best], e: ready[best] + seg.ms, kind: "io" });
      ready[best] += seg.ms;
    } else {
      // потоки с GIL переключаются каждые 5 мс — моделируем кусками; asyncio не переключает до await
      const slice = mode === "threads" ? 5 : seg.ms;
      const start = Math.max(cpuFree, ready[best]);
      if (start > ready[best]) out[best].push({ s: ready[best], e: start, kind: "wait" });
      const run = Math.min(slice, seg.ms);
      out[best].push({ s: start, e: start + run, kind: "cpu" });
      cpuFree = start + run;
      ready[best] = start + run;
      if (run < seg.ms) {
        tasks = tasks.map((t, k) => (k === best ? t.map((x, j) => (j === ptr[best] ? { ...x, ms: x.ms - run } : x)) : t));
        continue;
      }
    }
    ptr[best]++;
  }
  return out;
}

export function GilTimeline() {
  const [wl, setWl] = useState("io");
  const [mode, setMode] = useState<PyMode>("threads");
  const rows = useMemo(() => schedule(WORKLOADS[wl].tasks, mode), [wl, mode]);
  const end = Math.max(...rows.flat().map((r) => r.e));
  const scale = 340;
  const W = 560;
  const color = { cpu: C.accent, io: C.blue, wait: "color-mix(in oklab, var(--color-rose) 35%, transparent)" };
  return (
    <Frame title="Три задачи: потоки, процессы, asyncio" hint="CPython с GIL">
      <div className="grid gap-3 sm:grid-cols-2">
        <Segmented value={wl} onChange={setWl} block options={Object.entries(WORKLOADS).map(([k, v]) => ({ value: k, label: v.label }))} />
        <Segmented<PyMode> value={mode} onChange={setMode} block options={[{ value: "threads", label: "threading" }, { value: "procs", label: "multiprocessing" }, { value: "async", label: "asyncio" }]} />
      </div>
      <svg viewBox={`-80 0 ${W + 84} ${rows.length * 34 + 24}`} className="mt-4 block w-full">
        {rows.map((r, k) => (
          <g key={k}>
            <text x={-8} y={k * 34 + 20} textAnchor="end" fontSize={11} fill={C.dim} fontFamily="var(--font-mono)">
              {mode === "procs" ? `proc ${k + 1}` : mode === "async" ? `task ${k + 1}` : `thread ${k + 1}`}
            </text>
            {r.map((seg, j) => (
              <rect key={j} x={(seg.s / scale) * W} y={k * 34 + 8} width={Math.max(1, ((seg.e - seg.s) / scale) * W)} height={18} rx={3} fill={color[seg.kind]} />
            ))}
          </g>
        ))}
        <line x1={(end / scale) * W} x2={(end / scale) * W} y1={0} y2={rows.length * 34 + 8} stroke={C.amber} strokeDasharray="4 3" />
        <text x={(end / scale) * W} y={rows.length * 34 + 20} textAnchor="middle" fontSize={10} fill={C.amber} fontFamily="var(--font-mono)">
          {end} мс
        </text>
      </svg>
      <Legend items={[{ color: C.accent, label: "выполняет Python" }, { color: C.blue, label: "ждёт сеть/диск" }, { color: C.rose, label: "ждёт GIL / цикл / старт процесса" }]} />
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {wl === "io"
          ? mode === "procs"
            ? "Работает, но каждый процесс стоит десятки мегабайт и время на старт. Для I/O это стрельба из пушки."
            : "Во время ожидания I/O GIL отпущен — запросы идут параллельно. Для I/O подходят и потоки, и asyncio (а asyncio держит тысячи соединений дешевле потоков)."
          : mode === "procs"
            ? "У каждого процесса свой интерпретатор и свой GIL — расчёты действительно параллельны на трёх ядрах."
            : mode === "threads"
              ? "GIL: байткод Python в каждый момент выполняет один поток. Три CPU-задачи в потоках идут по очереди кусками по 5 мс — никакого ускорения."
              : "asyncio — один поток. CPU-задача без await блокирует весь event loop: остальные корутины ждут."}
      </p>
    </Frame>
  );
}

// ══ Linux: файловые дескрипторы ══════════════════════════════

interface FdSnap {
  title: string;
  procs: { name: string; fds: [number, string][] }[];
  files: { id: string; path: string; offset: number; refs: number }[];
  note: string;
}
const FD_SNAPS: FdSnap[] = [
  {
    title: "старт процесса",
    procs: [{ name: "shell (pid 100)", fds: [[0, "F0"], [1, "F1"], [2, "F1"]] }],
    files: [
      { id: "F0", path: "/dev/pts/0 (чтение)", offset: 0, refs: 1 },
      { id: "F1", path: "/dev/pts/0 (запись)", offset: 0, refs: 2 },
    ],
    note: "fd — просто индекс в таблице процесса. 0 — stdin, 1 — stdout, 2 — stderr. Записи указывают на «открытые файлы» ядра (с позицией и флагами).",
  },
  {
    title: "open(\"out.log\")",
    procs: [{ name: "shell (pid 100)", fds: [[0, "F0"], [1, "F1"], [2, "F1"], [3, "F2"]] }],
    files: [
      { id: "F0", path: "/dev/pts/0 (чтение)", offset: 0, refs: 1 },
      { id: "F1", path: "/dev/pts/0 (запись)", offset: 0, refs: 2 },
      { id: "F2", path: "out.log", offset: 0, refs: 1 },
    ],
    note: "open выдаёт наименьший свободный номер — 3.",
  },
  {
    title: "dup2(3, 1)",
    procs: [{ name: "shell (pid 100)", fds: [[0, "F0"], [1, "F2"], [2, "F1"], [3, "F2"]] }],
    files: [
      { id: "F0", path: "/dev/pts/0 (чтение)", offset: 0, refs: 1 },
      { id: "F1", path: "/dev/pts/0 (запись)", offset: 0, refs: 1 },
      { id: "F2", path: "out.log", offset: 0, refs: 2 },
    ],
    note: "Так shell делает `> out.log`: fd 1 теперь указывает на файл. Программа пишет в stdout как обычно — и не знает, что это файл.",
  },
  {
    title: "fork()",
    procs: [
      { name: "shell (pid 100)", fds: [[0, "F0"], [1, "F2"], [2, "F1"], [3, "F2"]] },
      { name: "child (pid 101)", fds: [[0, "F0"], [1, "F2"], [2, "F1"], [3, "F2"]] },
    ],
    files: [
      { id: "F0", path: "/dev/pts/0 (чтение)", offset: 0, refs: 2 },
      { id: "F1", path: "/dev/pts/0 (запись)", offset: 0, refs: 2 },
      { id: "F2", path: "out.log", offset: 0, refs: 4 },
    ],
    note: "fork копирует таблицу fd, но не открытые файлы: родитель и ребёнок делят одну позицию в out.log. Поэтому их записи не затирают друг друга.",
  },
  {
    title: "write ×2",
    procs: [
      { name: "shell (pid 100)", fds: [[0, "F0"], [1, "F2"], [2, "F1"], [3, "F2"]] },
      { name: "child (pid 101)", fds: [[0, "F0"], [1, "F2"], [2, "F1"]] },
    ],
    files: [
      { id: "F0", path: "/dev/pts/0 (чтение)", offset: 0, refs: 2 },
      { id: "F1", path: "/dev/pts/0 (запись)", offset: 0, refs: 2 },
      { id: "F2", path: "out.log", offset: 128, refs: 3 },
    ],
    note: "Ребёнок закрыл лишний fd 3, оба написали по 64 байта — позиция общая, 128. Забытые лишние fd — частая утечка: файл не закрывается, пайп не получает EOF.",
  },
];

export function FdTables() {
  const [i, setI] = useState(0);
  const s = FD_SNAPS[i];
  return (
    <Frame title="Файловые дескрипторы" hint={s.title} controls={<StepControls onStep={() => setI(i + 1)} onBack={() => setI(i - 1)} canBack={i > 0} canStep={i < FD_SNAPS.length - 1} onReset={() => setI(0)} />}>
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <div className="grid gap-2">
          {s.procs.map((p) => (
            <div key={p.name} className="rounded-xl border border-line bg-bg/40 p-2.5">
              <div className="mb-1.5 font-mono text-[11.5px] text-blue">{p.name} · таблица fd</div>
              <div className="grid gap-1">
                {p.fds.map(([fd, f]) => (
                  <div key={fd} className="flex justify-between rounded-md bg-surface px-2 py-0.5 font-mono text-[12px]">
                    <span className="text-ink">fd {fd}</span>
                    <span className="text-amber">→ {f}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div>
          <Caption>Открытые файлы (ядро)</Caption>
          <div className="grid gap-1.5">
            {s.files.map((f) => (
              <div key={f.id} className="rounded-lg border border-line-strong bg-raised px-2.5 py-1.5">
                <div className="flex justify-between font-mono text-[11px] text-mute">
                  <span className="text-amber">{f.id}</span>
                  <span>ссылок {f.refs}</span>
                </div>
                <div className="font-mono text-[12px] text-ink">{f.path}</div>
                <div className="font-mono text-[11px] text-dim">offset {f.offset}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 rounded-xl border border-line bg-bg/40 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-dim">{s.note}</p>
    </Frame>
  );
}

// ══ Page cache ═══════════════════════════════════════════════

interface PC {
  cached: Set<number>;
  dirty: Set<number>;
  diskReads: number;
  hits: number;
  log: string[];
}
const PAGES = 16;
export function PageCache() {
  const [s, setS] = useState<PC>({ cached: new Set(), dirty: new Set(), diskReads: 0, hits: 0, log: [] });
  const read = () =>
    setS((p) => {
      const c = new Set(p.cached);
      let miss = 0;
      for (let k = 0; k < 8; k++) if (!c.has(k)) { c.add(k); miss++; }
      return { ...p, cached: c, diskReads: p.diskReads + miss, hits: p.hits + 8 - miss, log: [...p.log, miss ? `cat config.json: ${miss} страниц прочитано с диска (~мс), теперь в page cache` : "cat config.json: все 8 страниц из page cache (~мкс)"] };
    });
  const write = () =>
    setS((p) => {
      const c = new Set(p.cached);
      const d = new Set(p.dirty);
      for (let k = 10; k < 14; k++) { c.add(k); d.add(k); }
      return { ...p, cached: c, dirty: d, log: [...p.log, "write(app.log): данные скопированы в page cache, страницы грязные. write вернулся сразу — на диске ещё ничего нет"] };
    });
  const fsync = () => setS((p) => ({ ...p, dirty: new Set(), log: [...p.log, `fsync: ${p.dirty.size} грязных страниц записаны и подтверждены диском. Только теперь данные переживут отключение питания`] }));
  const drop = () => setS((p) => ({ ...p, cached: new Set([...p.dirty]), log: [...p.log, "echo 3 > drop_caches / нехватка памяти: чистые страницы выброшены (их можно перечитать), грязные остаются до записи"] }));
  return (
    <Frame title="Page cache" hint="вся «свободная» память — кэш файлов">
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-16">
        {Array.from({ length: PAGES }, (_, k) => (
          <div
            key={k}
            className="flex aspect-square items-center justify-center rounded-md border font-mono text-[10px]"
            style={{
              borderColor: s.dirty.has(k) ? C.rose : s.cached.has(k) ? C.blue : "var(--color-line)",
              background: s.dirty.has(k) ? "color-mix(in oklab, var(--color-rose) 18%, transparent)" : s.cached.has(k) ? "color-mix(in oklab, var(--color-blue) 16%, transparent)" : "transparent",
              color: s.cached.has(k) ? C.ink : C.mute,
            }}
          >
            {k < 8 ? "cfg" : k >= 10 && k < 14 ? "log" : ""}
          </div>
        ))}
      </div>
      <Legend className="mt-2" items={[{ color: C.blue, label: "в кэше, чистая" }, { color: C.rose, label: "грязная — ещё не на диске" }]} />
      <div className="mt-3 grid grid-cols-2 gap-2 sm:flex">
        <Button variant="primary" onClick={read}>read</Button>
        <Button onClick={write}>write</Button>
        <Button onClick={fsync}>fsync</Button>
        <Button onClick={drop}>сбросить кэш</Button>
      </div>
      <Metrics className="mt-3">
        <Metric label="чтений с диска" value={s.diskReads} />
        <Metric label="попаданий" value={s.hits} tone="ok" />
        <Metric label="в кэше" value={`${s.cached.size * 4} КБ`} />
        <Metric label="грязных" value={s.dirty.size} tone={s.dirty.size ? "bad" : undefined} />
      </Metrics>
      <Log className="mt-3" lines={s.log} max={3} />
    </Frame>
  );
}

// ══ Очередь accept и backlog ═════════════════════════════════

export function AcceptQueue() {
  const [rate, setRate] = useState(1200);
  const [workers, setWorkers] = useState(4);
  const [ms, setMs] = useState(5);
  const [backlog, setBacklog] = useState(128);
  // упрощённая модель: каждый воркер принимает и обрабатывает соединение за ms
  const capacity = (workers * 1000) / ms;
  const sim = useMemo(() => {
    const pts: number[] = [];
    let q = 0;
    let dropped = 0;
    const r = rng(4);
    for (let t = 0; t < 100; t++) {
      const arrivals = (rate / 10) * (0.7 + r() * 0.6);
      q += arrivals - capacity / 10;
      if (q > backlog) {
        dropped += q - backlog;
        q = backlog;
      }
      q = Math.max(0, q);
      pts.push(q);
    }
    return { pts, dropped };
  }, [rate, capacity, backlog]);
  const W = 520;
  const H = 120;
  const wait = rate < capacity ? (sim.pts.at(-1)! / capacity) * 1000 : (backlog / capacity) * 1000;
  return (
    <Frame title="listen(backlog) и очередь accept" hint="10 секунд нагрузки">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Новых соединений/с" value={rate} min={100} max={3000} step={50} onChange={setRate} />
        <Slider label="Воркеров, принимающих accept" value={workers} min={1} max={16} onChange={setWorkers} />
        <Slider label="Обработка соединения" value={ms} min={1} max={20} onChange={setMs} display={`${ms} мс`} />
        <Slider label="backlog (somaxconn)" value={backlog} min={16} max={4096} step={16} onChange={setBacklog} />
      </div>
      <svg viewBox={`0 0 ${W} ${H + 10}`} className="mt-4 block w-full rounded-xl border border-line bg-bg/50">
        <line x1={0} x2={W} y1={H - H * 0.9} y2={H - H * 0.9} stroke={C.rose} strokeDasharray="4 4" />
        <polyline points={sim.pts.map((q, i) => `${(i / 99) * W},${H - (q / backlog) * H * 0.9}`).join(" ")} fill="none" stroke={C.amber} strokeWidth={2} />
        <text x={6} y={H - H * 0.9 - 4} fontSize={10} fill={C.rose} fontFamily="var(--font-mono)">
          backlog
        </text>
      </svg>
      <Metrics className="mt-3">
        <Metric label="мощность" value={`${Math.round(capacity)}/с`} />
        <Metric label="загрузка" value={`${Math.round((rate / capacity) * 100)}%`} tone={rate > capacity ? "bad" : rate > capacity * 0.8 ? "amber" : "ok"} />
        <Metric label="ожидание в очереди" value={`${wait.toFixed(0)} мс`} />
        <Metric label="отброшено SYN" value={Math.round(sim.dropped)} tone={sim.dropped > 0 ? "bad" : "ok"} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {rate > capacity
          ? "Поток больше мощности: очередь упирается в backlog, ядро отбрасывает новые соединения. Клиенты видят таймауты подключения (ретрансмит SYN через 1, 3, 7 с). Увеличение backlog не лечит — оно только превращает отказ в долгое ожидание."
          : rate > capacity * 0.8
            ? "Загрузка больше 80%: случайные всплески уже копят очередь. Задержка растёт нелинейно — классическое поведение очереди около насыщения."
            : "Мощности с запасом: очередь почти пустая, соединения принимаются сразу."}
      </p>
    </Frame>
  );
}

// ══ Перцентили задержек ═════════════════════════════════════

export function Percentiles() {
  const [tail, setTail] = useState(true);
  const [fanout, setFanout] = useState(1);
  const data = useMemo(() => {
    const r = rng(8);
    return Array.from({ length: 4000 }, () => {
      // логнормальная основа ~20 мс + редкие медленные (GC, промах кэша, блокировка)
      const u1 = r() || 1e-9;
      const u2 = r();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      let v = Math.exp(3 + 0.35 * z);
      if (tail && r() < 0.02) v += 300 + r() * 900;
      return v;
    }).sort((a, b) => a - b);
  }, [tail]);
  const pct = (p: number) => data[Math.min(data.length - 1, Math.floor((p / 100) * data.length))];
  const mean = data.reduce((a, b) => a + b, 0) / data.length;
  const bins = 48;
  const lo = 5;
  const hi = 2500;
  const W = 520;
  const H = 120;
  // логарифмическая ось: и тело, и хвост видно на одном графике
  const X = (v: number) => (Math.log(Math.max(lo, Math.min(hi, v)) / lo) / Math.log(hi / lo)) * W;
  const hist = Array(bins).fill(0);
  for (const v of data) hist[Math.min(bins - 1, Math.floor((X(v) / W) * bins))]++;
  const hmax = Math.max(...hist);
  const pSlow = 1 - 0.99 ** fanout;
  return (
    <Frame title="Среднее врёт: распределение задержек" hint="4000 запросов">
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <Toggle checked={tail} onChange={setTail} label="2% медленных (GC, блокировки, ретраи)" />
        <Slider label="Запрос веером в N сервисов" value={fanout} min={1} max={100} onChange={setFanout} />
      </div>
      <svg viewBox={`0 0 ${W} ${H + 26}`} className="mt-4 block w-full">
        {hist.map((h, i) => (
          <rect key={i} x={(i / bins) * W + 1} y={H - (Math.sqrt(h) / Math.sqrt(hmax)) * H} width={W / bins - 2} height={(Math.sqrt(h) / Math.sqrt(hmax)) * H} rx={2} fill={C.blue} opacity={0.6} />
        ))}
        {[10, 100, 1000].map((v) => (
          <text key={v} x={X(v)} y={H + 18} textAnchor="middle" fontSize={10} fill={C.mute} fontFamily="var(--font-mono)">
            {v}
          </text>
        ))}
        {[
          ["mean", mean, C.rose],
          ["p50", pct(50), C.ok],
          ["p95", pct(95), C.amber],
          ["p99", pct(99), C.bad],
        ].map(([l, v, c], k) => (
          <g key={l as string}>
            <line x1={X(v as number)} x2={X(v as number)} y1={0} y2={H} stroke={c as string} strokeWidth={2} />
            <text x={X(v as number) + 3} y={12 + k * 13} fontSize={10} fill={c as string} fontFamily="var(--font-mono)">
              {l as string} {Math.round(v as number)}
            </text>
          </g>
        ))}
        <text x={W} y={H + 18} textAnchor="end" fontSize={10} fill={C.mute} fontFamily="var(--font-mono)">
          мс, лог. шкала
        </text>
      </svg>
      <Metrics className="mt-3">
        <Metric label="p50" value={`${Math.round(pct(50))} мс`} tone="ok" />
        <Metric label="среднее" value={`${Math.round(mean)} мс`} />
        <Metric label="p99" value={`${Math.round(pct(99))} мс`} tone="bad" />
        <Metric label="p99.9" value={`${Math.round(pct(99.9))} мс`} tone="bad" />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Типичный пользователь (p50) получает ~20 мс, среднее его не описывает, а 1% запросов ждёт в десятки раз дольше. При обращении к {fanout} сервисам за один пользовательский запрос шанс задеть хотя бы один p99-хвост — <b className="text-ink">{(pSlow * 100).toFixed(0)}%</b>. Поэтому в распределённых системах важен хвост, а не середина.
      </p>
    </Frame>
  );
}

// ══ Репликация: лаг и потеря данных при failover ══════════════

export function ReplicationLag() {
  const [sync, setSync] = useState(false);
  const [lsn, setLsn] = useState({ primary: 100, replica: 100 });
  const [log, setLog] = useState<string[]>([]);
  const [dead, setDead] = useState(false);
  const write = () => {
    if (dead) return;
    if (sync) {
      setLsn((l) => ({ primary: l.primary + 1, replica: l.primary + 1 }));
      setLog((x) => [...x, `UPDATE: COMMIT ждёт подтверждения реплики (+1 RTT) → LSN ${lsn.primary + 1} на обоих`]);
    } else {
      setLsn((l) => ({ ...l, primary: l.primary + 1 }));
      setLog((x) => [...x, `UPDATE: COMMIT сразу, LSN ${lsn.primary + 1} — реплика догонит позже`]);
    }
  };
  const replay = () => setLsn((l) => ({ ...l, replica: Math.min(l.primary, l.replica + 1) }));
  const readReplica = () => setLog((x) => [...x, lsn.replica < lsn.primary ? `SELECT с реплики: видит LSN ${lsn.replica}, а свои последние ${lsn.primary - lsn.replica} изменения пользователь НЕ видит` : "SELECT с реплики: данные актуальны"]);
  const failover = () => {
    setDead(true);
    const lost = lsn.primary - lsn.replica;
    setLog((x) => [...x, lost ? `💥 primary упал. Реплика повышена до primary на LSN ${lsn.replica}: потеряно ${lost} подтверждённых транзакций` : `💥 primary упал. Реплика повышена — ничего не потеряно`]);
  };
  const reset = () => {
    setDead(false);
    setLsn({ primary: 100, replica: 100 });
    setLog([]);
  };
  const lag = lsn.primary - lsn.replica;
  return (
    <Frame
      title="Потоковая репликация"
      hint="WAL от primary к реплике"
      controls={
        <div className="grid gap-3">
          <Toggle checked={sync} onChange={(v) => { setSync(v); reset(); }} label="synchronous_commit = remote_apply" />
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="primary" onClick={write} disabled={dead}>
              запись в primary
            </Button>
            <Button onClick={replay} disabled={sync || dead || lag === 0}>
              реплика догоняет
            </Button>
            <Button onClick={readReplica}>чтение с реплики</Button>
            <Button variant="danger" onClick={failover} disabled={dead}>
              failover
            </Button>
            <Button onClick={reset}>Сначала</Button>
          </div>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        {(["primary", "replica"] as const).map((k) => (
          <div key={k} className={cx("rounded-xl border p-3", k === "primary" && dead ? "border-bad/40 opacity-50" : "border-line bg-bg/40")}>
            <div className="font-mono text-[11px] text-mute">{k === "primary" ? (dead ? "primary — упал" : "primary") : dead ? "replica → новый primary" : "replica (hot standby)"}</div>
            <div className="mt-1 font-mono text-[24px] font-semibold text-ink">LSN {lsn[k]}</div>
            <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-raised">
              <div className="h-full rounded-full" style={{ width: `${((lsn[k] - 95) / Math.max(10, lsn.primary - 95)) * 100}%`, background: k === "primary" ? C.blue : C.accent }} />
            </div>
          </div>
        ))}
      </div>
      <Metrics className="mt-3 sm:grid-cols-2">
        <Metric label="лаг реплики" value={`${lag} транзакций`} tone={lag ? "amber" : "ok"} />
        <Metric label="задержка COMMIT" value={sync ? "+1 RTT до реплики" : "локально"} />
      </Metrics>
      <Log className="mt-3" lines={log} max={4} empty="Сделай несколько записей, почитай с реплики, потом урони primary." />
    </Frame>
  );
}

// ══ Trie и Union-Find ════════════════════════════════════════

const WORDS = ["car", "cart", "care", "cat", "dog", "do", "dot", "card"];
interface TNode {
  ch: string;
  end: boolean;
  kids: Record<string, TNode>;
}
export function TrieViz() {
  const [n, setN] = useState(5);
  const [prefix, setPrefix] = useState("car");
  const root = useMemo(() => {
    const r: TNode = { ch: "", end: false, kids: {} };
    for (const w of WORDS.slice(0, n)) {
      let cur = r;
      for (const ch of w) cur = cur.kids[ch] ??= { ch, end: false, kids: {} };
      cur.end = true;
    }
    return r;
  }, [n]);
  // раскладка: листья по порядку
  const nodes: { x: number; y: number; ch: string; end: boolean; path: string; parent?: [number, number] }[] = [];
  let leaf = 0;
  const walk = (t: TNode, depth: number, path: string, parent?: [number, number]): number => {
    const kids = Object.values(t.kids);
    let x: number;
    const self = nodes.length;
    nodes.push({ x: 0, y: depth, ch: t.ch, end: t.end, path, parent });
    if (!kids.length) x = leaf++;
    else {
      const xs = kids.map((k) => walk(k, depth + 1, path + k.ch, [self, depth]));
      x = (xs[0] + xs[xs.length - 1]) / 2;
    }
    nodes[self].x = x;
    return x;
  };
  walk(root, 0, "");
  const W = Math.max(1, leaf) * 44;
  const matches = WORDS.slice(0, n).filter((w) => w.startsWith(prefix));
  return (
    <Frame title="Trie: дерево префиксов" hint={`слов: ${n}`}>
      <div className="grid gap-3 sm:grid-cols-2 sm:items-end">
        <Slider label="Добавить слов" value={n} min={1} max={WORDS.length} onChange={setN} display={WORDS.slice(0, n).join(", ")} />
        <div className="flex flex-wrap gap-1.5">
          {["", "ca", "car", "do", "x"].map((p) => (
            <Chip key={p} active={p === prefix} onClick={() => setPrefix(p)} className="font-mono">
              {p || "∅"}
            </Chip>
          ))}
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`-10 -6 ${W + 20} ${5 * 46 + 30}`} className="mx-auto block" style={{ width: Math.max(W, 280), maxWidth: "100%" }}>
          {nodes.map((nd, i) =>
            nd.parent ? (
              <line key={`e${i}`} x1={nodes[nd.parent[0]].x * 44 + 22} y1={nd.parent[1] * 46 + 18} x2={nd.x * 44 + 22} y2={nd.y * 46 + 18} stroke={prefix && nd.path.length <= prefix.length && prefix.startsWith(nd.path) ? C.accent : C.lineStrong} strokeWidth={1.5} />
            ) : null,
          )}
          {nodes.map((nd, i) => {
            const onPath = prefix !== "" && nd.path.length <= prefix.length && prefix.startsWith(nd.path);
            const under = prefix !== "" && nd.path.startsWith(prefix) && nd.path.length > prefix.length;
            return (
              <g key={i}>
                <circle cx={nd.x * 44 + 22} cy={nd.y * 46 + 18} r={14} fill={onPath ? "color-mix(in oklab, var(--color-accent) 25%, var(--color-surface))" : under ? "color-mix(in oklab, var(--color-blue) 18%, var(--color-surface))" : C.raised} stroke={nd.end ? C.amber : C.lineStrong} strokeWidth={nd.end ? 2.2 : 1} />
                <text x={nd.x * 44 + 22} y={nd.y * 46 + 22.5} textAnchor="middle" fontSize={13} fill={C.ink} fontFamily="var(--font-mono)">
                  {nd.ch || "·"}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <Legend className="mt-2" items={[{ color: C.accent, label: "путь префикса" }, { color: C.blue, label: "поддерево — все продолжения" }, { color: C.amber, label: "конец слова" }]} />
      <div className="mt-3 rounded-xl border border-line bg-bg/40 px-3.5 py-2.5 font-mono text-[12.5px] text-dim">
        startsWith(&quot;{prefix}&quot;) → {matches.length ? matches.join(", ") : "ничего"} · пройдено узлов: {prefix.length}
      </div>
    </Frame>
  );
}

export function UnionFind() {
  const N = 10;
  const [parent, setParent] = useState(() => Array.from({ length: N }, (_, i) => i));
  const [rank, setRank] = useState(() => Array(N).fill(0) as number[]);
  const [compress, setCompress] = useState(true);
  const [log, setLog] = useState<string[]>([]);
  const [a, setA] = useState<number | null>(null);
  const find = (p: number[], x: number, path: number[] = []): number => {
    path.push(x);
    return p[x] === x ? x : find(p, p[x], path);
  };
  const click = (i: number) => {
    if (a === null) return setA(i);
    const p = [...parent];
    const r = [...rank];
    const pa: number[] = [];
    const pb: number[] = [];
    let ra = find(p, a, pa);
    let rb = find(p, i, pb);
    if (compress) [...pa, ...pb].forEach((x) => (p[x] = x === ra || pa.includes(x) ? ra : rb));
    if (ra === rb) {
      setLog((l) => [...l, `union(${a}, ${i}): уже в одном множестве (корень ${ra}) — это был бы цикл`]);
    } else {
      if (r[ra] < r[rb]) [ra, rb] = [rb, ra];
      p[rb] = ra;
      if (r[ra] === r[rb]) r[ra]++;
      setLog((l) => [...l, `union(${a}, ${i}): find(${a}) за ${pa.length} шаг(а) → ${find(parent, a)}, find(${i}) за ${pb.length} → ${find(parent, i)}; меньшее дерево под большее`]);
    }
    setParent(p);
    setRank(r);
    setA(null);
  };
  const roots = parent.map((_, i) => find(parent, i));
  const comps = new Set(roots).size;
  const depth = (i: number) => {
    let d = 0;
    while (parent[i] !== i) {
      i = parent[i];
      d++;
    }
    return d;
  };
  const colors = [C.accent, C.blue, C.amber, C.violet, C.teal, C.rose, "#9cc744", "#e79bff", "#8fb8ff", "#ffd08a"];
  return (
    <Frame title="Union-Find" hint="кликни две вершины — объединить">
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {parent.map((p, i) => (
          <button
            key={i}
            type="button"
            onClick={() => click(i)}
            className={cx("flex flex-col items-center rounded-xl border py-2 transition", a === i ? "border-amber bg-amber/10" : "border-line hover:border-line-strong")}
          >
            <span className="flex size-8 items-center justify-center rounded-full font-mono text-[13px] font-semibold text-bg" style={{ background: colors[roots[i]] }}>
              {i}
            </span>
            <span className="mt-1 font-mono text-[10px] text-mute">parent {p}</span>
            <span className="font-mono text-[10px] text-mute">глубина {depth(i)}</span>
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-4">
        <Toggle checked={compress} onChange={setCompress} label="Сжатие путей" />
        <Button size="sm" onClick={() => { setParent(Array.from({ length: N }, (_, i) => i)); setRank(Array(N).fill(0)); setLog([]); setA(null); }}>
          Сначала
        </Button>
      </div>
      <Metrics className="mt-3 sm:grid-cols-2">
        <Metric label="компонент связности" value={comps} tone="accent" />
        <Metric label="макс. глубина" value={Math.max(...parent.map((_, i) => depth(i)))} />
      </Metrics>
      <Log className="mt-3" lines={log} max={3} empty="Цвет — к какому корню (множеству) относится вершина." />
    </Frame>
  );
}

// ══ Перебор с возвратом: N ферзей ═════════════════════════════

export function NQueens() {
  const [n, setN] = useState(6);
  const frames = useMemo(() => {
    const out: { cols: number[]; trying: [number, number] | null; bad: boolean; solved: boolean }[] = [];
    const cols: number[] = [];
    let solved = false;
    const ok = (r: number, c: number) => cols.every((cc, rr) => cc !== c && Math.abs(cc - c) !== r - rr);
    const go = (r: number) => {
      if (solved) return;
      if (r === n) {
        solved = true;
        out.push({ cols: [...cols], trying: null, bad: false, solved: true });
        return;
      }
      for (let c = 0; c < n && !solved; c++) {
        const good = ok(r, c);
        out.push({ cols: [...cols], trying: [r, c], bad: !good, solved: false });
        if (!good) continue;
        cols.push(c);
        go(r + 1);
        if (!solved) cols.pop();
      }
    };
    go(0);
    return out;
  }, [n]);
  const [i, setI] = useState(0);
  const f = frames[Math.min(i, frames.length - 1)];
  const backtracks = frames.slice(0, i + 1).filter((x, k, arr) => k > 0 && x.cols.length < arr[k - 1].cols.length).length;
  return (
    <Frame
      title={`${n} ферзей: перебор с возвратом`}
      hint="ни один не бьёт другого"
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <Slider label="Размер доски" value={n} min={4} max={8} onChange={(v) => { setN(v); setI(0); }} />
          <StepControls onStep={() => setI(Math.min(frames.length - 1, i + 1))} onBack={() => setI(i - 1)} canBack={i > 0} canStep={i < frames.length - 1} onReset={() => setI(0)} />
        </div>
      }
    >
      <div className="mx-auto grid max-w-[320px] gap-[2px]" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {Array.from({ length: n * n }, (_, k) => {
          const r = Math.floor(k / n);
          const c = k % n;
          const queen = f.cols[r] === c;
          const trying = f.trying && f.trying[0] === r && f.trying[1] === c;
          return (
            <div
              key={k}
              className="flex aspect-square items-center justify-center rounded-[3px] text-[18px]"
              style={{ background: trying ? (f.bad ? "color-mix(in oklab, var(--color-bad) 40%, transparent)" : "color-mix(in oklab, var(--color-amber) 40%, transparent)") : (r + c) % 2 ? "var(--color-raised)" : "var(--color-surface)" }}
            >
              {queen ? <span className={f.solved ? "text-accent" : "text-ink"}>♛</span> : trying ? <span className="text-ink/70">♛</span> : null}
            </div>
          );
        })}
      </div>
      <Metrics className="mt-4">
        <Metric label="шаг" value={`${i + 1}/${frames.length}`} />
        <Metric label="поставлено" value={f.cols.length} />
        <Metric label="возвратов" value={backtracks} tone="amber" />
        <Metric label="без отсечений" value={n ** n} tone="bad" />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {f.solved
          ? `Решение найдено за ${frames.length} проверок вместо ${n ** n} расстановок полного перебора.`
          : f.trying && f.bad
            ? "Клетка бьётся — отсекаем эту ветку сразу, не перебирая ничего ниже."
            : "Ставим ферзя в строку и идём в следующую. Если в строке нет безопасной клетки — возвращаемся и двигаем предыдущего."}
      </p>
    </Frame>
  );
}
