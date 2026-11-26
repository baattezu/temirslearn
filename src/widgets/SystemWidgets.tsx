import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Legend, Log, Metric, Metrics, rng, StepControls, usePlayer } from "./kit";

// ══ Виртуальная память: 4-уровневая таблица страниц x86-64 + TLB ══

const REGIONS = {
  code: 0x5555_5555_4000n,
  heap: 0x5555_5577_9000n,
  stack: 0x7ffd_e3a1_c000n,
  mmap: 0x7f3c_8a20_0000n,
};
const TLB_SIZE = 4;

interface VM {
  tlb: { vpn: bigint; pfn: number }[];
  mapped: Map<bigint, number>;
  nextPfn: number;
  hits: number;
  misses: number;
  faults: number;
  ns: number;
  last: { va: bigint; hit: boolean; fault: boolean; pfn: number } | null;
  log: string[];
  heapCursor: bigint;
  seed: number;
}
const vm0 = (): VM => {
  const mapped = new Map<bigint, number>();
  // код и стек уже отображены при запуске процесса
  mapped.set(REGIONS.code >> 12n, 0x1a2);
  mapped.set((REGIONS.code >> 12n) + 1n, 0x1a3);
  mapped.set(REGIONS.stack >> 12n, 0x3f0);
  mapped.set(REGIONS.heap >> 12n, 0x2b7);
  return { tlb: [], mapped, nextPfn: 0x400, hits: 0, misses: 0, faults: 0, ns: 0, last: null, log: [], heapCursor: REGIONS.heap, seed: 5 };
};

const hex = (v: bigint | number, pad = 0) => "0x" + v.toString(16).padStart(pad, "0");
function split(va: bigint) {
  return {
    pml4: Number((va >> 39n) & 0x1ffn),
    pdpt: Number((va >> 30n) & 0x1ffn),
    pd: Number((va >> 21n) & 0x1ffn),
    pt: Number((va >> 12n) & 0x1ffn),
    off: Number(va & 0xfffn),
  };
}

function access(v0: VM, va: bigint, label: string): VM {
  const v: VM = { ...v0, tlb: [...v0.tlb], mapped: new Map(v0.mapped), log: [...v0.log] };
  const vpn = va >> 12n;
  const t = v.tlb.findIndex((e) => e.vpn === vpn);
  if (t >= 0) {
    const e = v.tlb.splice(t, 1)[0];
    v.tlb.push(e);
    v.hits++;
    v.ns += 1;
    v.last = { va, hit: true, fault: false, pfn: e.pfn };
    v.log.push(`${label}: ${hex(va)} — TLB hit, кадр ${hex(e.pfn)} без обхода таблиц (~1 нс)`);
    return v;
  }
  v.misses++;
  let fault = false;
  let pfn = v.mapped.get(vpn);
  if (pfn === undefined) {
    fault = true;
    v.faults++;
    pfn = v.nextPfn++;
    v.mapped.set(vpn, pfn);
  }
  v.ns += 4 * 25 + (fault ? 1500 : 0);
  v.tlb.push({ vpn, pfn });
  if (v.tlb.length > TLB_SIZE) v.tlb.shift();
  v.last = { va, hit: false, fault, pfn };
  v.log.push(
    `${label}: ${hex(va)} — TLB miss, обход 4 уровней таблиц` +
      (fault ? ` → страница не отображена: PAGE FAULT, ядро выделяет кадр ${hex(pfn)} (~1–2 мкс)` : ` → кадр ${hex(pfn)}`),
  );
  return v;
}

export function VirtualMemory() {
  const [v, setV] = useState(vm0);
  const va = v.last?.va ?? REGIONS.code + 0x1a4n;
  const s = split(va);
  const parts = [
    { name: "PML4", bits: 9, val: s.pml4, color: C.violet },
    { name: "PDPT", bits: 9, val: s.pdpt, color: C.blue },
    { name: "PD", bits: 9, val: s.pd, color: C.teal },
    { name: "PT", bits: 9, val: s.pt, color: C.amber },
    { name: "offset", bits: 12, val: s.off, color: C.accent },
  ];
  const walked = v.last && !v.last.hit;
  const total = v.hits + v.misses;
  return (
    <Frame
      title="Перевод адреса: TLB и таблица страниц"
      hint="x86-64, страницы 4 КБ"
      controls={
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="primary" onClick={() => setV(access(v, REGIONS.code + 0x1a4n + BigInt(Math.floor(rng(v.seed)() * 2000)), "инструкция"))}>
              Читать код
            </Button>
            <Button
              onClick={() => {
                const n = access(v, v.heapCursor, "arr[i]");
                setV({ ...n, heapCursor: v.heapCursor + 512n });
              }}
            >
              arr[i++] по 512 Б
            </Button>
            <Button onClick={() => setV(access(v, REGIONS.stack + 0xe80n, "локальная"))}>Стек</Button>
            <Button
              onClick={() => {
                const r = rng(v.seed);
                const addr = REGIONS.mmap + BigInt(Math.floor(r() * 64)) * 4096n + BigInt(Math.floor(r() * 4096));
                setV({ ...access(v, addr, "случайный"), seed: v.seed + 1 });
              }}
            >
              Случайно в 256 КБ
            </Button>
            <Button onClick={() => setV(vm0())} className="col-span-2 sm:col-span-1">
              Сначала
            </Button>
          </div>
        </div>
      }
    >
      <Metrics>
        <Metric label="TLB hit rate" value={total ? `${Math.round((v.hits / total) * 100)}%` : "—"} tone={total && v.hits / total > 0.8 ? "ok" : undefined} />
        <Metric label="промахов TLB" value={v.misses} />
        <Metric label="page faults" value={v.faults} tone={v.faults ? "amber" : undefined} />
        <Metric label="≈ на доступ" value={total ? `${Math.round(v.ns / total)} нс` : "—"} />
      </Metrics>

      <div className="mt-4">
        <Caption>Виртуальный адрес {hex(va, 12)} · 48 бит</Caption>
        <div className="flex overflow-hidden rounded-lg">
          {parts.map((p) => (
            <div key={p.name} className="flex flex-col items-center justify-center py-1.5" style={{ width: `${(p.bits / 48) * 100}%`, background: `color-mix(in oklab, ${p.color} 30%, var(--color-surface))` }}>
              <span className="font-mono text-[10px] text-dim">{p.name}</span>
              <span className="font-mono text-[13px] font-semibold text-ink">{p.name === "offset" ? hex(p.val) : p.val}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-[1.3fr_1fr]">
        <div>
          <Caption>Обход таблиц (CR3 → …)</Caption>
          <div className="grid grid-cols-4 gap-1.5">
            {parts.slice(0, 4).map((p, k) => (
              <div
                key={p.name}
                className={cx("rounded-lg border px-2 py-2 text-center transition", walked ? "opacity-100" : "opacity-40")}
                style={{ borderColor: walked ? p.color : "var(--color-line)" }}
              >
                <div className="font-mono text-[10px] text-mute">{p.name}</div>
                <div className="font-mono text-[12px] text-ink">[{p.val}]</div>
                <div className="mt-0.5 font-mono text-[9.5px] text-mute">чтение {k + 1}</div>
              </div>
            ))}
          </div>
          <div className={cx("mt-2 rounded-lg border px-3 py-2 font-mono text-[12px]", v.last?.fault ? "border-amber/50 bg-amber/10 text-amber" : "border-line text-dim")}>
            {v.last ? `физический адрес = ${hex(v.last.pfn)} × 4096 + ${hex(s.off)} = ${hex(BigInt(v.last.pfn) * 4096n + BigInt(s.off))}` : "Нажми любую кнопку чтения."}
          </div>
        </div>
        <div>
          <Caption>TLB · {TLB_SIZE} записи (в реальности 64 + 1–2 тыс. во втором уровне)</Caption>
          <div className="grid gap-1">
            {Array.from({ length: TLB_SIZE }, (_, k) => {
              const e = v.tlb[v.tlb.length - 1 - k];
              const isLast = e && v.last && e.vpn === v.last.va >> 12n;
              return (
                <div key={k} className={cx("flex justify-between rounded-md border px-2.5 py-1 font-mono text-[11.5px]", isLast ? (v.last!.hit ? "border-ok/50 bg-ok/10 text-ok" : "border-blue/50 bg-blue/10 text-ink") : "border-line text-dim")}>
                  <span>{e ? `vpn ${hex(e.vpn)}` : "—"}</span>
                  <span>{e ? `→ ${hex(e.pfn)}` : ""}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <Log className="mt-3" lines={v.log} max={3} />
    </Frame>
  );
}

// ══ Event loop браузера ══════════════════════════════════════

interface ELState {
  line: number | null;
  stack: string[];
  micro: string[];
  macro: string[];
  out: string[];
  phase: "script" | "micro" | "task" | "render";
  note: string;
}
interface ELExample {
  id: string;
  title: string;
  code: string[];
  states: ELState[];
}
const st = (line: number | null, stack: string[], micro: string[], macro: string[], out: string[], phase: ELState["phase"], note: string): ELState => ({ line, stack, micro, macro, out, phase, note });

const EXAMPLES: ELExample[] = [
  {
    id: "classic",
    title: "setTimeout vs Promise",
    code: ["console.log('1');", "setTimeout(() => console.log('2'), 0);", "Promise.resolve().then(() => console.log('3'));", "queueMicrotask(() => console.log('4'));", "console.log('5');"],
    states: [
      st(0, ["script"], [], [], ["1"], "script", "Весь скрипт — это одна задача (task). Синхронный код выполняется сразу."),
      st(1, ["script"], [], ["timeout → log 2"], ["1"], "script", "setTimeout регистрирует таймер. Через 0 мс (на деле ≥ ~1–4 мс) колбэк встанет в очередь задач — не раньше, чем закончится текущая."),
      st(2, ["script"], ["then → log 3"], ["timeout → log 2"], ["1"], "script", "Promise уже выполнен — then сразу кладёт колбэк в очередь микрозадач."),
      st(3, ["script"], ["then → log 3", "micro → log 4"], ["timeout → log 2"], ["1"], "script", "queueMicrotask — туда же, в конец микрозадач."),
      st(4, ["script"], ["then → log 3", "micro → log 4"], ["timeout → log 2"], ["1", "5"], "script", "Синхронный код закончился, стек пуст."),
      st(null, ["then cb"], ["micro → log 4"], ["timeout → log 2"], ["1", "5", "3"], "micro", "После каждой задачи браузер выполняет ВСЕ микрозадачи, пока очередь не опустеет."),
      st(null, ["micro cb"], [], ["timeout → log 2"], ["1", "5", "3", "4"], "micro", "Микрозадачи кончились."),
      st(null, [], [], ["timeout → log 2"], ["1", "5", "3", "4"], "render", "Возможность отрисовки: если пора (≈ раз в 16 мс), rAF-колбэки → style → layout → paint."),
      st(null, ["timeout cb"], [], [], ["1", "5", "3", "4", "2"], "task", "Следующая задача из очереди — колбэк таймера. Итог: 1 5 3 4 2."),
    ],
  },
  {
    id: "await",
    title: "async/await",
    code: ["async function f() {", "  console.log('a');", "  await null;", "  console.log('b');", "}", "console.log('s');", "f();", "setTimeout(() => console.log('t'));", "Promise.resolve().then(() => console.log('p'));", "console.log('e');"],
    states: [
      st(5, ["script"], [], [], ["s"], "script", "Синхронно: s."),
      st(1, ["script", "f"], [], [], ["s", "a"], "script", "Вызов async-функции выполняется синхронно до первого await."),
      st(2, ["script"], ["f: продолжить после await"], [], ["s", "a"], "script", "await приостанавливает f и ставит её продолжение в микрозадачи. Управление возвращается вызывающему."),
      st(7, ["script"], ["f: продолжить после await"], ["timeout → log t"], ["s", "a"], "script", "Таймер — в очередь задач."),
      st(8, ["script"], ["f: продолжить после await", "then → log p"], ["timeout → log t"], ["s", "a"], "script", "then — в микрозадачи, после продолжения f."),
      st(9, ["script"], ["f: продолжить после await", "then → log p"], ["timeout → log t"], ["s", "a", "e"], "script", "Синхронный код кончился."),
      st(3, ["f"], ["then → log p"], ["timeout → log t"], ["s", "a", "e", "b"], "micro", "Первая микрозадача — продолжение f после await."),
      st(null, ["then cb"], [], ["timeout → log t"], ["s", "a", "e", "b", "p"], "micro", "Вторая микрозадача."),
      st(null, ["timeout cb"], [], [], ["s", "a", "e", "b", "p", "t"], "task", "Только теперь — задача таймера. Итог: s a e b p t."),
    ],
  },
  {
    id: "block",
    title: "Долгая задача и отрисовка",
    code: ["button.onclick = () => {", "  box.style.background = 'red';", "  const end = Date.now() + 3000;", "  while (Date.now() < end) {}  // 3 с CPU", "  box.style.background = 'blue';", "};"],
    states: [
      st(0, ["click handler"], [], [], [], "task", "Клик — задача. Обработчик начинает выполняться."),
      st(1, ["click handler"], [], [], ["style: red (не отрисовано)"], "task", "Стиль изменён в DOM, но рисует браузер только между задачами."),
      st(3, ["click handler"], [], ["mousemove", "клик #2", "таймеры"], ["style: red (не отрисовано)"], "task", "3 секунды цикла: все события копятся в очереди, страница не реагирует, кадров нет."),
      st(4, ["click handler"], [], ["mousemove", "клик #2", "таймеры"], ["style: blue"], "task", "Ещё одно изменение — перезаписало red."),
      st(null, [], [], ["mousemove", "клик #2", "таймеры"], ["кадр: синий"], "render", "Задача закончилась → отрисовка. Красного пользователь не увидел никогда. INP этого клика — 3 с."),
    ],
  },
];

export function EventLoop() {
  const [exId, setExId] = useState("classic");
  const ex = EXAMPLES.find((e) => e.id === exId)!;
  const [i, setI] = useState(-1);
  const s = i >= 0 ? ex.states[i] : null;
  const player = usePlayer(() => {
    if (i >= ex.states.length - 1) return false;
    setI(i + 1);
    return true;
  }, 1300);
  const Box = ({ title, items, tone }: { title: string; items: string[]; tone: string }) => (
    <div className="min-w-0">
      <Caption>{title}</Caption>
      <div className="flex min-h-[76px] flex-col gap-1 rounded-xl border border-line bg-bg/40 p-1.5">
        {items.length === 0 && <span className="px-1 py-0.5 font-mono text-[11px] text-mute">пусто</span>}
        {items.map((x, k) => (
          <span key={k} className="truncate rounded-md px-2 py-1 font-mono text-[11.5px] text-ink" style={{ background: `color-mix(in oklab, ${tone} 18%, var(--color-surface))` }}>
            {x}
          </span>
        ))}
      </div>
    </div>
  );
  const PH: Record<ELState["phase"], string> = { script: "задача: скрипт", micro: "микрозадачи", task: "задача", render: "отрисовка" };
  return (
    <Frame
      title="Event loop"
      hint="задачи, микрозадачи, кадры"
      controls={
        <div className="grid gap-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
            {EXAMPLES.map((e) => (
              <Chip key={e.id} active={e.id === exId} onClick={() => { player.stop(); setExId(e.id); setI(-1); }}>
                {e.title}
              </Chip>
            ))}
          </div>
          <StepControls onStep={() => setI(i + 1)} onBack={() => setI(i - 1)} canBack={i >= 0} canStep={i < ex.states.length - 1} onReset={() => { player.stop(); setI(-1); }} player={player} />
        </div>
      }
    >
      <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
        <pre className="overflow-x-auto rounded-xl border border-line bg-bg/60 py-2 font-mono text-[12px] leading-[1.7]">
          {ex.code.map((l, k) => (
            <div key={k} className={cx("px-3", s?.line === k ? "bg-accent/15 text-ink" : "text-dim")}>
              {l}
            </div>
          ))}
        </pre>
        <div>
          <Caption>Консоль</Caption>
          <div className="min-h-[60px] rounded-xl border border-line bg-bg/60 p-2 font-mono text-[12.5px]">
            {(s?.out ?? []).map((o, k) => (
              <div key={k} className={k === (s?.out.length ?? 0) - 1 ? "text-accent" : "text-ink"}>
                › {o}
              </div>
            ))}
          </div>
          {s && (
            <div className="mt-2 inline-flex rounded-md border border-line px-2 py-0.5 font-mono text-[11px] text-amber">
              фаза: {PH[s.phase]}
            </div>
          )}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Box title="Стек вызовов" items={[...(s?.stack ?? [])].reverse()} tone={C.blue} />
        <Box title="Микрозадачи" items={s?.micro ?? []} tone={C.violet} />
        <Box title="Задачи" items={s?.macro ?? []} tone={C.amber} />
      </div>
      <p className="mt-3 rounded-xl border border-line bg-bg/40 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-dim">{s?.note ?? "Нажми «Шаг». Попробуй сначала угадать порядок вывода."}</p>
    </Frame>
  );
}

// ══ Git изнутри: объекты и DAG ════════════════════════════════

interface Commit {
  id: string;
  parents: string[];
  msg: string;
  files: Record<string, string>;
  lane: number;
  n: number;
}
interface Repo {
  commits: Commit[];
  branches: Record<string, string>;
  head: string;
  log: string[];
  counter: number;
}
const fnv = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(16).padStart(8, "0").slice(0, 7);
};
const blobId = (c: string) => fnv("blob " + c);
const treeId = (f: Record<string, string>) => fnv("tree " + Object.entries(f).map(([k, v]) => k + blobId(v)).join());
const mkCommit = (parents: string[], msg: string, files: Record<string, string>, lane: number, n: number): Commit => ({
  id: fnv(`commit ${treeId(files)} ${parents.join(",")} ${msg} ${n}`),
  parents,
  msg,
  files,
  lane,
  n,
});

function repo0(): Repo {
  const c1 = mkCommit([], "init", { "README.md": "# app", "main.go": "v1" }, 0, 1);
  const c2 = mkCommit([c1.id], "add api", { "README.md": "# app", "main.go": "v2", "api.go": "a1" }, 0, 2);
  return { commits: [c1, c2], branches: { main: c2.id }, head: "main", log: ["git init; два коммита в main"], counter: 3 };
}
const byId = (r: Repo, id: string) => r.commits.find((c) => c.id === id)!;
function ancestors(r: Repo, id: string) {
  const out = new Set<string>();
  const st = [id];
  while (st.length) {
    const x = st.pop()!;
    if (out.has(x)) continue;
    out.add(x);
    st.push(...byId(r, x).parents);
  }
  return out;
}
const LANES: Record<string, number> = { main: 0, feature: 1 };

export function GitDag() {
  const [r, setR] = useState(repo0);
  const [sel, setSel] = useState<string | null>(null);
  const headId = r.branches[r.head];
  const other = r.head === "main" ? "feature" : "main";
  const reachable = useMemo(() => {
    const s = new Set<string>();
    Object.values(r.branches).forEach((b) => ancestors(r, b).forEach((x) => s.add(x)));
    return s;
  }, [r]);

  const commit = () =>
    setR((p) => {
      const parent = byId(p, p.branches[p.head]);
      const files = { ...parent.files };
      const f = p.head === "main" ? "main.go" : "feature.go";
      files[f] = `v${p.counter}`;
      const c = mkCommit([parent.id], `${p.head === "main" ? "fix" : "feat"} #${p.counter}`, files, LANES[p.head], p.counter);
      return { ...p, commits: [...p.commits, c], branches: { ...p.branches, [p.head]: c.id }, counter: p.counter + 1, log: [...p.log, `commit ${c.id} на ${p.head}: новый blob ${blobId(files[f])} для ${f}, остальные blob'ы и дерево переиспользуются по хешу`] };
    });
  const branch = () =>
    setR((p) =>
      p.branches.feature
        ? p
        : { ...p, branches: { ...p.branches, feature: p.branches[p.head] }, head: "feature", log: [...p.log, `git switch -c feature: создан файл .git/refs/heads/feature с хешем ${p.branches[p.head]}. Ветка — это 41 байт`] },
    );
  const checkout = () => setR((p) => (p.branches[other] ? { ...p, head: other, log: [...p.log, `git switch ${other}: HEAD теперь → refs/heads/${other}`] } : p));
  const merge = () =>
    setR((p) => {
      const src = p.branches[other];
      const dst = p.branches[p.head];
      if (!src) return p;
      if (ancestors(p, dst).has(src)) return { ...p, log: [...p.log, `merge ${other}: уже влито`] };
      if (ancestors(p, src).has(dst)) return { ...p, branches: { ...p.branches, [p.head]: src }, log: [...p.log, `merge ${other}: fast-forward — указатель ${p.head} просто сдвинут на ${src}, новых коммитов нет`] };
      const files = { ...byId(p, dst).files, ...byId(p, src).files };
      const c = mkCommit([dst, src], `Merge ${other}`, files, LANES[p.head], p.counter);
      return { ...p, commits: [...p.commits, c], branches: { ...p.branches, [p.head]: c.id }, counter: p.counter + 1, log: [...p.log, `merge ${other}: коммит ${c.id} с ДВУМЯ родителями`] };
    });
  const rebase = () =>
    setR((p) => {
      if (p.head !== "feature" || !p.branches.feature) return { ...p, log: [...p.log, "rebase: переключись на feature — переносим её на main"] };
      const onto = p.branches.main;
      const base = ancestors(p, onto);
      const own: Commit[] = [];
      let x: string | undefined = p.branches.feature;
      while (x && !base.has(x)) {
        const c = byId(p, x);
        own.unshift(c);
        x = c.parents[0];
      }
      if (!own.length) return { ...p, log: [...p.log, "rebase: нечего переносить"] };
      let parent = onto;
      let n = p.counter;
      const fresh: Commit[] = [];
      for (const c of own) {
        const files = { ...byId(p, onto).files, ...Object.fromEntries(Object.entries(c.files).filter(([k]) => k === "feature.go")) };
        const nc = mkCommit([parent], c.msg, files, 1, n++);
        fresh.push(nc);
        parent = nc.id;
      }
      return {
        ...p,
        commits: [...p.commits, ...fresh],
        branches: { ...p.branches, feature: parent },
        counter: n,
        log: [...p.log, `rebase main: ${own.length} коммит(а) пересозданы поверх main с НОВЫМИ хешами (${own.map((c) => c.id).join(", ")} → ${fresh.map((c) => c.id).join(", ")}). Старые стали недостижимы — их найдёт только reflog`],
      };
    });

  // раскладка
  const order = [...r.commits].sort((a, b) => a.n - b.n);
  const X = (c: Commit) => 28 + order.indexOf(c) * 62;
  const Y = (c: Commit) => 34 + c.lane * 70;
  const W = 28 + order.length * 62 + 20;
  const s = sel ? r.commits.find((c) => c.id === sel) : byId(r, headId);

  return (
    <Frame
      title="Git: коммиты, ветки, HEAD"
      hint="кликни коммит — увидишь его объекты"
      controls={
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <Button variant="primary" onClick={commit}>
            commit
          </Button>
          <Button onClick={branch} disabled={!!r.branches.feature}>
            switch -c feature
          </Button>
          <Button onClick={checkout} disabled={!r.branches[other]}>
            switch {other}
          </Button>
          <Button onClick={merge} disabled={!r.branches[other]}>
            merge {other}
          </Button>
          <Button onClick={rebase} disabled={r.head !== "feature"}>
            rebase main
          </Button>
          <Button onClick={() => { setR(repo0()); setSel(null); }}>Сначала</Button>
        </div>
      }
    >
      <div className="overflow-x-auto pb-1">
        <svg viewBox={`0 0 ${Math.max(W, 300)} 170`} width={Math.max(W, 300)} height={170} style={{ maxWidth: "none" }} className="block">
          {r.commits.flatMap((c) =>
            c.parents.map((pid) => {
              const p = byId(r, pid);
              const dim = !reachable.has(c.id);
              return <line key={c.id + pid} x1={X(c)} y1={Y(c)} x2={X(p)} y2={Y(p)} stroke={dim ? C.line : C.lineStrong} strokeWidth={1.6} strokeDasharray={dim ? "3 3" : undefined} />;
            }),
          )}
          {r.commits.map((c) => {
            const dim = !reachable.has(c.id);
            const isSel = s?.id === c.id;
            const refs = Object.entries(r.branches).filter(([, id]) => id === c.id).map(([b]) => b);
            return (
              <g key={c.id} onClick={() => setSel(c.id)} className="cursor-pointer" opacity={dim ? 0.35 : 1}>
                <circle cx={X(c)} cy={Y(c)} r={c.parents.length > 1 ? 11 : 9} fill={isSel ? C.accent : C.raised} stroke={c.lane ? C.violet : C.blue} strokeWidth={2} />
                <text x={X(c)} y={Y(c) + 26} textAnchor="middle" fontSize={9.5} fill={C.mute} fontFamily="var(--font-mono)">
                  {c.id}
                </text>
                {refs.map((b, k) => (
                  <g key={b} transform={`translate(${X(c) - 26} ${Y(c) - 30 - k * 17})`}>
                    <rect width={52} height={14} rx={4} fill={b === r.head ? C.accent : C.surface} stroke={b === "main" ? C.blue : C.violet} />
                    <text x={26} y={10.5} textAnchor="middle" fontSize={9} fill={b === r.head ? "var(--color-accent-ink)" : C.ink} fontFamily="var(--font-mono)">
                      {b === r.head ? `HEAD→${b}` : b}
                    </text>
                  </g>
                ))}
              </g>
            );
          })}
        </svg>
      </div>
      {s && (
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <div className="rounded-xl border border-line bg-bg/40 p-2.5 font-mono text-[11.5px]">
            <div className="mb-1 text-blue">commit {s.id}</div>
            <div className="text-dim">tree {treeId(s.files)}</div>
            {s.parents.map((p) => (
              <div key={p} className="text-dim">parent {p}</div>
            ))}
            <div className="mt-1 text-ink">{s.msg}</div>
          </div>
          <div className="rounded-xl border border-line bg-bg/40 p-2.5 font-mono text-[11.5px]">
            <div className="mb-1 text-teal">tree {treeId(s.files)}</div>
            {Object.entries(s.files).map(([f, c]) => (
              <div key={f} className="flex justify-between gap-2 text-dim">
                <span>{f}</span>
                <span className="text-amber">{blobId(c)}</span>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-line bg-bg/40 p-2.5 font-mono text-[11.5px]">
            <div className="mb-1 text-amber">blob'ы</div>
            {Object.entries(s.files).map(([f, c]) => (
              <div key={f} className="text-dim">
                {blobId(c)}: <span className="text-ink">&quot;{c}&quot;</span>
              </div>
            ))}
          </div>
        </div>
      )}
      <Legend className="mt-3" items={[{ color: C.blue, label: "main" }, { color: C.violet, label: "feature" }, { color: C.accent, label: "выбранный коммит / HEAD" }]} />
      <Log className="mt-3" lines={r.log} max={3} />
    </Frame>
  );
}

// ══ TCP: окно перегрузки ══════════════════════════════════════

type Algo = "reno" | "cubic";
export function TcpCwnd() {
  const [algo, setAlgo] = useState<Algo>("reno");
  const [lossy, setLossy] = useState(true);
  const [losses, setLosses] = useState<{ t: number; kind: "dup" | "rto" }[]>([{ t: 22, kind: "dup" }, { t: 40, kind: "dup" }, { t: 55, kind: "rto" }]);
  const T = 80;
  const series = useMemo(() => {
    const out: { t: number; cwnd: number; ss: number; phase: string }[] = [];
    let cwnd = 1;
    let ssthresh = 64;
    let wmax = 0;
    let since = 0;
    const r = rng(9);
    for (let t = 0; t < T; t++) {
      const ev = losses.find((l) => l.t === t) ?? (lossy && cwnd > 30 && r() < 0.06 ? { t, kind: "dup" as const } : undefined);
      let phase = cwnd < ssthresh ? "slow start" : "избегание перегрузки";
      if (ev) {
        if (ev.kind === "rto") {
          ssthresh = Math.max(2, cwnd / 2);
          cwnd = 1;
          phase = "таймаут";
        } else if (algo === "reno") {
          ssthresh = Math.max(2, cwnd / 2);
          cwnd = ssthresh;
          phase = "потеря: ×½";
        } else {
          wmax = cwnd;
          ssthresh = Math.max(2, cwnd * 0.7);
          cwnd = ssthresh;
          since = 0;
          phase = "потеря: ×0.7";
        }
      } else if (cwnd < ssthresh) cwnd = Math.min(ssthresh, cwnd * 2);
      else if (algo === "reno") cwnd += 1;
      else {
        since++;
        const K = Math.cbrt((wmax * 0.3) / 0.4);
        cwnd = Math.max(cwnd + 0.5, 0.4 * (since - K) ** 3 + wmax);
      }
      cwnd = Math.min(cwnd, 120);
      out.push({ t, cwnd, ss: ssthresh, phase });
    }
    return out;
  }, [algo, lossy, losses]);
  const W = 600;
  const H = 200;
  const max = 120;
  const pts = series.map((p) => `${(p.t / (T - 1)) * W},${H - (p.cwnd / max) * H}`).join(" ");
  const avg = series.reduce((a, p) => a + p.cwnd, 0) / series.length;
  return (
    <Frame
      title="TCP: окно перегрузки (cwnd)"
      hint="по оси X — RTT"
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <Segmented<Algo> value={algo} onChange={setAlgo} block options={[{ value: "reno", label: "Reno (AIMD)" }, { value: "cubic", label: "CUBIC" }]} />
          <div className="flex flex-wrap items-center gap-3">
            <Toggle checked={lossy} onChange={setLossy} label="Случайные потери" />
            <Button size="sm" onClick={() => setLosses([])}>Без ручных потерь</Button>
          </div>
        </div>
      }
    >
      <Metrics>
        <Metric label="средний cwnd" value={`${avg.toFixed(0)} MSS`} />
        <Metric label="≈ скорость при RTT 50 мс" value={`${((avg * 1460 * 8) / 0.05 / 1e6).toFixed(1)} Мбит/с`} tone="accent" />
        <Metric label="потерь" value={series.filter((p) => p.phase.startsWith("потеря") || p.phase === "таймаут").length} />
        <Metric label="таймаутов" value={series.filter((p) => p.phase === "таймаут").length} tone="bad" />
      </Metrics>
      <svg
        viewBox={`-30 -8 ${W + 40} ${H + 30}`}
        className="mt-4 block w-full cursor-crosshair"
        onClick={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * (W + 40) - 30;
          const t = Math.round((x / W) * (T - 1));
          if (t > 0 && t < T) setLosses((l) => [...l.filter((q) => q.t !== t), { t, kind: e.shiftKey ? "rto" : "dup" }]);
        }}
      >
        {[0, 30, 60, 90, 120].map((v) => (
          <g key={v}>
            <line x1={0} x2={W} y1={H - (v / max) * H} y2={H - (v / max) * H} stroke={C.line} />
            <text x={-6} y={H - (v / max) * H + 3} textAnchor="end" fontSize={10} fill={C.mute} fontFamily="var(--font-mono)">
              {v}
            </text>
          </g>
        ))}
        <polyline points={series.map((p) => `${(p.t / (T - 1)) * W},${H - (Math.min(p.ss, max) / max) * H}`).join(" ")} fill="none" stroke={C.mute} strokeDasharray="4 4" />
        <polyline points={pts} fill="none" stroke={algo === "reno" ? C.blue : C.accent} strokeWidth={2.2} />
        {series.map((p) =>
          p.phase.startsWith("потеря") || p.phase === "таймаут" ? <circle key={p.t} cx={(p.t / (T - 1)) * W} cy={H - (p.cwnd / max) * H} r={4} fill={p.phase === "таймаут" ? C.bad : C.amber} /> : null,
        )}
        <text x={W} y={H + 18} textAnchor="end" fontSize={10} fill={C.mute} fontFamily="var(--font-mono)">
          {T} RTT
        </text>
      </svg>
      <Legend className="mt-2" items={[{ color: algo === "reno" ? C.blue : C.accent, label: "cwnd" }, { color: C.mute, label: "ssthresh" }, { color: C.amber, label: "потеря (3 dup ACK)" }, { color: C.bad, label: "таймаут" }]} />
      <p className="mt-2 text-[12.5px] text-mute">Клик по графику — добавить потерю в этот момент (с Shift — таймаут).</p>
    </Frame>
  );
}
