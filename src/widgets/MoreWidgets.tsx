import { useMemo, useState } from "react";
import { Code } from "../ui/Compare";
import { Slider } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { useIsPhone } from "../lib/hooks";
import { Frame } from "./Frame";
import { C, Caption, Log, Metric, Metrics, StepControls, useHistory, usePlayer } from "./kit";

// ── Мутационное тестирование: ловят ли тесты подмену кода ───────────

const MUTANTS = [
  { id: "orig", label: "оригинал", code: "return age >= 18 && !banned;", f: (a: number, b: boolean) => a >= 18 && !b },
  { id: "gt", label: ">= → >", code: "return age > 18 && !banned;", f: (a: number, b: boolean) => a > 18 && !b },
  { id: "or", label: "&& → ||", code: "return age >= 18 || !banned;", f: (a: number, b: boolean) => a >= 18 || !b },
  { id: "neg", label: "убрать !", code: "return age >= 18 && banned;", f: (a: number, b: boolean) => a >= 18 && b },
  { id: "true", label: "return true", code: "return true;", f: () => true },
];
const TESTS = [
  { id: "adult", label: "canBuy(30, false) == true", a: 30, b: false, want: true, weak: false },
  { id: "kid", label: "canBuy(10, false) == false", a: 10, b: false, want: false, weak: false },
  { id: "edge", label: "canBuy(18, false) == true  (граница)", a: 18, b: false, want: true, weak: false },
  { id: "banned", label: "canBuy(30, true) == false", a: 30, b: true, want: false, weak: false },
  { id: "smoke", label: "canBuy(30, false) не бросает исключение", a: 30, b: false, want: null, weak: true },
];

export function MutationLab() {
  const [on, setOn] = useState<string[]>(["adult", "smoke"]);
  const tests = TESTS.filter((t) => on.includes(t.id));
  const killed = (m: (typeof MUTANTS)[number]) => tests.some((t) => !t.weak && m.f(t.a, t.b) !== t.want);
  const mutants = MUTANTS.slice(1);
  const score = mutants.filter(killed).length;
  const coverage = tests.length ? 100 : 0;
  return (
    <Frame title="Мутационное тестирование" hint="покрытие 100% ≠ тесты что-то проверяют">
      <Code code={`boolean canBuy(int age, boolean banned) {\n    ${MUTANTS[0].code}\n}`} />
      <Caption className="mt-4">тесты — включай и выключай</Caption>
      <div className="grid gap-1.5">
        {TESTS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setOn((o) => (o.includes(t.id) ? o.filter((x) => x !== t.id) : [...o, t.id]))}
            className={cx("flex items-center gap-2 rounded-lg border px-3 py-1.5 text-left font-mono text-[12px] transition", on.includes(t.id) ? "border-accent/50 bg-accent/10 text-ink" : "border-line text-mute")}
          >
            <span className={cx("size-3 rounded-sm border", on.includes(t.id) ? "border-accent bg-accent" : "border-line-strong")} />
            {t.label}
          </button>
        ))}
      </div>
      <Caption className="mt-4">мутанты — испорченные версии кода</Caption>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {mutants.map((m) => {
          const k = killed(m);
          return (
            <div key={m.id} className={cx("rounded-lg border px-3 py-1.5 font-mono text-[12px]", k ? "border-ok/50 text-ok" : "border-bad/50 text-bad")}>
              {k ? "✓ убит" : "✗ выжил"} · {m.label}
            </div>
          );
        })}
      </div>
      <Metrics className="mt-3">
        <Metric label="покрытие строк" value={`${coverage}%`} />
        <Metric label="убито мутантов" value={`${score}/${mutants.length}`} tone={score === mutants.length ? "ok" : score ? "amber" : "bad"} />
      </Metrics>
      <p className="mt-3 text-[13px] leading-relaxed text-dim">
        Любой включённый тест даёт 100% покрытия этой строки. Но «не бросает исключение» не проверяет ничего, а без теста на границу <span className="font-mono text-ink">18</span> выживает подмена <span className="font-mono text-ink">&gt;=</span> на <span className="font-mono text-ink">&gt;</span>. Мутационное тестирование (PIT для Java) честно меряет качество тестов.
      </p>
    </Frame>
  );
}

// ── Test doubles ───────────────────────────────────────────────────

const DOUBLES = {
  dummy: { label: "Dummy", what: "Передаётся, но не используется — нужен только чтобы заполнить параметр.", code: `new OrderService(repo, null /* auditLog не нужен в этом тесте */);` },
  stub: { label: "Stub", what: "Возвращает заготовленные ответы. Проверяем результат, а не взаимодействие.", code: `when(rates.get("USD")).thenReturn(new BigDecimal("470"));\nassertEquals(new BigDecimal("4700"), converter.toKzt(usd(10)));` },
  mock: { label: "Mock", what: "Проверяет, что с ним взаимодействовали ожидаемым образом. Полезен для побочных эффектов — письма, события.", code: `service.register(user);\nverify(mailer).sendWelcome("ada@x.kz");\nverifyNoMoreInteractions(mailer);` },
  spy: { label: "Spy", what: "Настоящий объект, который ещё и записывает вызовы.", code: `List<String> log = spy(new ArrayList<>());\nprocessor.run(log);\nverify(log, times(3)).add(anyString());` },
  fake: { label: "Fake", what: "Рабочая упрощённая реализация: in-memory репозиторий, фейковые часы. Часто лучший выбор — тесты не ломаются при рефакторинге.", code: `class InMemoryOrders implements OrderRepository {\n    private final Map<Long, Order> db = new HashMap<>();\n    public void save(Order o) { db.put(o.id(), o); }\n    public Optional<Order> find(long id) { return Optional.ofNullable(db.get(id)); }\n}` },
} as const;
type DoubleKind = keyof typeof DOUBLES;

export function TestDoubles() {
  const [k, setK] = useState<DoubleKind>("stub");
  const d = DOUBLES[k];
  return (
    <Frame title="Пять видов тестовых двойников" hint="«мок» — не всё подряд">
      <Segmented size="sm" value={k} onChange={setK} options={(Object.keys(DOUBLES) as DoubleKind[]).map((x) => ({ value: x, label: DOUBLES[x].label }))} className="max-w-full overflow-x-auto" />
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">{d.what}</p>
      <Code className="mt-3" code={d.code} />
    </Frame>
  );
}

// ── TDD: красный → зелёный → рефакторинг ─────────────────────────────

const TDD = [
  { phase: "red", test: `@Test void emptyCartIsZero() {\n    assertEquals(Money.ZERO, new Cart().total());\n}`, code: `// класса Cart ещё нет`, note: "Тест на самое простое поведение. Он не компилируется — это тоже «красный»." },
  { phase: "green", test: `@Test void emptyCartIsZero() { ... }`, code: `class Cart {\n    Money total() { return Money.ZERO; }\n}`, note: "Минимальный код, чтобы тест прошёл. Да, это «обман» — следующий тест его разоблачит." },
  { phase: "red", test: `@Test void sumsItems() {\n    var c = new Cart();\n    c.add(item(300)); c.add(item(200));\n    assertEquals(Money.of(500), c.total());\n}`, code: `Money total() { return Money.ZERO; }`, note: "Новый тест падает: total всегда 0." },
  { phase: "green", test: `@Test void sumsItems() { ... }`, code: `private final List<Item> items = new ArrayList<>();\nvoid add(Item i) { items.add(i); }\nMoney total() {\n    Money s = Money.ZERO;\n    for (Item i : items) s = s.plus(i.price());\n    return s;\n}`, note: "Настоящая реализация. Оба теста зелёные." },
  { phase: "refactor", test: `// оба теста зелёные`, code: `Money total() {\n    return items.stream().map(Item::price).reduce(Money.ZERO, Money::plus);\n}`, note: "Рефакторинг под защитой тестов: поведение то же, код чище. Тесты подтверждают, что ничего не сломали." },
  { phase: "red", test: `@Test void discountOver10000() {\n    // корзина на 12 000 → скидка 5%\n    assertEquals(Money.of(11400), cart(12000).total());\n}`, code: `// скидки ещё нет`, note: "Следующее требование — снова с теста. Цикл короткий: минуты, а не часы." },
];

export function TddCycle() {
  const [i, setI] = useState(0);
  const s = TDD[i];
  const color = s.phase === "red" ? C.bad : s.phase === "green" ? C.ok : C.blue;
  const label = s.phase === "red" ? "КРАСНЫЙ — тест падает" : s.phase === "green" ? "ЗЕЛЁНЫЙ — тест проходит" : "РЕФАКТОРИНГ — улучшаем код";
  return (
    <Frame
      title="Цикл TDD"
      hint="red → green → refactor"
      controls={<StepControls onStep={() => setI((v) => Math.min(TDD.length - 1, v + 1))} onBack={() => setI((v) => Math.max(0, v - 1))} canBack={i > 0} canStep={i < TDD.length - 1} onReset={() => setI(0)} />}
    >
      <div className="mb-3 flex items-center gap-2 font-mono text-[12px] font-semibold tracking-wide" style={{ color }}>
        <span className="size-2.5 rounded-full" style={{ background: color }} /> {label}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <Caption>тест</Caption>
          <Code code={s.test} />
        </div>
        <div className="min-w-0">
          <Caption>код</Caption>
          <Code code={s.code} />
        </div>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">{s.note}</p>
    </Frame>
  );
}

// ── Rate limiting: сравнение алгоритмов ─────────────────────────────

type Algo = "fixed" | "sliding" | "bucket";
const BURST: number[] = (() => {
  const t: number[] = [];
  for (let s = 0; s < 6; s++) for (let k = 0; k < 3; k++) t.push(s * 1000 + 100 + k * 250);
  for (let k = 0; k < 8; k++) t.push(5850 + k * 30); // всплеск на стыке окон
  for (let k = 0; k < 8; k++) t.push(6050 + k * 30);
  for (let s = 7; s < 10; s++) t.push(s * 1000 + 500);
  return t.sort((a, b) => a - b);
})();

function decide(algo: Algo, limit: number) {
  const res: boolean[] = [];
  if (algo === "fixed") {
    const cnt = new Map<number, number>();
    for (const t of BURST) {
      const w = Math.floor(t / 1000);
      const c = cnt.get(w) ?? 0;
      res.push(c < limit);
      if (c < limit) cnt.set(w, c + 1);
    }
  } else if (algo === "sliding") {
    const log: number[] = [];
    for (const t of BURST) {
      while (log.length && log[0] <= t - 1000) log.shift();
      const ok = log.length < limit;
      if (ok) log.push(t);
      res.push(ok);
    }
  } else {
    let tokens = limit;
    let last = 0;
    for (const t of BURST) {
      tokens = Math.min(limit, tokens + ((t - last) * limit) / 1000);
      last = t;
      const ok = tokens >= 1;
      if (ok) tokens -= 1;
      res.push(ok);
    }
  }
  return res;
}

export function RateLimiterViz() {
  const phone = useIsPhone();
  const [algo, setAlgo] = useState<Algo>("fixed");
  const [limit, setLimit] = useState(5);
  const res = useMemo(() => decide(algo, limit), [algo, limit]);
  // максимум пропущенных в любом окне 1 с
  const allowed = BURST.filter((_, i) => res[i]);
  let peak = 0;
  for (let i = 0; i < allowed.length; i++) {
    let j = i;
    while (j < allowed.length && allowed[j] < allowed[i] + 1000) j++;
    peak = Math.max(peak, j - i);
  }
  const W = 640;
  const x = (t: number) => 10 + (t / 10000) * (W - 20);
  return (
    <Frame title="Лимит: N запросов в секунду" hint="на стыке окон — всплеск">
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          size="sm"
          value={algo}
          onChange={setAlgo}
          options={[
            { value: "fixed", label: phone ? "Окно" : "Фиксированное окно" },
            { value: "sliding", label: phone ? "Лог" : "Скользящий лог" },
            { value: "bucket", label: phone ? "Ведро" : "Ведро токенов" },
          ]}
          className="max-w-full overflow-x-auto"
        />
      </div>
      <div className="mt-3">
        <Slider label="Лимит в секунду" value={limit} min={2} max={10} onChange={setLimit} />
      </div>
      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${W} 90`} className="w-full" role="img" aria-label="Запросы на временной шкале">
          {Array.from({ length: 11 }, (_, s) => (
            <g key={s}>
              <line x1={x(s * 1000)} x2={x(s * 1000)} y1={8} y2={70} stroke={algo === "fixed" ? C.lineStrong : C.line} strokeDasharray={algo === "fixed" ? undefined : "2 4"} />
              <text x={x(s * 1000)} y={84} textAnchor="middle" fontSize={10} fill={C.mute} fontFamily="ui-monospace, monospace">{s}с</text>
            </g>
          ))}
          {BURST.map((t, i) => (
            <rect key={i} x={x(t) - 2} y={res[i] ? 24 : 46} width={4} height={16} rx={1.5} fill={res[i] ? C.ok : C.bad} />
          ))}
          <text x={4} y={20} fontSize={10} fill={C.ok}>пропущен</text>
          <text x={4} y={64} fontSize={10} fill={C.bad}>отказ</text>
        </svg>
      </div>
      <Metrics className="mt-2">
        <Metric label="пропущено" value={`${allowed.length}/${BURST.length}`} />
        <Metric label="пик за любую 1 с" value={peak} tone={peak > limit ? "bad" : "ok"} />
      </Metrics>
      <p className="mt-3 text-[13px] leading-relaxed text-dim">
        {algo === "fixed"
          ? `Просто: счётчик на каждую секунду. Но всплеск на стыке 5-й и 6-й секунды пролезает дважды — за одну реальную секунду проходит до ${2 * limit} запросов.`
          : algo === "sliding"
            ? "Точно: храним время каждого пропущенного запроса за последнюю секунду. Цена — память на лог; на практике делают «скользящее окно со счётчиками» как приближение."
            : "Ведро наполняется равномерно и допускает короткий всплеск до ёмкости. Стандарт для API-шлюзов: дешёво, плавно, хорошо описывает «в среднем N, кратко до M»."}
      </p>
    </Frame>
  );
}

// ── Raft: выбор лидера и репликация ─────────────────────────────────

type Role = "follower" | "candidate" | "leader" | "down";
interface RaftState {
  term: number;
  nodes: { role: Role; log: number; vote: number | null }[];
  commit: number;
  note: string;
}
const RAFT_STEPS: ((s: RaftState) => RaftState)[] = [
  (s) => ({ ...s, note: "5 узлов, все — ведомые (followers). У каждого случайный таймаут выборов (150–300 мс)." }),
  (s) => ({ ...s, term: 1, nodes: s.nodes.map((n, i) => (i === 2 ? { ...n, role: "candidate", vote: 2 } : n)), note: "У узла 3 таймаут истёк первым: он становится кандидатом, увеличивает term до 1 и голосует за себя." }),
  (s) => ({ ...s, nodes: s.nodes.map((n, i) => ({ ...n, vote: 2, role: i === 2 ? "leader" : "follower" })), note: "Остальные ещё не голосовали в term 1 — отдают голос. 5 из 5 ≥ большинства (3): узел 3 — лидер." }),
  (s) => ({ ...s, nodes: s.nodes.map((n, i) => (i === 2 ? { ...n, log: 1 } : n)), note: "Клиент пишет x=1. Лидер добавляет запись в свой журнал — пока НЕ закоммичено." }),
  (s) => ({ ...s, nodes: s.nodes.map((n, i) => (i <= 3 ? { ...n, log: 1 } : n)), note: "Лидер рассылает AppendEntries. Узлы 1, 2, 4 подтвердили (узел 5 медленный)." }),
  (s) => ({ ...s, commit: 1, note: "Запись есть у 4 узлов из 5 — это большинство. Лидер считает её закоммиченной и отвечает клиенту." }),
  (s) => ({ ...s, nodes: s.nodes.map((n, i) => (i === 2 ? { ...n, role: "down" } : n)), note: "Лидер падает. Heartbeat'ы прекращаются." }),
  (s) => ({ ...s, term: 2, nodes: s.nodes.map((n, i) => (i === 0 ? { ...n, role: "candidate", vote: 0 } : n)), note: "Узел 1 не получает heartbeat, ждёт таймаут и начинает выборы в term 2." }),
  (s) => ({ ...s, nodes: s.nodes.map((n, i) => (n.role === "down" ? n : { ...n, vote: 0, role: i === 0 ? "leader" : "follower" })), note: "Узлы 2, 4 голосуют за узел 1: его журнал не короче их. Узел 5 — тоже. Новый лидер в term 2. Закоммиченная x=1 у него есть — данные не потеряны." }),
  (s) => ({ ...s, nodes: s.nodes.map((n) => (n.role === "down" ? n : { ...n, log: 1 })), note: "Новый лидер догоняет отставший узел 5. Голос получает только кандидат с журналом не хуже твоего — поэтому закоммиченное не теряется." }),
];

export function RaftViz() {
  const start = (): RaftState => ({ term: 0, nodes: Array.from({ length: 5 }, () => ({ role: "follower", log: 0, vote: null })), commit: 0, note: "" });
  const [i, setI] = useState(0);
  const state = useMemo(() => RAFT_STEPS.slice(0, i + 1).reduce((s, f) => f(s), start()), [i]);
  const color: Record<Role, string> = { follower: C.dim, candidate: C.amber, leader: C.ok, down: C.bad };
  return (
    <Frame
      title="Raft: выборы лидера и репликация"
      hint={`term ${state.term}`}
      controls={<StepControls onStep={() => setI((v) => Math.min(RAFT_STEPS.length - 1, v + 1))} onBack={() => setI((v) => Math.max(0, v - 1))} canBack={i > 0} canStep={i < RAFT_STEPS.length - 1} onReset={() => setI(0)} />}
    >
      <div className="grid grid-cols-5 gap-1.5 sm:gap-2">
        {state.nodes.map((n, k) => (
          <div key={k} className="min-w-0 rounded-xl border px-1 py-2 text-center transition" style={{ borderColor: color[n.role] }}>
            <div className="font-mono text-[11px] text-mute">№{k + 1}</div>
            <div className="mt-0.5 truncate text-[11px] font-semibold sm:text-[12px]" style={{ color: color[n.role] }}>
              {n.role === "follower" ? "ведомый" : n.role === "candidate" ? "кандидат" : n.role === "leader" ? "лидер" : "упал"}
            </div>
            <div className="mt-1.5 flex justify-center">
              <span className={cx("rounded-md px-1.5 py-0.5 font-mono text-[11px]", n.log ? (state.commit ? "bg-ok/20 text-ok" : "bg-amber/20 text-amber") : "bg-raised text-mute")}>
                {n.log ? "x=1" : "—"}
              </span>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 min-h-[60px] text-[13.5px] leading-relaxed text-dim">{state.note}</p>
    </Frame>
  );
}

// ── Base62 для коротких ссылок ──────────────────────────────────────

const ALPH = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
function base62(n: bigint) {
  if (n === 0n) return "0";
  let s = "";
  while (n > 0n) {
    s = ALPH[Number(n % 62n)] + s;
    n /= 62n;
  }
  return s;
}

export function Base62Viz() {
  const [exp, setExp] = useState(9);
  const id = 10n ** BigInt(exp) + 12345n;
  const code = base62(id);
  const capacity = (len: number) => 62 ** len;
  return (
    <Frame title="Короткий код из id" hint="base62: 0–9, a–z, A–Z">
      <Slider label="Порядковый номер ссылки ≈ 10^n" value={exp} min={1} max={15} onChange={setExp} display={`10^${exp}`} />
      <div className="mt-3 grid gap-2 font-mono text-[13px]">
        <div className="rounded-xl bg-raised/60 px-3 py-2">
          <span className="text-mute">id: </span>
          <span className="text-ink">{id.toLocaleString("ru")}</span>
        </div>
        <div className="rounded-xl bg-raised/60 px-3 py-2">
          <span className="text-mute">код: </span>
          <span className="text-accent">sho.rt/{code}</span> <span className="text-mute">· {code.length} символов</span>
        </div>
      </div>
      <Caption className="mt-4">сколько ссылок помещается в n символов</Caption>
      <div className="grid grid-cols-4 gap-1.5 font-mono text-[12px]">
        {[5, 6, 7, 8].map((l) => (
          <div key={l} className="rounded-lg border border-line px-2 py-1.5 text-center">
            <div className="text-mute">{l} симв.</div>
            <div className="text-ink">{capacity(l) >= 1e12 ? `${(capacity(l) / 1e12).toFixed(1)} трлн` : `${(capacity(l) / 1e9).toFixed(1)} млрд`}</div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-dim">7 символов — 3.5 триллиона кодов: при 100 млн новых ссылок в день хватит на сотню лет. Последовательные id легко перебрать — поэтому id перемешивают (биекция) или берут случайные коды с проверкой коллизий.</p>
    </Frame>
  );
}

// ── Redis: один поток и медленная команда ───────────────────────────

const CMDS = [
  { name: "GET user:42", ms: 0.05 },
  { name: "INCR views", ms: 0.05 },
  { name: "LPUSH queue job", ms: 0.06 },
  { name: "KEYS *", ms: 900, slow: true },
  { name: "GET session:7", ms: 0.05 },
  { name: "SET cart:9 …", ms: 0.06 },
];

export function RedisSingleThread() {
  const [scan, setScan] = useState(false);
  const h = useHistory(() => ({ i: 0, clock: 0, log: [] as string[] }));
  const cmds = CMDS.map((c) => (c.slow && scan ? { name: "SCAN 0 COUNT 100 (порциями)", ms: 0.4, slow: false } : c));
  const s = h.cur;
  const step = () =>
    h.push((p) => {
      if (p.i >= cmds.length) return p;
      const c = cmds[p.i];
      const end = p.clock + c.ms;
      return { i: p.i + 1, clock: end, log: [...p.log, `${c.name} — готово на ${end.toFixed(2)} мс${c.ms > 10 ? " ⚠ все остальные клиенты ждали" : ""}`] };
    });
  const player = usePlayer(() => {
    step();
    return h.cur.i + 1 < cmds.length;
  }, 600);
  return (
    <Frame
      title="Redis выполняет команды по одной"
      hint="один поток — нет блокировок, но и нет параллелизма"
      controls={<StepControls onStep={step} onBack={h.back} canBack={h.canBack} canStep={s.i < cmds.length} onReset={() => h.reset()} player={player} />}
    >
      <Segmented
        size="sm"
        value={scan ? "scan" : "keys"}
        onChange={(v) => {
          setScan(v === "scan");
          h.reset();
        }}
        options={[
          { value: "keys", label: "KEYS * на 10 млн ключей" },
          { value: "scan", label: "SCAN порциями" },
        ]}
      />
      <Caption className="mt-3">очередь команд от разных клиентов</Caption>
      <div className="flex flex-wrap gap-1.5">
        {cmds.map((c, k) => (
          <span key={k} className={cx("rounded-md px-2 py-1 font-mono text-[11.5px]", k < s.i ? "bg-raised text-mute line-through" : k === s.i ? "bg-accent/20 text-ink" : c.slow ? "bg-bad/15 text-bad" : "bg-raised text-dim")}>
            {c.name}
          </span>
        ))}
      </div>
      <Log className="mt-3" lines={s.log} empty="Жми «Шаг»." />
      <Metrics className="mt-3">
        <Metric label="время ответа последней команды" value={`${s.clock.toFixed(2)} мс`} tone={s.clock > 10 ? "bad" : "ok"} />
      </Metrics>
    </Frame>
  );
}
