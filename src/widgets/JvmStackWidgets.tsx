import { useMemo, useState } from "react";
import { Code } from "../ui/Compare";
import { Slider } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Log, Metric, Metrics, StepControls, useHistory, usePlayer } from "./kit";

// ── Пул потоков: задачи, очередь, отказ ────────────────────────────

type Job = { id: number; left: number; io: boolean };
interface PoolState {
  t: number;
  workers: (Job | null)[];
  queue: Job[];
  done: number;
  rejected: number;
  next: number;
}

export function ThreadPoolSim() {
  const [size, setSize] = useState(4);
  const [cap, setCap] = useState(6);
  const [rate, setRate] = useState(2);
  const init = (): PoolState => ({ t: 0, workers: Array(size).fill(null), queue: [], done: 0, rejected: 0, next: 1 });
  const h = useHistory(init);
  const s = h.cur;
  const step = (p: PoolState): PoolState => {
    const workers = p.workers.map((w) => (w ? { ...w, left: w.left - 1 } : null));
    let done = p.done;
    for (let i = 0; i < workers.length; i++) if (workers[i] && workers[i]!.left <= 0) {
      workers[i] = null;
      done++;
    }
    const queue = [...p.queue];
    let { next, rejected } = p;
    for (let k = 0; k < rate; k++) {
      const job = { id: next++, left: 2 + ((next * 7) % 4), io: next % 3 === 0 };
      queue.push(job);
    }
    for (let i = 0; i < workers.length && queue.length; i++) if (!workers[i]) workers[i] = queue.shift()!;
    while (queue.length > cap) {
      queue.pop();
      rejected++;
    }
    return { t: p.t + 1, workers, queue, done, rejected, next };
  };
  const player = usePlayer(() => {
    h.push(step);
    return h.cur.t < 60;
  }, 500);
  const reset = (n = size) => {
    setSize(n);
    h.reset({ t: 0, workers: Array(n).fill(null), queue: [], done: 0, rejected: 0, next: 1 });
  };
  return (
    <Frame
      title="ThreadPoolExecutor изнутри"
      hint="пул, очередь, политика отказа"
      controls={<StepControls onStep={() => h.push(step)} onBack={h.back} canBack={h.canBack} onReset={() => reset()} player={player} stepLabel="Такт" />}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <Slider label="Потоков в пуле" value={size} min={1} max={8} onChange={(v) => reset(v)} />
        <Slider label="Ёмкость очереди" value={cap} min={0} max={12} onChange={setCap} />
        <Slider label="Задач за такт" value={rate} min={1} max={5} onChange={setRate} />
      </div>
      <Caption className="mt-4">потоки</Caption>
      <div className="flex flex-wrap gap-1.5">
        {s.workers.map((w, i) => (
          <div key={i} className={cx("flex h-12 w-16 flex-col items-center justify-center rounded-lg border font-mono text-[11px]", w ? "border-accent/60 bg-accent/10 text-ink" : "border-line text-mute")}>
            <span>T{i + 1}</span>
            <span>{w ? `#${w.id}·${w.left}` : "свободен"}</span>
          </div>
        ))}
      </div>
      <Caption className="mt-3">очередь {s.queue.length}/{cap}</Caption>
      <div className="flex min-h-9 flex-wrap gap-1">
        {s.queue.map((j) => (
          <span key={j.id} className="rounded-md bg-raised px-1.5 py-1 font-mono text-[11px] text-dim">#{j.id}</span>
        ))}
      </div>
      <Metrics className="mt-3">
        <Metric label="выполнено" value={s.done} tone="ok" />
        <Metric label="отклонено" value={s.rejected} tone={s.rejected ? "bad" : undefined} />
        <Metric label="такт" value={s.t} />
      </Metrics>
      <p className="mt-3 text-[13px] leading-relaxed text-dim">
        Задачи приходят быстрее, чем потоки их выполняют, — очередь растёт. Когда она полна, срабатывает политика отказа (по умолчанию <span className="font-mono text-ink">AbortPolicy</span> бросает исключение). У <span className="font-mono text-ink">Executors.newFixedThreadPool</span> очередь безгранична — вместо отказов будет медленная утечка памяти.
      </p>
    </Frame>
  );
}

// ── Виртуальные потоки: монтирование на carrier ─────────────────────

export function VirtualThreadsViz() {
  const [mode, setMode] = useState<"platform" | "virtual">("virtual");
  const [n, setN] = useState(12);
  const [pinned, setPinned] = useState(false);
  const carriers = 4;
  // каждая задача: 1 такт CPU, 6 тактов ожидания I/O, 1 такт CPU
  const sim = useMemo(() => {
    const tasks = Array.from({ length: n }, (_, i) => ({ id: i, phase: 0, wait: 0, doneAt: -1 }));
    let t = 0;
    const timeline: { t: number; mounted: (number | null)[] }[] = [];
    const busy: (number | null)[] = Array(mode === "platform" ? carriers : carriers).fill(null);
    while (tasks.some((x) => x.doneAt < 0) && t < 200) {
      // освобождаем носители, у которых задача ушла в I/O (если не pinned и virtual)
      for (let c = 0; c < busy.length; c++) {
        const id = busy[c];
        if (id === null) continue;
        const task = tasks[id];
        if (task.phase === 1 && task.wait > 0) {
          if (mode === "virtual" && !pinned) busy[c] = null; // размонтирован, носитель свободен
        }
        if (task.doneAt >= 0) busy[c] = null;
      }
      // назначаем готовые к CPU задачи
      for (const task of tasks) {
        if (task.doneAt >= 0 || busy.includes(task.id)) continue;
        const ready = task.phase === 0 || (task.phase === 1 && task.wait === 0);
        if (!ready) continue;
        const free = busy.indexOf(null);
        if (free < 0) break;
        busy[free] = task.id;
      }
      timeline.push({ t, mounted: [...busy] });
      // шаг времени
      for (const task of tasks) {
        if (task.doneAt >= 0) continue;
        const on = busy.includes(task.id);
        if (task.phase === 0 && on) {
          task.phase = 1;
          task.wait = 6;
        } else if (task.phase === 1 && task.wait > 0) task.wait--;
        else if (task.phase === 1 && task.wait === 0 && on) task.doneAt = t + 1;
      }
      t++;
    }
    return { total: t, timeline };
  }, [n, mode, pinned]);
  const cols = Math.min(sim.timeline.length, 60);
  return (
    <Frame title="Платформенные и виртуальные потоки" hint="4 потока ОС, задачи ждут I/O">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "platform", label: "Поток ОС на задачу" },
            { value: "virtual", label: "Виртуальные потоки" },
          ]}
        />
        {mode === "virtual" && (
          <Segmented
            size="sm"
            value={pinned ? "pin" : "ok"}
            onChange={(v) => setPinned(v === "pin")}
            options={[
              { value: "ok", label: "обычный I/O" },
              { value: "pin", label: "pinning (synchronized)" },
            ]}
          />
        )}
      </div>
      <div className="mt-3">
        <Slider label="Одновременных запросов" value={n} min={4} max={40} onChange={setN} />
      </div>
      <Caption className="mt-4">загрузка 4 носителей по тактам (цвет — какая задача на нём)</Caption>
      <div className="overflow-x-auto">
        <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${cols}, 10px)` }}>
          {[0, 1, 2, 3].map((c) =>
            sim.timeline.slice(0, cols).map((col, k) => {
              const id = col.mounted[c];
              return (
                <span
                  key={`${c}-${k}`}
                  className="h-4 rounded-[2px]"
                  style={{ gridRow: c + 1, background: id === null ? C.raised : `hsl(${(id * 47) % 360} 70% 60%)`, opacity: id === null ? 1 : 0.85 }}
                />
              );
            }),
          )}
        </div>
      </div>
      <Metrics className="mt-3">
        <Metric label="тактов всего" value={sim.total} tone={sim.total < n ? "ok" : "amber"} />
      </Metrics>
      <p className="mt-3 text-[13px] leading-relaxed text-dim">
        {mode === "platform"
          ? "Поток ОС держится за задачу, пока она ждёт базу или сеть: 4 потока — 4 запроса одновременно, остальные стоят в очереди, а носители простаивают (серые клетки посреди работы)."
          : pinned
            ? "Внутри synchronized виртуальный поток «прибит» к носителю и при ожидании его не отпускает — получаем поведение обычных потоков. (В Java 24 это исправили для synchronized; остаются нативные вызовы.)"
            : "На ожидании I/O виртуальный поток размонтируется, и носитель сразу берёт следующий. Тысячи ожидающих запросов обслуживают несколько потоков ОС."}
      </p>
    </Frame>
  );
}

// ── Жизненный цикл бина Spring ──────────────────────────────────────

const BEAN_STEPS = [
  { name: "BeanDefinition", text: "Сканирование нашло @Service OrderService (или его описали в @Configuration). Пока это только описание: класс, scope, зависимости." },
  { name: "Создание экземпляра", text: "Контейнер вызывает конструктор. Если зависимости в конструкторе — сначала создаёт их (граф строится рекурсивно; цикл через конструкторы — ошибка при старте)." },
  { name: "Внедрение зависимостей", text: "Заполняются @Autowired-поля и сеттеры (при внедрении через конструктор этот шаг уже сделан)." },
  { name: "Aware-интерфейсы", text: "Если бин хочет знать своё имя или контекст — BeanNameAware, ApplicationContextAware." },
  { name: "BeanPostProcessor · before", text: "Пост-процессоры видят каждый бин до инициализации. Так работают многие аннотации." },
  { name: "@PostConstruct / afterPropertiesSet", text: "Твой код инициализации: все зависимости уже на месте." },
  { name: "BeanPostProcessor · after → прокси", text: "Здесь появляется прокси: если на бине @Transactional, @Async, @Cacheable — в контекст кладётся не сам объект, а обёртка вокруг него." },
  { name: "Бин готов", text: "Его внедряют в другие бины. Все вызовы снаружи идут через прокси, если он есть." },
  { name: "@PreDestroy", text: "При остановке контекста — закрыть пулы, соединения, файлы. Для prototype-бинов Spring этого не вызывает." },
];

export function BeanLifecycle() {
  const [i, setI] = useState(0);
  const last = BEAN_STEPS.length - 1;
  const player = usePlayer(() => {
    if (i >= last) return false;
    setI(i + 1);
    return i + 1 < last;
  }, 900);
  return (
    <Frame
      title="Жизненный цикл бина"
      hint="от описания до прокси"
      controls={<StepControls onStep={() => setI((v) => Math.min(BEAN_STEPS.length - 1, v + 1))} onBack={() => setI((v) => Math.max(0, v - 1))} canBack={i > 0} canStep={i < BEAN_STEPS.length - 1} onReset={() => setI(0)} player={player} />}
    >
      <ol className="grid gap-1">
        {BEAN_STEPS.map((s, k) => (
          <li
            key={s.name}
            className={cx(
              "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition",
              k === i ? "bg-accent/15 text-ink" : k < i ? "text-dim" : "text-mute",
            )}
          >
            <span className={cx("flex size-5 shrink-0 items-center justify-center rounded-full font-mono text-[10.5px]", k <= i ? "bg-accent text-accent-ink" : "bg-raised")}>{k + 1}</span>
            {s.name}
            {k === 6 && k <= i && <span className="ml-auto rounded bg-violet/20 px-1.5 font-mono text-[10.5px] text-violet">proxy</span>}
          </li>
        ))}
      </ol>
      <p className="mt-3 min-h-[60px] text-[13.5px] leading-relaxed text-dim">{BEAN_STEPS[i].text}</p>
    </Frame>
  );
}

// ── Persistence context: состояния сущности и SQL при flush ─────────

type EState = "transient" | "managed" | "detached" | "removed";
interface Ent {
  id: number | null;
  name: string;
  state: EState;
  snapshot: string | null;
}
interface PcState {
  e: Ent;
  log: string[];
  sql: string[];
  tx: boolean;
}

export function PersistenceContext() {
  const h = useHistory<PcState>(() => ({ e: { id: null, name: "Ада", state: "transient", snapshot: null }, log: [], sql: [], tx: true }));
  const s = h.cur;
  const act = (label: string, f: (p: PcState) => Partial<PcState>) => h.push((p) => ({ ...p, ...f(p), log: [...p.log, label] }));
  const e = s.e;
  const buttons: { label: string; ok: boolean; run: () => void }[] = [
    { label: "em.persist(user)", ok: e.state === "transient", run: () => act("persist → managed (INSERT отложен до flush)", (p) => ({ e: { ...p.e, state: "managed", snapshot: null } })) },
    { label: "user.setName(\"Ада Л.\")", ok: e.state !== "removed", run: () => act(`setName — ${e.state === "managed" ? "контекст увидит при flush (dirty checking)" : "объект не управляется, БД не узнает"}`, (p) => ({ e: { ...p.e, name: "Ада Л." } })) },
    {
      label: "flush / commit",
      ok: true,
      run: () =>
        act("flush: сравнение со снимками → SQL", (p) => {
          const sql = [...p.sql];
          let ent = { ...p.e };
          if (ent.state === "managed" && ent.id === null) {
            ent = { ...ent, id: 42, snapshot: ent.name };
            sql.push(`INSERT INTO users (id, name) VALUES (42, '${ent.name}')`);
          } else if (ent.state === "managed" && ent.snapshot !== ent.name) {
            sql.push(`UPDATE users SET name = '${ent.name}' WHERE id = ${ent.id}`);
            ent.snapshot = ent.name;
          } else if (ent.state === "removed") {
            sql.push(`DELETE FROM users WHERE id = ${ent.id}`);
            ent = { ...ent, state: "transient", id: null };
          }
          return { e: ent, sql };
        }),
    },
    { label: "em.detach / конец транзакции", ok: e.state === "managed", run: () => act("detach — изменения дальше никто не отслеживает", (p) => ({ e: { ...p.e, state: "detached" } })) },
    { label: "em.merge(user)", ok: e.state === "detached", run: () => act("merge — копирует состояние в managed-экземпляр (SELECT + UPDATE при flush)", (p) => ({ e: { ...p.e, state: "managed", snapshot: null }, sql: [...p.sql, `SELECT * FROM users WHERE id = ${p.e.id}`] })) },
    { label: "em.remove(user)", ok: e.state === "managed" && e.id !== null, run: () => act("remove → removed (DELETE при flush)", (p) => ({ e: { ...p.e, state: "removed" } })) },
  ];
  const color: Record<EState, string> = { transient: C.mute, managed: C.ok, detached: C.amber, removed: C.bad };
  return (
    <Frame
      title="Persistence context"
      hint="SQL появляется при flush, а не при вызове"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className="rounded-lg border px-3 py-1.5 font-mono text-[13px]" style={{ borderColor: color[e.state], color: color[e.state] }}>
          User(id={e.id ?? "null"}, name="{e.name}") · {e.state}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            disabled={!b.ok}
            onClick={b.run}
            className="h-8 rounded-lg border border-line px-2.5 font-mono text-[12px] text-dim transition hover:border-line-strong hover:text-ink disabled:opacity-30"
          >
            {b.label}
          </button>
        ))}
        <button type="button" onClick={h.back} disabled={!h.canBack} className="h-8 rounded-lg px-2.5 text-[12px] text-mute hover:text-ink disabled:opacity-30">
          ← шаг назад
        </button>
        <button type="button" onClick={() => h.reset()} className="h-8 rounded-lg px-2.5 text-[12px] text-mute hover:text-ink">
          сначала
        </button>
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div>
          <Caption>что происходит</Caption>
          <Log lines={s.log} empty="Начни с persist." />
        </div>
        <div>
          <Caption>SQL в базу</Caption>
          <Log lines={s.sql.map((q) => <span className="text-blue">{q}</span>)} empty="Пока ни одного запроса." />
        </div>
      </div>
    </Frame>
  );
}

// ── N+1 ─────────────────────────────────────────────────────────────

type Fetch = "lazy" | "eager" | "join" | "batch";
const FETCH: Record<Fetch, { label: string; code: string; note: string }> = {
  lazy: {
    label: "LAZY (по умолчанию для коллекций)",
    code: `List<Order> orders = repo.findAll();          // 1 запрос
for (Order o : orders)
    total += o.getItems().size();              // +1 на каждый заказ`,
    note: "Коллекция грузится при первом обращении — отдельным запросом на каждый заказ. Это и есть N+1.",
  },
  eager: {
    label: "EAGER",
    code: `@OneToMany(fetch = FetchType.EAGER)
List<Item> items;
// findAll() → тот же N+1, просто сразу`,
    note: "EAGER не лечит N+1 в JPQL-запросах: Hibernate всё равно догружает связи отдельными запросами — и теперь всегда, даже когда они не нужны.",
  },
  join: {
    label: "JOIN FETCH / @EntityGraph",
    code: `@Query("select distinct o from Order o join fetch o.items")
List<Order> findAllWithItems();               // 1 запрос`,
    note: "Один запрос с JOIN. Цена — дубли строк заказа на каждый item и проблема с пагинацией (Hibernate предупредит HHH90003004 и сделает её в памяти).",
  },
  batch: {
    label: "@BatchSize / default_batch_fetch_size",
    code: `@BatchSize(size = 50)
@OneToMany List<Item> items;
// findAll() + items для 50 заказов за раз: WHERE order_id IN (...)`,
    note: "1 + ⌈N / 50⌉ запросов. Хорошо работает с пагинацией — частый выбор по умолчанию.",
  },
};

export function NPlusOne() {
  const [mode, setMode] = useState<Fetch>("lazy");
  const [n, setN] = useState(100);
  const queries = mode === "join" ? 1 : mode === "batch" ? 1 + Math.ceil(n / 50) : 1 + n;
  const ms = queries * 1.2 + (mode === "join" ? n * 0.02 : 0);
  return (
    <Frame title="Сколько запросов уйдёт в базу" hint="1 мс round-trip на запрос">
      <Segmented size="sm" value={mode} onChange={setMode} options={(Object.keys(FETCH) as Fetch[]).map((k) => ({ value: k, label: FETCH[k].label.split(" ")[0] }))} className="max-w-full overflow-x-auto" />
      <div className="mt-3">
        <Slider label="Заказов на странице" value={n} min={1} max={500} onChange={setN} />
      </div>
      <Code className="mt-3" code={FETCH[mode].code} />
      <Metrics className="mt-3">
        <Metric label="SQL-запросов" value={queries} tone={queries > 20 ? "bad" : queries > 3 ? "amber" : "ok"} />
        <Metric label="время на сеть ≈" value={`${ms.toFixed(0)} мс`} tone={ms > 50 ? "bad" : "ok"} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">{FETCH[mode].note}</p>
    </Frame>
  );
}

// ── Kotlin: null-безопасность ───────────────────────────────────────

export function KotlinNulls() {
  const [lang, setLang] = useState<"java" | "kotlin">("kotlin");
  return (
    <Frame title="Где ловится null" hint="одна и та же ошибка">
      <Segmented
        size="sm"
        value={lang}
        onChange={setLang}
        options={[
          { value: "java", label: "Java" },
          { value: "kotlin", label: "Kotlin" },
        ]}
      />
      {lang === "java" ? (
        <>
          <Code
            className="mt-3"
            code={`String city = user.getAddress().getCity();   // компилируется
// в проде: NullPointerException, если адреса нет`}
          />
          <p className="mt-3 text-[13.5px] text-bad">Ошибка во время выполнения — у пользователя, в 3 часа ночи.</p>
        </>
      ) : (
        <>
          <Code
            className="mt-3"
            lang="plaintext"
            code={`val city: String = user.address.city
//                      ^^^^^^^ ошибка компиляции:
// Only safe (?.) or non-null asserted (!!.) calls are allowed
// on a nullable receiver of type Address?

val city: String = user.address?.city ?: "неизвестно"   // так компилируется`}
          />
          <p className="mt-3 text-[13.5px] text-ok">Ошибка при компиляции: тип <span className="font-mono">Address?</span> честно говорит «может не быть».</p>
        </>
      )}
    </Frame>
  );
}
