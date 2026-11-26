import { useMemo, useState } from "react";
import { Input } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, StepControls, useHistory, usePlayer } from "./kit";

// ── Перфокарта IBM (код Холлерита, как на перфораторе IBM 029) ────────────

const ROWS = ["12", "11", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"] as const;

/** Какие строки пробить для символа. */
function punches(ch: string): string[] | null {
  if (ch === " ") return [];
  if (/[0-9]/.test(ch)) return [ch];
  const c = ch.charCodeAt(0);
  if (ch >= "A" && ch <= "I") return ["12", String(c - 64)];
  if (ch >= "J" && ch <= "R") return ["11", String(c - 73)];
  if (ch >= "S" && ch <= "Z") return ["0", String(c - 81)];
  const special: Record<string, string[]> = {
    ".": ["12", "3", "8"],
    ",": ["0", "3", "8"],
    "-": ["11"],
    "/": ["0", "1"],
    "+": ["12", "6", "8"],
    "=": ["6", "8"],
    "(": ["12", "5", "8"],
    ")": ["11", "5", "8"],
    "*": ["11", "4", "8"],
    "'": ["5", "8"],
  };
  return special[ch] ?? null;
}

export function PunchCard() {
  const [text, setText] = useState("HELLO 1890");
  const cols = useMemo(() => [...text.toUpperCase().slice(0, 40)].map((ch) => ({ ch, p: punches(ch) })), [text]);
  const [hover, setHover] = useState<number | null>(null);
  const cw = 15;
  const rh = 17;
  const left = 30;
  const top = 26;
  const width = left + Math.max(cols.length, 20) * cw + 16;
  const height = top + ROWS.length * rh + 10;
  const bad = cols.filter((c) => c.p === null).length;
  const sel = hover !== null ? cols[hover] : null;

  return (
    <Frame title="Перфокарта IBM" hint="данные — это дырки">
      <label className="block">
        <span className="mb-1.5 block text-[13px] text-dim">Набери текст — латиница, цифры, . , - / + = ( ) *</span>
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={40} className="font-mono uppercase" />
      </label>
      <div className="mt-4 overflow-x-auto rounded-xl">
        <svg width={width} height={height} className="block" role="img" aria-label={`Перфокарта: ${text}`}>
          <path
            d={`M 14 2 H ${width - 2} V ${height - 2} H 2 V 14 Z`}
            fill="#e9dfc2"
            stroke="#c7b98f"
          />
          {cols.map((c, i) => (
            <text key={i} x={left + i * cw + cw / 2} y={16} textAnchor="middle" fontSize={11} fontFamily="ui-monospace, monospace" fill="#5a4e2e">
              {c.ch}
            </text>
          ))}
          {ROWS.map((r, ri) => (
            <g key={r}>
              <text x={8} y={top + ri * rh + 12} fontSize={9} fontFamily="ui-monospace, monospace" fill="#9a8a5e">
                {r}
              </text>
              {cols.map((c, i) => {
                const hit = c.p?.includes(r);
                return hit ? (
                  <rect key={i} x={left + i * cw + 4} y={top + ri * rh + 3} width={cw - 8} height={rh - 6} rx={1.5} fill="#1b1d22" />
                ) : r !== "12" && r !== "11" ? (
                  <text key={i} x={left + i * cw + cw / 2} y={top + ri * rh + 12} textAnchor="middle" fontSize={8.5} fontFamily="ui-monospace, monospace" fill="#b9aa7d">
                    {r}
                  </text>
                ) : null;
              })}
            </g>
          ))}
          {cols.map((_, i) => (
            <rect
              key={i}
              x={left + i * cw}
              y={4}
              width={cw}
              height={height - 8}
              fill={hover === i ? "rgb(106 167 255 / 0.18)" : "transparent"}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onClick={() => setHover(i)}
            />
          ))}
        </svg>
      </div>
      <div className="mt-3 min-h-[40px] text-[13.5px] leading-relaxed text-dim">
        {sel ? (
          sel.p === null ? (
            <>
              <span className="font-mono text-bad">{sel.ch}</span> — такого символа на перфокарте нет. Кириллицы в американском коде не было.
            </>
          ) : sel.p.length === 0 ? (
            "Пробел — пустая колонка."
          ) : (
            <>
              <span className="font-mono text-ink">{sel.ch}</span> = пробиты строки <span className="font-mono text-ink">{sel.p.join(" + ")}</span>.{" "}
              {sel.p.length === 1 ? "Цифра — одна дырка в своей строке." : "Буква — «зона» (12, 11 или 0) плюс цифра: A–I = 12+1…9, J–R = 11+1…9, S–Z = 0+2…9."}
            </>
          )
        ) : (
          <>
            Одна колонка — один символ, 80 колонок на карту. Наведи на колонку, чтобы увидеть код.{" "}
            {bad > 0 && <span className="text-amber">Непробиваемых символов: {bad}.</span>}
          </>
        )}
      </div>
    </Frame>
  );
}

// ── Машина Тьюринга: прибавить единицу к двоичному числу ─────────────

type Sym = "0" | "1" | "_";
type St = "вправо" | "перенос" | "стоп";
interface TM {
  tape: Sym[];
  head: number;
  state: St;
  steps: number;
  rule: number | null;
}

const RULES: { state: St; read: Sym; write: Sym; move: -1 | 1 | 0; next: St; why: string }[] = [
  { state: "вправо", read: "0", write: "0", move: 1, next: "вправо", why: "ищем конец числа" },
  { state: "вправо", read: "1", write: "1", move: 1, next: "вправо", why: "ищем конец числа" },
  { state: "вправо", read: "_", write: "_", move: -1, next: "перенос", why: "дошли до конца — шаг назад к младшему разряду" },
  { state: "перенос", read: "1", write: "0", move: -1, next: "перенос", why: "1+1 = 10: пишем 0, единицу несём левее" },
  { state: "перенос", read: "0", write: "1", move: 0, next: "стоп", why: "0+1 = 1, переноса нет — готово" },
  { state: "перенос", read: "_", write: "1", move: 0, next: "стоп", why: "число кончилось, а перенос остался — новый старший разряд" },
];

const PAD = 3;
function init(bin: string): TM {
  const tape = [...Array(PAD).fill("_"), ...bin.split(""), ...Array(PAD).fill("_")] as Sym[];
  return { tape, head: PAD, state: "вправо", steps: 0, rule: null };
}

function step(m: TM): TM {
  if (m.state === "стоп") return m;
  const tape = [...m.tape];
  let head = m.head;
  const ri = RULES.findIndex((r) => r.state === m.state && r.read === tape[head]);
  const r = RULES[ri];
  tape[head] = r.write;
  head += r.move;
  if (head < 0) {
    tape.unshift("_");
    head = 0;
  }
  if (head >= tape.length) tape.push("_");
  return { tape, head, state: r.next, steps: m.steps + 1, rule: ri };
}

const START = ["1011", "111", "1001", "0"];

export function TuringMachine() {
  const [input, setInput] = useState("1011");
  const h = useHistory(() => init("1011"));
  const m = h.cur;
  const done = m.state === "стоп";
  const player = usePlayer(() => {
    if (h.cur.state === "стоп") return false;
    h.push(step);
    return true;
  }, 550);
  const load = (v: string) => {
    setInput(v);
    player.stop();
    h.reset(init(v));
  };
  const result = m.tape.join("").replace(/_/g, "");
  const rule = m.rule !== null ? RULES[m.rule] : null;

  return (
    <Frame
      title="Машина Тьюринга"
      hint="лента, головка, таблица правил"
      controls={<StepControls onStep={() => h.push(step)} onBack={h.back} canBack={h.canBack} canStep={!done} onReset={() => load(input)} player={player} />}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-dim">Число на ленте:</span>
        <Segmented size="sm" value={input} onChange={load} options={START.map((s) => ({ value: s, label: s }))} />
      </div>

      <Caption>лента</Caption>
      <div className="flex overflow-x-auto pb-1">
        {m.tape.map((s, i) => (
          <div key={i} className="flex shrink-0 flex-col items-center">
            <div className={cx("h-4 text-[13px] leading-4", i === m.head ? "text-accent" : "text-transparent")}>▼</div>
            <div
              className={cx(
                "flex size-10 items-center justify-center border-y border-r font-mono text-[18px] first:border-l",
                i === m.head ? "border-accent bg-accent/15 text-ink" : "border-line text-dim",
              )}
            >
              {s === "_" ? <span className="text-line-strong">·</span> : s}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-[12.5px] text-mute">
        <span>
          состояние: <span style={{ color: done ? C.ok : C.amber }}>{m.state}</span>
        </span>
        <span>шагов: {m.steps}</span>
        {done && (
          <span className="text-ok">
            {input}₂ + 1 = {result}₂ ({parseInt(input, 2)} + 1 = {parseInt(result, 2)})
          </span>
        )}
      </div>

      <Caption className="mt-4">таблица правил — вся «программа»</Caption>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[440px] font-mono text-[12.5px]">
          <thead>
            <tr className="text-left text-mute">
              <th className="py-1 pr-3 font-normal">состояние</th>
              <th className="pr-3 font-normal">читаю</th>
              <th className="pr-3 font-normal">пишу</th>
              <th className="pr-3 font-normal">иду</th>
              <th className="font-normal">дальше</th>
            </tr>
          </thead>
          <tbody>
            {RULES.map((r, i) => (
              <tr key={i} className={cx("border-t border-line", m.rule === i ? "bg-accent/10 text-ink" : "text-dim")}>
                <td className="py-1 pr-3">{r.state}</td>
                <td className="pr-3">{r.read === "_" ? "·" : r.read}</td>
                <td className="pr-3">{r.write === "_" ? "·" : r.write}</td>
                <td className="pr-3">{r.move === 1 ? "→" : r.move === -1 ? "←" : "—"}</td>
                <td>{r.next}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 min-h-[22px] text-[13.5px] text-dim">{rule ? `Правило ${m.rule! + 1}: ${rule.why}.` : "Головка на первом разряде. Жми «Шаг»."}</div>
    </Frame>
  );
}

// ── Одна задача на разных языках ─────────────────────────────────────

interface LangCard {
  id: string;
  name: string;
  year: number;
  who: string;
  pain: string;
  fix: string;
  today: string;
  level: number; // 0 — железо, 10 — «пишу мысль»
  code: string;
}

const LANGS: LangCard[] = [
  {
    id: "asm",
    name: "Ассемблер",
    year: 1949,
    who: "Кэтлин Бут (1947) и другие",
    pain: "Программа — это числовые коды вроде 10110000. Читать и править невозможно.",
    fix: "Мнемоники MOV, ADD, JMP вместо чисел; перевод в коды делает программа.",
    today: "Загрузчики, ядра ОС, горячие циклы, реверс-инжиниринг. Свой для каждого процессора.",
    level: 1,
    code: `; rdi = адрес массива, rsi = длина
    xor  rax, rax        ; сумма = 0
.loop:
    test rsi, rsi
    jz   .done
    mov  rcx, [rdi]      ; x = *p
    test rcx, 1          ; нечётное?
    jnz  .next
    imul rcx, rcx        ; x * x
    add  rax, rcx
.next:
    add  rdi, 8
    dec  rsi
    jmp  .loop
.done:
    ret`,
  },
  {
    id: "fortran",
    name: "FORTRAN",
    year: 1957,
    who: "Джон Бэкус, IBM",
    pain: "Учёным нужны формулы, а не регистры. Никто не верил, что компилятор напишет код не хуже человека.",
    fix: "Пишешь почти как в учебнике: A(I)**2. Оптимизирующий компилятор доказал, что так можно.",
    today: "Климатические модели, физика, суперкомпьютеры. Под капотом numpy лежат библиотеки на Фортране (BLAS, LAPACK).",
    level: 4,
    code: `      INTEGER FUNCTION SUMSQ(A, N)
      INTEGER N, A(N), I
      SUMSQ = 0
      DO 10 I = 1, N
         IF (MOD(A(I), 2) .EQ. 0) SUMSQ = SUMSQ + A(I)**2
   10 CONTINUE
      END`,
  },
  {
    id: "lisp",
    name: "Lisp",
    year: 1958,
    who: "Джон Маккарти, MIT",
    pain: "Исследователям ИИ нужно работать с символами и списками, а не с числами в ячейках.",
    fix: "Функции как значения, рекурсия, код = данные (списки). Здесь же в 1959 году придумали сборку мусора.",
    today: "Clojure, Emacs Lisp. Но главное — идеи: лямбды, GC и REPL есть теперь почти в каждом языке.",
    level: 8,
    code: `(defun sum-sq-even (xs)
  (reduce #'+
          (mapcar (lambda (x) (* x x))
                  (remove-if-not #'evenp xs))))`,
  },
  {
    id: "c",
    name: "C",
    year: 1972,
    who: "Деннис Ритчи, Bell Labs",
    pain: "ОС писали на ассемблере — под каждую машину заново.",
    fix: "Язык почти такой же близкий к железу, как ассемблер, но переносимый. Unix переписали на C в 1973 году.",
    today: "Ядра ОС (Linux), встраиваемые системы, интерпретаторы (CPython), базы данных (Postgres, SQLite).",
    level: 3,
    code: `long sum_sq_even(const long *a, size_t n) {
    long s = 0;
    for (size_t i = 0; i < n; i++)
        if (a[i] % 2 == 0)
            s += a[i] * a[i];
    return s;
}`,
  },
  {
    id: "sql",
    name: "SQL",
    year: 1974,
    who: "Дональд Чемберлин и Рэймонд Бойс, IBM",
    pain: "Чтобы достать данные, программист писал циклы по файлам и сам выбирал способ доступа.",
    fix: "Описываешь, ЧТО нужно, а не КАК. Как именно достать — решает планировщик (декларативный язык).",
    today: "Везде, где есть данные: Postgres, MySQL, аналитика, даже Kafka и Spark.",
    level: 9,
    code: `SELECT SUM(x * x)
FROM numbers
WHERE x % 2 = 0;`,
  },
  {
    id: "cpp",
    name: "C++",
    year: 1985,
    who: "Бьёрн Страуструп, Bell Labs",
    pain: "Большие программы на C превращаются в кашу из структур и функций.",
    fix: "Классы и шаблоны поверх C, абстракции без потерь скорости (zero-cost).",
    today: "Игры, браузеры, базы данных, трейдинг, ML-фреймворки (ядра PyTorch).",
    level: 5,
    code: `// C++23
auto s = std::ranges::fold_left(
    xs | std::views::filter([](long x) { return x % 2 == 0; })
       | std::views::transform([](long x) { return x * x; }),
    0L, std::plus{});`,
  },
  {
    id: "haskell",
    name: "Haskell",
    year: 1990,
    who: "комитет исследователей",
    pain: "Побочные эффекты делают программы трудными для рассуждения.",
    fix: "Чистые функции и ленивость, эффекты видны в типах.",
    today: "Финтех, компиляторы, исследования. Идеи перетекли в Java (Optional, стримы), Rust и TypeScript.",
    level: 9,
    code: `sumSqEven :: [Int] -> Int
sumSqEven = sum . map (^ 2) . filter even`,
  },
  {
    id: "python",
    name: "Python",
    year: 1991,
    who: "Гвидо ван Россум",
    pain: "Скрипты на C и shell долго писать и трудно читать.",
    fix: "Читаемость прежде всего, «батарейки в комплекте», быстрый цикл «написал → запустил».",
    today: "ML и данные, автоматизация, бэкенд. Медленный сам по себе, но склеивает быстрые библиотеки на C.",
    level: 9,
    code: `s = sum(x * x for x in xs if x % 2 == 0)`,
  },
  {
    id: "java",
    name: "Java",
    year: 1995,
    who: "Джеймс Гослинг, Sun",
    pain: "C++: утечки и порча памяти, перекомпиляция под каждую платформу.",
    fix: "Сборщик мусора и виртуальная машина: «write once, run anywhere».",
    today: "Корпоративный бэкенд, банки, Android (через Kotlin), большие данные (Kafka, Spark).",
    level: 7,
    code: `long s = xs.stream()
    .filter(x -> x % 2 == 0)
    .mapToLong(x -> (long) x * x)
    .sum();`,
  },
  {
    id: "js",
    name: "JavaScript",
    year: 1995,
    who: "Брендан Эйх, Netscape (за 10 дней)",
    pain: "Страницы статичны: любое действие — перезагрузка с сервера.",
    fix: "Язык прямо в браузере. Сделан наспех, отсюда странности вроде [] + {}.",
    today: "Весь фронтенд, Node.js на сервере, TypeScript поверх него.",
    level: 8,
    code: `const s = xs
  .filter((x) => x % 2 === 0)
  .reduce((acc, x) => acc + x * x, 0);`,
  },
  {
    id: "go",
    name: "Go",
    year: 2009,
    who: "Гризмер, Пайк, Томпсон, Google",
    pain: "C++ в Google компилировался часами, конкурентность через потоки — больно.",
    fix: "Простой язык, быстрая компиляция, горутины и каналы.",
    today: "Облачная инфраструктура: Docker, Kubernetes, Terraform, сетевые сервисы.",
    level: 6,
    code: `func sumSqEven(xs []int) int {
    s := 0
    for _, x := range xs {
        if x%2 == 0 {
            s += x * x
        }
    }
    return s
}`,
  },
  {
    id: "rust",
    name: "Rust",
    year: 2015,
    who: "Mozilla (Грейдон Хор)",
    pain: "Выбор между скоростью C/C++ с багами памяти и безопасностью со сборщиком мусора.",
    fix: "Borrow checker: безопасность памяти проверяется при компиляции, без GC.",
    today: "Системный код, части Linux и Windows, браузеры, блокчейн, быстрые CLI.",
    level: 5,
    code: `let s: i64 = xs
    .iter()
    .filter(|&&x| x % 2 == 0)
    .map(|&x| x * x)
    .sum();`,
  },
];

export function LangTour() {
  const [id, setId] = useState("c");
  const l = LANGS.find((x) => x.id === id)!;
  const lines = l.code.split("\n").length;
  return (
    <Frame title="Одна задача — двенадцать языков" hint="сумма квадратов чётных чисел">
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
        {LANGS.map((x) => (
          <button
            key={x.id}
            type="button"
            onClick={() => setId(x.id)}
            className={cx(
              "flex shrink-0 flex-col items-start rounded-xl border px-2.5 py-1.5 text-left transition",
              x.id === id ? "border-accent/60 bg-accent/10" : "border-line hover:border-line-strong",
            )}
          >
            <span className="font-mono text-[10.5px] text-mute">{x.year}</span>
            <span className={cx("text-[13px] font-medium", x.id === id ? "text-ink" : "text-dim")}>{x.name}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 grid gap-4 md:grid-cols-[1fr_1.1fr]">
        <div className="text-[14px] leading-relaxed">
          <div className="text-[18px] font-semibold text-ink">
            {l.name} <span className="font-mono text-[13px] font-normal text-mute">· {l.year}</span>
          </div>
          <div className="text-[12.5px] text-mute">{l.who}</div>
          <dl className="mt-3 grid gap-2">
            <div>
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-bad">Боль</dt>
              <dd className="text-dim">{l.pain}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-ok">Решение</dt>
              <dd className="text-dim">{l.fix}</dd>
            </div>
            <div>
              <dt className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-blue">Сегодня</dt>
              <dd className="text-dim">{l.today}</dd>
            </div>
          </dl>
          <div className="mt-3">
            <div className="mb-1 flex justify-between font-mono text-[10.5px] text-mute">
              <span>ближе к железу</span>
              <span>ближе к мысли</span>
            </div>
            <div className="relative h-2 rounded-full bg-gradient-to-r from-amber/50 via-line to-violet/50">
              <span className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-bg bg-ink transition-all" style={{ left: `${l.level * 10}%` }} />
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <Caption>
            код · {lines} {lines === 1 ? "строка" : lines < 5 ? "строки" : "строк"}
          </Caption>
          <pre className="overflow-x-auto rounded-xl border border-line bg-bg p-3 font-mono text-[12.5px] leading-relaxed text-ink">{l.code}</pre>
        </div>
      </div>
    </Frame>
  );
}

// ── Кривая забывания ────────────────────────────────────────────────

const HORIZON = 60;
const PRESETS: { id: string; label: string; days: number[] }[] = [
  { id: "none", label: "Без повторов", days: [] },
  { id: "cram", label: "Зубрёжка", days: [0.05, 0.1, 0.15, 0.2, 0.25] },
  { id: "even", label: "Каждые 2 дня", days: [2, 4, 6, 8, 10] },
  { id: "spaced", label: "1 → 3 → 7 → 16 → 35", days: [1, 3, 7, 16, 35] },
];

/** Простая модель: память R = e^(−t/S); повтор умножает стабильность S тем сильнее, чем больше успел забыть. */
function simulate(days: number[]) {
  const reviews = [...days].sort((a, b) => a - b);
  let S = 1.5;
  let last = 0;
  const pts: [number, number][] = [];
  let ri = 0;
  for (let t = 0; t <= HORIZON; t += 0.05) {
    while (ri < reviews.length && reviews[ri] <= t) {
      const R = Math.exp(-(reviews[ri] - last) / S);
      S = S * (1 + 3 * (1 - R));
      last = reviews[ri];
      ri++;
    }
    pts.push([t, Math.exp(-(t - last) / S)]);
  }
  return pts;
}

export function ForgettingCurve() {
  const [preset, setPreset] = useState("spaced");
  const [custom, setCustom] = useState<number[] | null>(null);
  const days = custom ?? PRESETS.find((p) => p.id === preset)!.days;
  const pts = useMemo(() => simulate(days), [days]);
  const end = pts[pts.length - 1][1];
  const W = 640;
  const H = 220;
  const pl = 34;
  const pb = 22;
  const x = (t: number) => pl + (t / HORIZON) * (W - pl - 8);
  const y = (r: number) => 8 + (1 - r) * (H - pb - 8);
  const path = pts.map(([t, r], i) => `${i ? "L" : "M"}${x(t).toFixed(1)},${y(r).toFixed(1)}`).join(" ");
  const toggle = (d: number) => {
    const base = custom ?? days;
    setCustom(base.includes(d) ? base.filter((v) => v !== d) : [...base, d]);
  };

  return (
    <Frame title="Кривая забывания" hint="повторов везде одинаково — пять">
      <Segmented
        size="sm"
        value={custom ? "custom" : preset}
        onChange={(v) => {
          if (v === "custom") return;
          setCustom(null);
          setPreset(v);
        }}
        options={[...PRESETS.map((p) => ({ value: p.id, label: p.label })), ...(custom ? [{ value: "custom", label: "Свой" }] : [])]}
        className="max-w-full overflow-x-auto"
      />
      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px]" role="img" aria-label="График удержания в памяти">
          {[0, 0.25, 0.5, 0.75, 1].map((r) => (
            <g key={r}>
              <line x1={pl} x2={W - 8} y1={y(r)} y2={y(r)} stroke={C.line} strokeDasharray={r === 0 ? undefined : "2 4"} />
              <text x={pl - 6} y={y(r) + 4} textAnchor="end" fontSize={10} fill={C.mute} fontFamily="ui-monospace, monospace">
                {r * 100}%
              </text>
            </g>
          ))}
          {[0, 10, 20, 30, 40, 50, 60].map((t) => (
            <text key={t} x={x(t)} y={H - 6} textAnchor="middle" fontSize={10} fill={C.mute} fontFamily="ui-monospace, monospace">
              {t}д
            </text>
          ))}
          {days.map((d) => (
            <line key={d} x1={x(d)} x2={x(d)} y1={8} y2={H - pb} stroke={C.amber} strokeOpacity={0.45} />
          ))}
          <path d={path} fill="none" stroke={end > 0.3 ? C.ok : end > 0.1 ? C.amber : C.bad} strokeWidth={2.2} />
        </svg>
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <span className="text-[13.5px] text-dim">
          Через 60 дней помнишь: <span className={cx("font-mono text-[18px] font-semibold", end > 0.3 ? "text-ok" : end > 0.1 ? "text-amber" : "text-bad")}>{Math.round(end * 100)}%</span>
        </span>
        <span className="text-[12.5px] text-mute">повторов: {days.length}</span>
      </div>
      <Caption className="mt-4">свои дни повторов — нажимай</Caption>
      <div className="flex flex-wrap gap-1">
        {Array.from({ length: 40 }, (_, i) => i + 1).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => toggle(d)}
            className={cx(
              "size-7 rounded-md font-mono text-[11px] transition",
              days.includes(d) ? "bg-amber text-bg" : "bg-raised text-mute hover:text-ink",
            )}
          >
            {d}
          </button>
        ))}
      </div>
    </Frame>
  );
}

// ── Кёнигсбергские мосты ───────────────────────────────────────────

const LAND = [
  { id: "N", name: "северный берег", x: 200, y: 40 },
  { id: "S", name: "южный берег", x: 200, y: 240 },
  { id: "I", name: "остров Кнайпхоф", x: 150, y: 140 },
  { id: "E", name: "восточный остров", x: 330, y: 140 },
] as const;
type Land = (typeof LAND)[number]["id"];
const BASE_BRIDGES: [Land, Land, number][] = [
  ["N", "I", -22],
  ["N", "I", 22],
  ["S", "I", -22],
  ["S", "I", 22],
  ["N", "E", 0],
  ["S", "E", 0],
  ["I", "E", 0],
];

export function EulerBridges() {
  const [extra, setExtra] = useState(false);
  const bridges = useMemo(() => (extra ? [...BASE_BRIDGES, ["N", "S", 60] as [Land, Land, number]] : BASE_BRIDGES), [extra]);
  const [at, setAt] = useState<Land | null>(null);
  const [used, setUsed] = useState<number[]>([]);
  const deg = (l: Land) => bridges.filter(([a, b]) => a === l || b === l).length;
  const odd = LAND.filter((l) => deg(l.id) % 2 === 1);
  const pos = (l: Land) => LAND.find((x) => x.id === l)!;
  const reset = () => {
    setAt(null);
    setUsed([]);
  };
  const canCross = (i: number) => at !== null && !used.includes(i) && (bridges[i][0] === at || bridges[i][1] === at);
  const cross = (i: number) => {
    if (!canCross(i)) return;
    const [a, b] = bridges[i];
    setUsed([...used, i]);
    setAt(a === at ? b : a);
  };
  const stuck = at !== null && used.length < bridges.length && !bridges.some((_, i) => canCross(i));
  const won = used.length === bridges.length;

  const path = (i: number) => {
    const [a, b, bend] = bridges[i];
    const p = pos(a);
    const q = pos(b);
    const mx = (p.x + q.x) / 2;
    const my = (p.y + q.y) / 2;
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len = Math.hypot(dx, dy);
    const cx = mx + (-dy / len) * bend;
    const cy = my + (dx / len) * bend;
    return `M ${p.x} ${p.y} Q ${cx} ${cy} ${q.x} ${q.y}`;
  };

  return (
    <Frame title="Кёнигсбергские мосты" hint="пройди каждый мост ровно один раз">
      <div className="grid gap-4 md:grid-cols-[1fr_220px]">
        <svg viewBox="0 0 440 280" className="w-full" role="img" aria-label="Граф мостов">
          <path d="M0 95 C 120 120, 300 70, 440 100 L 440 185 C 300 205, 120 160, 0 185 Z" fill="rgb(106 167 255 / 0.12)" />
          {bridges.map((_, i) => (
            <path
              key={i}
              d={path(i)}
              fill="none"
              stroke={used.includes(i) ? C.lineStrong : canCross(i) ? C.accent : C.dim}
              strokeWidth={canCross(i) ? 6 : 4}
              strokeDasharray={used.includes(i) ? "4 6" : undefined}
              strokeLinecap="round"
              className={canCross(i) ? "cursor-pointer" : ""}
              onClick={() => cross(i)}
            />
          ))}
          {LAND.map((l) => (
            <g key={l.id} onClick={() => at === null && setAt(l.id)} className={at === null ? "cursor-pointer" : ""}>
              <circle cx={l.x} cy={l.y} r={22} fill={at === l.id ? C.accent : C.raised} stroke={deg(l.id) % 2 ? C.amber : C.ok} strokeWidth={3} />
              <text x={l.x} y={l.y + 5} textAnchor="middle" fontSize={14} fontWeight={600} fill={at === l.id ? C.bg : C.ink}>
                {deg(l.id)}
              </text>
            </g>
          ))}
        </svg>
        <div className="text-[13.5px] leading-relaxed text-dim">
          {at === null ? (
            <p>Выбери, откуда начать прогулку, — нажми на кружок. Цифра в кружке — сколько мостов из него выходит.</p>
          ) : won ? (
            <p className="text-ok">Прошёл все мосты по разу! С лишним мостом нечётных вершин стало {odd.length} — и путь существует.</p>
          ) : stuck ? (
            <p className="text-amber">Тупик: из этой точки все мосты уже пройдены, а {bridges.length - used.length} ещё нет. Попробуй с другого старта — не выйдет.</p>
          ) : (
            <p>
              Ты на: <span className="text-ink">{pos(at).name}</span>. Пройдено {used.length} из {bridges.length}. Зелёным светятся мосты, по которым можно идти.
            </p>
          )}
          <p className="mt-3 text-[12.5px] text-mute">
            Нечётных вершин: <span className="font-mono text-amber">{odd.length}</span>. Эйлер: путь по всем рёбрам по разу есть, только если нечётных вершин 0 или 2.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={reset} className="h-8 rounded-lg border border-line px-3 text-[12.5px] text-dim hover:text-ink">
              Заново
            </button>
            <button
              type="button"
              onClick={() => {
                setExtra((v) => !v);
                reset();
              }}
              className="h-8 rounded-lg border border-line px-3 text-[12.5px] text-dim hover:text-ink"
            >
              {extra ? "Убрать восьмой мост" : "Построить восьмой мост"}
            </button>
          </div>
        </div>
      </div>
    </Frame>
  );
}

// ── Система из двух уравнений = две прямые ───────────────────────────

const pp = (n: number) => (n < 0 ? `(${n})` : `${n}`);

export function TwoLines() {
  const [a, setA] = useState({ a: 1, b: 1, c: 4 });
  const [b, setB] = useState({ a: 1, b: -1, c: 0 });
  // a·x + b·y = c
  const det = a.a * b.b - a.b * b.a;
  const x = det !== 0 ? (a.c * b.b - a.b * b.c) / det : null;
  const y = det !== 0 ? (a.a * b.c - a.c * b.a) / det : null;
  const same = det === 0 && a.a * b.c === b.a * a.c && a.b * b.c === b.b * a.c;
  const S = 26;
  const W = 300;
  const toX = (v: number) => W / 2 + v * S;
  const toY = (v: number) => W / 2 - v * S;
  const line = (l: { a: number; b: number; c: number }) => {
    if (l.b !== 0) return [-6, 6].map((xx) => [xx, (l.c - l.a * xx) / l.b]);
    if (l.a !== 0) return [-6, 6].map((yy) => [l.c / l.a, yy]);
    return null;
  };
  const edit = (l: typeof a, set: (v: typeof a) => void, color: string, name: string) => (
    <div className="flex flex-wrap items-center gap-1.5 font-mono text-[13px]">
      <span className="mr-1 size-2.5 rounded-full" style={{ background: color }} aria-hidden />
      {(["a", "b", "c"] as const).map((k, i) => (
        <span key={k} className="flex items-center gap-1">
          <Input
            type="number"
            inputMode="numeric"
            aria-label={`${name}: ${k}`}
            value={l[k]}
            onChange={(e) => set({ ...l, [k]: Number(e.target.value) || 0 })}
            className="h-9! w-16! px-2! text-center font-mono"
          />
          <span className="text-mute">{i === 0 ? "x +" : i === 1 ? "y =" : ""}</span>
        </span>
      ))}
    </div>
  );
  const la = line(a);
  const lb = line(b);
  return (
    <Frame title="Система уравнений — это две прямые" hint="меняй коэффициенты">
      <div className="grid gap-4 md:grid-cols-[300px_1fr]">
        <svg viewBox={`0 0 ${W} ${W}`} className="w-full max-w-[300px]" role="img" aria-label="Две прямые на плоскости">
          {Array.from({ length: 11 }, (_, i) => i - 5).map((v) => (
            <g key={v}>
              <line x1={toX(v)} x2={toX(v)} y1={0} y2={W} stroke={v === 0 ? C.lineStrong : C.line} />
              <line y1={toY(v)} y2={toY(v)} x1={0} x2={W} stroke={v === 0 ? C.lineStrong : C.line} />
            </g>
          ))}
          {la && <line x1={toX(la[0][0])} y1={toY(la[0][1])} x2={toX(la[1][0])} y2={toY(la[1][1])} stroke={C.blue} strokeWidth={2.5} />}
          {lb && <line x1={toX(lb[0][0])} y1={toY(lb[0][1])} x2={toX(lb[1][0])} y2={toY(lb[1][1])} stroke={C.violet} strokeWidth={2.5} strokeDasharray={same ? "6 6" : undefined} />}
          {x !== null && y !== null && <circle cx={toX(x)} cy={toY(y)} r={6} fill={C.accent} />}
        </svg>
        <div className="grid content-start gap-3">
          {edit(a, setA, C.blue, "первое")}
          {edit(b, setB, C.violet, "второе")}
          <div className="rounded-xl bg-raised/60 p-3 text-[13.5px] leading-relaxed text-dim">
            <div className="font-mono text-[12px] text-mute">
              det = {pp(a.a)}·{pp(b.b)} − {pp(a.b)}·{pp(b.a)} = <span className={det === 0 ? "text-bad" : "text-ink"}>{det}</span>
            </div>
            {det !== 0 ? (
              <p className="mt-1">
                Одна точка пересечения: <span className="font-mono text-accent">x = {+x!.toFixed(3)}, y = {+y!.toFixed(3)}</span>. Определитель не ноль — решение единственное.
              </p>
            ) : same ? (
              <p className="mt-1 text-amber">Прямые совпали: решений бесконечно много. Определитель 0.</p>
            ) : (
              <p className="mt-1 text-bad">Прямые параллельны: решений нет. Определитель 0 — «плоскость сплющилась».</p>
            )}
          </div>
          <p className="text-[12.5px] text-mute">Попробуй второе уравнение 2x + 2y = 8 (совпадёт с первым) и 1x + 1y = 0 (параллельно).</p>
        </div>
      </div>
    </Frame>
  );
}
