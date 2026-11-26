import { useMemo, useState } from "react";
import { Slider, Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Log, Metric, Metrics } from "./kit";

// ── Деньги в коде: double, округление, распределение ────────────────

/** Сумма n раз по 0.10 в double и в «копейках». */
function sumDouble(n: number) {
  let s = 0;
  for (let i = 0; i < n; i++) s += 0.1;
  return s;
}

type Mode = "HALF_UP" | "HALF_EVEN";
function roundCents(x: number, mode: Mode) {
  // x — значение в копейках с дробной частью (ровно .5 для примера)
  const f = Math.floor(x);
  const frac = x - f;
  if (Math.abs(frac - 0.5) > 1e-9) return Math.round(x);
  if (mode === "HALF_UP") return f + 1;
  return f % 2 === 0 ? f : f + 1;
}

/** Распределение суммы на n частей без потери копеек (метод наибольшего остатка). */
function allocate(totalCents: number, n: number) {
  const base = Math.floor(totalCents / n);
  const rest = totalCents - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rest ? 1 : 0));
}

export function MoneyLab() {
  const [tab, setTab] = useState<"float" | "round" | "split">("float");
  const [n, setN] = useState(10);
  const [total, setTotal] = useState(10000);
  const [parts, setParts] = useState(3);
  const d = sumDouble(n);
  const naiveParts = Array.from({ length: parts }, () => Math.round(total / parts));
  const fair = allocate(total, parts);
  const halves = useMemo(() => Array.from({ length: 10 }, (_, i) => i + 0.5 + 100), []);
  const sumExact = halves.reduce((a, b) => a + b, 0);
  const sumUp = halves.reduce((a, b) => a + roundCents(b, "HALF_UP"), 0);
  const sumEven = halves.reduce((a, b) => a + roundCents(b, "HALF_EVEN"), 0);
  const fmt = (c: number) => (c / 100).toFixed(2);

  return (
    <Frame title="Деньги в коде" hint="три ловушки">
      <Segmented
        size="sm"
        value={tab}
        onChange={setTab}
        options={[
          { value: "float", label: "double" },
          { value: "round", label: "Округление" },
          { value: "split", label: "Деление на части" },
        ]}
      />
      {tab === "float" && (
        <div className="mt-4">
          <Slider label="Сложить 0.10 столько раз" value={n} min={1} max={1000} onChange={setN} />
          <div className="mt-3 grid gap-2 font-mono text-[13px]">
            <div className="rounded-xl bg-raised/60 px-3 py-2">
              <span className="text-mute">double:</span> <span className={d.toString() === (n / 10).toString() ? "text-ink" : "text-bad"}>{d.toString()}</span>
            </div>
            <div className="rounded-xl bg-raised/60 px-3 py-2">
              <span className="text-mute">long копейки / BigDecimal:</span> <span className="text-ok">{(n * 10 / 100).toFixed(2)}</span>
            </div>
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
            0.1 в двоичной системе — бесконечная дробь, как 1/3 в десятичной. double хранит ближайшее приближение, и ошибка копится. Для денег — <span className="font-mono text-ink">BigDecimal</span> или целые минорные единицы (тиыны, центы) в <span className="font-mono text-ink">long</span>.
          </p>
        </div>
      )}
      {tab === "round" && (
        <div className="mt-4">
          <p className="text-[13.5px] leading-relaxed text-dim">
            Десять сумм, у каждой ровно полтиына: 100.5, 101.5, …, 109.5 тиына. Округляем каждую до целой копейки и складываем.
          </p>
          <Metrics className="mt-3">
            <Metric label="точная сумма" value={sumExact} />
            <Metric label="HALF_UP (как в школе)" value={sumUp} tone="bad" />
            <Metric label="HALF_EVEN (банковское)" value={sumEven} tone="ok" />
          </Metrics>
          <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
            «Половина — вверх» всегда округляет 0.5 в одну сторону: на миллионах операций это систематический перекос в пользу кого-то. Банковское округление (к чётному) отправляет половинки то вверх, то вниз — ошибки взаимно гасятся. В Java: <span className="font-mono text-ink">RoundingMode.HALF_EVEN</span>. Но правило округления часто задаёт регулятор или договор — его надо уточнять, а не выбирать.
          </p>
        </div>
      )}
      {tab === "split" && (
        <div className="mt-4">
          <Slider label="Сумма, тиынов" value={total} min={100} max={100000} step={1} onChange={setTotal} display={`${fmt(total)} ₸`} />
          <div className="mt-2">
            <Slider label="На сколько частей (рассрочка, сплит счёта)" value={parts} min={2} max={7} onChange={setParts} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <Caption>каждую часть округлили отдельно</Caption>
              <div className="flex flex-wrap gap-1.5 font-mono text-[12.5px]">
                {naiveParts.map((p, i) => (
                  <span key={i} className="rounded-lg bg-raised px-2 py-1 text-dim">{fmt(p)}</span>
                ))}
              </div>
              <div className={cx("mt-2 font-mono text-[12.5px]", naiveParts.reduce((a, b) => a + b, 0) === total ? "text-ok" : "text-bad")}>
                Σ = {fmt(naiveParts.reduce((a, b) => a + b, 0))} {naiveParts.reduce((a, b) => a + b, 0) === total ? "✓" : `≠ ${fmt(total)}`}
              </div>
            </div>
            <div>
              <Caption>распределение остатка</Caption>
              <div className="flex flex-wrap gap-1.5 font-mono text-[12.5px]">
                {fair.map((p, i) => (
                  <span key={i} className={cx("rounded-lg px-2 py-1", p > fair[fair.length - 1] ? "bg-accent/15 text-ink" : "bg-raised text-dim")}>{fmt(p)}</span>
                ))}
              </div>
              <div className="mt-2 font-mono text-[12.5px] text-ok">Σ = {fmt(fair.reduce((a, b) => a + b, 0))} ✓</div>
            </div>
          </div>
          <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
            Деньги не должны появляться и исчезать. Делим нацело, а остаток копеек раздаём по одной первым частям. Так сумма частей всегда равна целому — это проверяет и аудитор, и сверка.
          </p>
        </div>
      )}
    </Frame>
  );
}

// ── Двойная запись ─────────────────────────────────────────────────

type AccId = "cash" | "alice" | "bob" | "fees" | "merchant";
const ACC: Record<AccId, { name: string; kind: "актив" | "обязательство" | "доход" }> = {
  cash: { name: "Деньги банка на корсчёте", kind: "актив" },
  alice: { name: "Кошелёк Алии", kind: "обязательство" },
  bob: { name: "Кошелёк Бахыта", kind: "обязательство" },
  merchant: { name: "Счёт магазина", kind: "обязательство" },
  fees: { name: "Комиссионный доход", kind: "доход" },
};
type Posting = { acc: AccId; amount: number }; // + дебет, − кредит
type Entry = { title: string; lines: Posting[] };

const OPS: { id: string; label: string; entry: Entry }[] = [
  { id: "topup", label: "Алия пополнила кошелёк на 10 000", entry: { title: "Пополнение картой", lines: [{ acc: "cash", amount: 10000 }, { acc: "alice", amount: -10000 }] } },
  { id: "p2p", label: "Алия → Бахыт 3 000, комиссия 30", entry: { title: "Перевод с комиссией", lines: [{ acc: "alice", amount: 3030 }, { acc: "bob", amount: -3000 }, { acc: "fees", amount: -30 }] } },
  { id: "buy", label: "Бахыт платит магазину 2 000", entry: { title: "Оплата покупки", lines: [{ acc: "bob", amount: 2000 }, { acc: "merchant", amount: -2000 }] } },
  { id: "refund", label: "Магазин возвращает Бахыту 500", entry: { title: "Возврат", lines: [{ acc: "merchant", amount: 500 }, { acc: "bob", amount: -500 }] } },
  { id: "payout", label: "Вывод магазину на карту 1 500", entry: { title: "Выплата", lines: [{ acc: "merchant", amount: 1500 }, { acc: "cash", amount: -1500 }] } },
];

export function LedgerSim() {
  const [journal, setJournal] = useState<Entry[]>([]);
  const [broken, setBroken] = useState(false);
  const balances = useMemo(() => {
    const b: Record<AccId, number> = { cash: 0, alice: 0, bob: 0, merchant: 0, fees: 0 };
    for (const e of journal) for (const l of e.lines) b[l.acc] += l.amount;
    return b;
  }, [journal]);
  const total = Object.values(balances).reduce((a, x) => a + x, 0);
  const add = (e: Entry) => setJournal((j) => [...j, broken ? { ...e, title: e.title + " (баг: одна сторона)", lines: e.lines.slice(0, 1) } : e]);
  const fmtAmt = (x: number) => (x === 0 ? "0" : x.toLocaleString("ru"));

  return (
    <Frame title="Леджер с двойной записью" hint="дебет + кредит = 0 в каждой проводке">
      <div className="flex flex-wrap gap-1.5">
        {OPS.map((o) => (
          <button key={o.id} type="button" onClick={() => add(o.entry)} className="h-8 rounded-lg border border-line px-2.5 text-[12.5px] text-dim hover:border-line-strong hover:text-ink">
            {o.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
        <Toggle checked={broken} onChange={setBroken} label="баг: записывать только одну сторону" />
        <button type="button" onClick={() => setJournal([])} className="text-mute hover:text-ink">очистить</button>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <Caption>балансы счетов (дебетовое сальдо +)</Caption>
          <div className="grid gap-1">
            {(Object.keys(ACC) as AccId[]).map((a) => (
              <div key={a} className="flex items-center justify-between gap-2 rounded-lg bg-raised/60 px-3 py-1.5 text-[13px]">
                <span className="min-w-0 truncate text-dim">
                  {ACC[a].name} <span className="text-[11px] text-mute">· {ACC[a].kind}</span>
                </span>
                <span className={cx("font-mono", balances[a] === 0 ? "text-mute" : balances[a] > 0 ? "text-blue" : "text-violet")}>{fmtAmt(balances[a])}</span>
              </div>
            ))}
            <div className={cx("mt-1 flex justify-between rounded-lg px-3 py-1.5 font-mono text-[13px]", total === 0 ? "bg-ok/10 text-ok" : "bg-bad/10 text-bad")}>
              <span>сумма всех счетов</span>
              <span>{fmtAmt(total)} {total === 0 ? "✓" : "— деньги из воздуха!"}</span>
            </div>
          </div>
        </div>
        <div className="min-w-0">
          <Caption>журнал проводок</Caption>
          <div className="max-h-[260px] overflow-y-auto rounded-xl border border-line">
            {journal.length === 0 && <div className="p-3 text-[13px] text-mute">Нажми на операцию — появится проводка.</div>}
            {journal.map((e, i) => {
              const sum = e.lines.reduce((a, l) => a + l.amount, 0);
              return (
                <div key={i} className={cx("border-b border-line p-2.5 last:border-0", sum !== 0 && "bg-bad/[0.06]")}>
                  <div className="text-[12.5px] font-medium text-ink">{i + 1}. {e.title}</div>
                  {e.lines.map((l, k) => (
                    <div key={k} className="flex justify-between font-mono text-[11.5px]">
                      <span className="text-dim">{l.amount > 0 ? "Дт" : "Кт"} {ACC[l.acc].name}</span>
                      <span className={l.amount > 0 ? "text-blue" : "text-violet"}>{fmtAmt(Math.abs(l.amount))}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[13px] leading-relaxed text-dim">
        Каждая операция — проводка, где дебет равен кредиту, поэтому сумма всех счетов всегда 0. Баланс не хранится, а <b className="text-ink">считается</b> из проводок. Включи баг — и леджер сразу покажет, что деньги появились из ниоткуда.
      </p>
    </Frame>
  );
}

// ── Жизнь карточного платежа ───────────────────────────────────────

type PState = "new" | "authorized" | "captured" | "settled" | "voided" | "refunded" | "charged_back" | "declined";
const P_STEPS: Record<PState, { label: string; next: { to: PState; label: string }[]; text: string; card: { avail: number; held: number }; merchant: number }> = {
  new: { label: "Новый", next: [{ to: "authorized", label: "Авторизовать" }, { to: "declined", label: "Банк отказал" }], text: "Покупатель ввёл карту на сайте отеля, сумма 50 000 ₸. Деньги ещё нигде не двигались.", card: { avail: 200000, held: 0 }, merchant: 0 },
  declined: { label: "Отказ", next: [], text: "Банк-эмитент отказал: нет денег, лимит, подозрение на мошенничество. Ничего не списано.", card: { avail: 200000, held: 0 }, merchant: 0 },
  authorized: { label: "Авторизован", next: [{ to: "captured", label: "Списать (capture)" }, { to: "voided", label: "Отменить (void)" }], text: "Эмитент проверил карту и заблокировал (захолдировал) сумму. Деньги ещё у покупателя, но тратить их он не может. Холд живёт ограниченное время, обычно до нескольких дней.", card: { avail: 150000, held: 50000 }, merchant: 0 },
  voided: { label: "Отменён", next: [], text: "Магазин отменил авторизацию до списания — холд снят. В выписке покупателя операция исчезнет, комиссий почти нет.", card: { avail: 200000, held: 0 }, merchant: 0 },
  captured: { label: "Списан", next: [{ to: "settled", label: "Клиринг и расчёт" }], text: "Магазин подтвердил списание (например, после заселения в отель). Сумма может быть меньше авторизованной. Операция уходит в клиринг.", card: { avail: 150000, held: 50000 }, merchant: 0 },
  settled: { label: "Рассчитан", next: [{ to: "refunded", label: "Возврат" }, { to: "charged_back", label: "Чарджбэк" }], text: "Клиринг: платёжная система сверила операции эквайера и эмитента. Расчёт: эмитент перевёл деньги эквайеру, эквайер — магазину за вычетом комиссии (обычно через 1–3 дня).", card: { avail: 150000, held: 0 }, merchant: 48750 },
  refunded: { label: "Возвращён", next: [], text: "Магазин сам вернул деньги — это новая операция в обратную сторону, а не отмена старой. Комиссию за исходную операцию эквайер обычно не возвращает.", card: { avail: 200000, held: 0 }, merchant: -1250 },
  charged_back: { label: "Чарджбэк", next: [], text: "Покупатель оспорил платёж через свой банк («не получил услугу», «это не я»). Деньги принудительно забирают у магазина, плюс штраф. Магазин может оспорить — нужны доказательства.", card: { avail: 200000, held: 0 }, merchant: -1250 - 5000 },
};

export function PaymentFlow() {
  const [path, setPath] = useState<PState[]>(["new"]);
  const s = path[path.length - 1];
  const st = P_STEPS[s];
  const fmt = (x: number) => `${x.toLocaleString("ru")} ₸`;
  return (
    <Frame title="Жизнь карточного платежа" hint="кто держит деньги на каждом шаге">
      <div className="flex flex-wrap items-center gap-1 font-mono text-[11.5px]">
        {path.map((p, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <span className="text-mute">→</span>}
            <span className={cx("rounded-md px-2 py-0.5", i === path.length - 1 ? "bg-accent/20 text-ink" : "bg-raised text-dim")}>{P_STEPS[p].label}</span>
          </span>
        ))}
      </div>
      <p className="mt-3 min-h-[66px] text-[13.5px] leading-relaxed text-dim">{st.text}</p>
      <Metrics className="mt-2">
        <Metric label="доступно на карте" value={fmt(st.card.avail)} />
        <Metric label="захолдировано" value={fmt(st.card.held)} tone={st.card.held ? "amber" : undefined} />
        <Metric label="магазин получил" value={fmt(st.merchant)} tone={st.merchant > 0 ? "ok" : st.merchant < 0 ? "bad" : undefined} />
      </Metrics>
      <div className="mt-4 flex flex-wrap gap-2">
        {st.next.map((n) => (
          <button key={n.to} type="button" onClick={() => setPath([...path, n.to])} className="h-9 rounded-xl bg-accent px-3.5 text-[13px] font-semibold text-accent-ink">
            {n.label}
          </button>
        ))}
        {path.length > 1 && (
          <button type="button" onClick={() => setPath(["new"])} className="h-9 rounded-xl border border-line px-3 text-[13px] text-dim hover:text-ink">
            Сначала
          </button>
        )}
      </div>
      <p className="mt-3 text-[12px] text-mute">Комиссия эквайринга в примере — 2.5%; штраф за чарджбэк — условный.</p>
    </Frame>
  );
}

// ── Идемпотентность: таймаут и повтор ──────────────────────────────

export function IdempotencySim() {
  const [withKey, setWithKey] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [charges, setCharges] = useState(0);
  const [store, setStore] = useState<Record<string, string>>({});
  const key = "a1f3-…-9c2e";

  const attempt = (n: number, cur: number, st: Record<string, string>, lines: string[]) => {
    lines.push(`→ POST /payments  ${withKey ? `Idempotency-Key: ${key}` : "(без ключа)"}  попытка ${n}`);
    if (withKey && st[key]) {
      lines.push(`  сервер: ключ уже есть → вернуть сохранённый ответ «${st[key]}», не списывать`);
      return { cur, st };
    }
    cur += 1;
    lines.push(`  сервер: списал 10 000 ₸ (платёж #${cur})`);
    if (withKey) st = { ...st, [key]: `оплачено, платёж #${cur}` };
    return { cur, st };
  };

  const run = () => {
    const lines: string[] = [];
    let { cur, st } = { cur: 0, st: {} as Record<string, string> };
    ({ cur, st } = attempt(1, cur, st, lines));
    lines.push("  ✗ ответ потерялся: таймаут сети. Клиент не знает, прошло ли списание");
    lines.push("  клиент ждёт 1 с и повторяет запрос");
    ({ cur, st } = attempt(2, cur, st, lines));
    lines.push("  ✓ ответ дошёл");
    setLog(lines);
    setCharges(cur);
    setStore(st);
  };

  return (
    <Frame title="Таймаут, повтор и двойное списание" hint="клиент не знает, дошёл ли запрос">
      <Segmented
        size="sm"
        value={withKey ? "key" : "nokey"}
        onChange={(v) => {
          setWithKey(v === "key");
          setLog([]);
          setCharges(0);
          setStore({});
        }}
        options={[
          { value: "nokey", label: "Без ключа" },
          { value: "key", label: "С ключом идемпотентности" },
        ]}
      />
      <button type="button" onClick={run} className="mt-3 h-9 rounded-xl bg-accent px-4 text-[13px] font-semibold text-accent-ink">
        Оплатить 10 000 ₸
      </button>
      {log.length > 0 && (
        <>
          <pre className="anim-fade mt-3 overflow-x-auto rounded-xl border border-line bg-bg p-3 font-mono text-[12px] leading-relaxed text-dim">{log.join("\n")}</pre>
          <Metrics className="mt-3">
            <Metric label="списаний" value={charges} tone={charges === 1 ? "ok" : "bad"} />
            <Metric label="списано с клиента" value={`${(charges * 10000).toLocaleString("ru")} ₸`} tone={charges === 1 ? "ok" : "bad"} />
          </Metrics>
          {withKey && Object.keys(store).length > 0 && (
            <p className="mt-2 font-mono text-[12px] text-mute">idempotency_keys: {key} → «{store[key]}»</p>
          )}
          <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
            {charges > 1
              ? "Первый запрос дошёл и списал деньги — потерялся только ответ. Повтор без ключа сервер считает новым платежом. Клиент заплатил дважды."
              : "Сервер запомнил ключ вместе с результатом. Повтор с тем же ключом получает тот же ответ, а деньги списываются ровно один раз."}
          </p>
        </>
      )}
    </Frame>
  );
}

// ── Сверка ─────────────────────────────────────────────────────────

type Row = { ref: string; amount: number; date: string };
const OURS: Row[] = [
  { ref: "PAY-101", amount: 15000, date: "03.03" },
  { ref: "PAY-102", amount: 7200, date: "03.03" },
  { ref: "PAY-103", amount: 12500, date: "03.03" },
  { ref: "PAY-104", amount: 3300, date: "03.03" },
  { ref: "PAY-105", amount: 9900, date: "03.03" },
];
const BANK: Row[] = [
  { ref: "PAY-101", amount: 15000, date: "03.03" },
  { ref: "PAY-103", amount: 12350, date: "03.03" },
  { ref: "PAY-104", amount: 3300, date: "04.03" },
  { ref: "PAY-105", amount: 9900, date: "03.03" },
  { ref: "PAY-105", amount: 9900, date: "03.03" },
  { ref: "PAY-198", amount: 4000, date: "03.03" },
];

type Verdict = { ref: string; kind: "ok" | "amount" | "date" | "missing_bank" | "missing_ours" | "dup"; text: string };

function reconcile(): Verdict[] {
  const out: Verdict[] = [];
  const bankLeft = [...BANK];
  for (const o of OURS) {
    const i = bankLeft.findIndex((b) => b.ref === o.ref);
    if (i < 0) {
      out.push({ ref: o.ref, kind: "missing_bank", text: "есть у нас, нет у банка: платёж не дошёл или придёт завтра" });
      continue;
    }
    const b = bankLeft.splice(i, 1)[0];
    if (b.amount !== o.amount) out.push({ ref: o.ref, kind: "amount", text: `суммы расходятся: у нас ${o.amount}, у банка ${b.amount} — разница ${o.amount - b.amount} (комиссия? частичный capture?)` });
    else if (b.date !== o.date) out.push({ ref: o.ref, kind: "date", text: `совпало, но банк провёл ${b.date} вместо ${o.date} — граница суток, это нормально` });
    else out.push({ ref: o.ref, kind: "ok", text: "совпало" });
  }
  for (const b of bankLeft) {
    if (OURS.some((o) => o.ref === b.ref)) out.push({ ref: b.ref, kind: "dup", text: "банк провёл операцию второй раз — дубль, нужен возврат" });
    else out.push({ ref: b.ref, kind: "missing_ours", text: "есть у банка, нет у нас: потерянный колбэк или чужой платёж" });
  }
  return out;
}

const VCOLOR: Record<Verdict["kind"], string> = {
  ok: C.ok,
  date: C.blue,
  amount: C.amber,
  missing_bank: C.amber,
  missing_ours: C.bad,
  dup: C.bad,
};

export function ReconcileDiff() {
  const all = useMemo(reconcile, []);
  const [n, setN] = useState(0);
  const shown = all.slice(0, n);
  const issues = shown.filter((v) => v.kind !== "ok" && v.kind !== "date").length;
  return (
    <Frame title="Сверка с банком за 3 марта" hint="наш леджер против выписки">
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["наш леджер", OURS],
          ["выписка банка", BANK],
        ].map(([title, rows]) => (
          <div key={title as string}>
            <Caption>{title as string}</Caption>
            <div className="rounded-xl border border-line font-mono text-[12px]">
              {(rows as Row[]).map((r, i) => (
                <div key={i} className="flex justify-between border-b border-line px-2.5 py-1 last:border-0 text-dim">
                  <span>{r.ref}</span>
                  <span>{r.amount.toLocaleString("ru")}</span>
                  <span className="text-mute">{r.date}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2 whitespace-nowrap">
        <button type="button" onClick={() => setN((v) => Math.min(all.length, v + 1))} disabled={n >= all.length} className="h-9 rounded-xl bg-accent px-4 text-[13px] font-semibold text-accent-ink disabled:opacity-40">
          Сверить строку
        </button>
        <button type="button" onClick={() => setN(all.length)} className="h-9 rounded-xl border border-line px-3 text-[13px] text-dim hover:text-ink">
          Всё сразу
        </button>
        <button type="button" onClick={() => setN(0)} className="h-9 rounded-xl px-3 text-[13px] text-mute hover:text-ink">
          Заново
        </button>
      </div>
      <Log
        className="mt-3"
        max={10}
        lines={shown.map((v, i) => (
          <span key={i}>
            <span style={{ color: VCOLOR[v.kind] }}>{v.ref}</span> — {v.text}
          </span>
        ))}
        empty="Сопоставляем по референсу платежа, потом сравниваем сумму и дату."
      />
      {n >= all.length && (
        <p className="anim-fade mt-3 text-[13.5px] leading-relaxed text-dim">
          Расхождений, требующих разбора: <span className="font-mono text-bad">{issues}</span>. Каждое уходит в очередь на ручной разбор или автоматическое правило. Сверку делают каждый день — и разницу ищут, пока она не станет нулём.
        </p>
      )}
    </Frame>
  );
}
