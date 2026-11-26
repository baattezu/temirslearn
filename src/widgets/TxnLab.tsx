import { Check, Hourglass, Play, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useIsPhone } from "../lib/hooks";
import { Chip } from "../ui/Chip";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { Caption, StepControls, usePlayer } from "./kit";

// Мини-движок MVCC в духе PostgreSQL: версии строк с xmin/xmax, снимки (xmin, xmax, xip),
// READ COMMITTED — снимок на каждый оператор, REPEATABLE READ — один на транзакцию,
// UPDATE ждёт незакоммиченного соседа; в RC перечитывает свежую версию, в RR падает
// с ошибкой сериализации. SERIALIZABLE — упрощённый SSI: опасная пара rw-зависимостей → abort.

type Sess = "A" | "B";
type Level = "rc" | "rr" | "ser";
type Op =
  | { t: "begin" }
  | { t: "read"; keys: string[]; sql: string; sum?: boolean }
  | { t: "set"; key: string; sql: string; from: "read" | "row" | "const"; d: number }
  | { t: "commit" };
interface Step {
  s: Sess;
  op: Op;
}
interface Ver {
  key: string;
  val: number;
  xmin: number;
  xmax: number | null;
}
interface Snap {
  xmin: number;
  xmax: number;
  xip: number[];
}
interface Txn {
  xid: number;
  snap: Snap | null;
  reads: string[];
  writes: string[];
  vars: Record<string, number>;
  failed: string | null;
}
type Result = { kind: "ok" | "wait" | "err" | "skip"; text: string };
interface St {
  vers: Ver[];
  clog: Record<number, "active" | "committed" | "aborted">;
  nextXid: number;
  txn: Partial<Record<Sess, Txn>>;
  pc: number;
  waiting: { s: Sess; idx: number; on: number } | null;
  results: Record<number, Result>;
  order: number[]; // в каком порядке реально выполнялись шаги (ожидание сдвигает)
}

interface Scenario {
  id: string;
  title: string;
  blurb: string;
  init: Record<string, number>;
  steps: Step[];
  fmt?: (k: string, v: number) => string;
  verdict: (final: Record<string, number>, st: St) => { ok: boolean; text: string };
}

const S = (s: Sess, op: Op): Step => ({ s, op });

export const SCENARIOS: Record<string, Scenario> = {
  nonrepeatable: {
    id: "nonrepeatable",
    title: "Неповторяющееся чтение",
    blurb: "A читает баланс дважды, а между чтениями B снимает 30 и коммитит.",
    init: { balance: 100 },
    steps: [
      S("A", { t: "begin" }),
      S("A", { t: "read", keys: ["balance"], sql: "SELECT balance" }),
      S("B", { t: "begin" }),
      S("B", { t: "set", key: "balance", sql: "UPDATE … SET balance = balance - 30", from: "row", d: -30 }),
      S("B", { t: "commit" }),
      S("A", { t: "read", keys: ["balance"], sql: "SELECT balance" }),
      S("A", { t: "commit" }),
    ],
    verdict: (_f, st) => {
      const reads = Object.entries(st.results).filter(([i]) => SCENARIOS.nonrepeatable.steps[+i].s === "A" && SCENARIOS.nonrepeatable.steps[+i].op.t === "read").map(([, r]) => r.text);
      return reads[0] !== reads[1]
        ? { ok: false, text: `Неповторяющееся чтение: A в одной транзакции увидела ${reads[0]}, потом ${reads[1]}.` }
        : { ok: true, text: `A оба раза видит ${reads[0]}: снимок взят один раз на всю транзакцию.` };
    },
  },
  lost: {
    id: "lost",
    title: "Потерянное обновление",
    blurb: "Оба читают счётчик лайков, считают +1 в приложении и пишут результат.",
    init: { likes: 100 },
    steps: [
      S("A", { t: "begin" }),
      S("B", { t: "begin" }),
      S("A", { t: "read", keys: ["likes"], sql: "SELECT likes" }),
      S("B", { t: "read", keys: ["likes"], sql: "SELECT likes" }),
      S("A", { t: "set", key: "likes", sql: "UPDATE … SET likes = :прочитал + 1", from: "read", d: 1 }),
      S("A", { t: "commit" }),
      S("B", { t: "set", key: "likes", sql: "UPDATE … SET likes = :прочитал + 1", from: "read", d: 1 }),
      S("B", { t: "commit" }),
    ],
    verdict: (f, st) =>
      st.txn.B?.failed
        ? { ok: true, text: "B получила ошибку сериализации. Лайк не потерян — приложение должно повторить транзакцию B." }
        : f.likes === 102
          ? { ok: true, text: "Счётчик 102 — оба лайка на месте." }
          : { ok: false, text: `Потерянное обновление: два лайка, а счётчик ${f.likes}. B перезаписала результат A.` },
  },
  atomic: {
    id: "atomic",
    title: "Два UPDATE одной строки",
    blurb: "Атомарный UPDATE likes = likes + 1 из двух транзакций одновременно.",
    init: { likes: 100 },
    steps: [
      S("A", { t: "begin" }),
      S("B", { t: "begin" }),
      S("A", { t: "read", keys: ["likes"], sql: "SELECT likes" }),
      S("B", { t: "read", keys: ["likes"], sql: "SELECT likes" }),
      S("A", { t: "set", key: "likes", sql: "UPDATE … SET likes = likes + 1", from: "row", d: 1 }),
      S("B", { t: "set", key: "likes", sql: "UPDATE … SET likes = likes + 1", from: "row", d: 1 }),
      S("A", { t: "commit" }),
      S("B", { t: "commit" }),
    ],
    verdict: (f, st) =>
      st.txn.B?.failed
        ? { ok: true, text: "B дождалась A и упала: в REPEATABLE READ и выше строку, изменённую после твоего снимка, обновлять нельзя. Нужен повтор." }
        : { ok: f.likes === 102, text: `B ждала блокировку строки, после COMMIT A перечитала свежую версию (101) и записала ${f.likes}.` },
  },
  skew: {
    id: "skew",
    title: "Write skew: дежурные врачи",
    blurb: "Правило: хотя бы один врач на смене. Оба проверяют, что дежурных двое, и каждый уходит.",
    init: { alice: 1, bob: 1 },
    fmt: (_k, v) => (v ? "на смене" : "ушёл"),
    steps: [
      S("A", { t: "begin" }),
      S("B", { t: "begin" }),
      S("A", { t: "read", keys: ["alice", "bob"], sql: "SELECT count(*) WHERE on_call", sum: true }),
      S("B", { t: "read", keys: ["alice", "bob"], sql: "SELECT count(*) WHERE on_call", sum: true }),
      S("A", { t: "set", key: "alice", sql: "UPDATE … SET on_call = false WHERE name = 'alice'", from: "const", d: 0 }),
      S("B", { t: "set", key: "bob", sql: "UPDATE … SET on_call = false WHERE name = 'bob'", from: "const", d: 0 }),
      S("A", { t: "commit" }),
      S("B", { t: "commit" }),
    ],
    verdict: (f) =>
      f.alice + f.bob === 0
        ? { ok: false, text: "Write skew: каждая транзакция по отдельности корректна, вместе — на смене 0 врачей. Строки разные, поэтому блокировок не было." }
        : { ok: true, text: `SSI заметил опасный цикл зависимостей и откатил B. На смене ${f.alice + f.bob}.` },
  },
};

const BASE_XID = 700;

function init(sc: Scenario): St {
  return {
    vers: Object.entries(sc.init).map(([key, val]) => ({ key, val, xmin: 1, xmax: null })),
    clog: { 1: "committed" },
    nextXid: BASE_XID,
    txn: {},
    pc: 0,
    waiting: null,
    results: {},
    order: [],
  };
}

const takeSnap = (st: St, me: number): Snap => {
  const active = Object.entries(st.clog)
    .filter(([x, s]) => s === "active" && +x !== me)
    .map(([x]) => +x);
  return { xmin: Math.min(st.nextXid, ...active, me), xmax: st.nextXid, xip: active };
};
const inProgress = (snap: Snap, x: number) => x >= snap.xmax || snap.xip.includes(x);

function visible(v: Ver, snap: Snap, me: number | null, clog: St["clog"]) {
  const created = v.xmin === me || (clog[v.xmin] === "committed" && !inProgress(snap, v.xmin));
  if (!created) return false;
  if (v.xmax === null) return true;
  if (v.xmax === me) return false;
  if (clog[v.xmax] === "aborted") return true;
  if (clog[v.xmax] === "committed" && !inProgress(snap, v.xmax)) return false;
  return true;
}

function stmtSnap(st: St, t: Txn, level: Level) {
  if (level === "rc") return takeSnap(st, t.xid);
  t.snap ??= takeSnap(st, t.xid);
  return t.snap;
}

const latest = (st: St, key: string) => [...st.vers].reverse().find((v) => v.key === key && st.clog[v.xmin] !== "aborted")!;

function exec(st: St, sc: Scenario, idx: number, level: Level): Result {
  const { s, op } = sc.steps[idx];
  const fmt = (k: string, v: number) => (sc.fmt ? sc.fmt(k, v) : String(v));
  const t = st.txn[s];
  if (op.t === "begin") {
    const xid = st.nextXid++;
    st.clog[xid] = "active";
    st.txn[s] = { xid, snap: null, reads: [], writes: [], vars: {}, failed: null };
    return { kind: "ok", text: `xid ${xid}` };
  }
  if (!t) return { kind: "skip", text: "нет транзакции" };
  if (t.failed) {
    if (op.t === "commit") return { kind: "err", text: "ROLLBACK (транзакция уже прервана)" };
    return { kind: "skip", text: "ERROR: current transaction is aborted" };
  }
  if (op.t === "read") {
    const snap = stmtSnap(st, t, level);
    const vals = op.keys.map((k) => st.vers.find((v) => v.key === k && visible(v, snap, t.xid, st.clog))!.val);
    op.keys.forEach((k, i) => {
      t.vars[k] = vals[i];
      if (!t.reads.includes(k)) t.reads.push(k);
    });
    return { kind: "ok", text: op.sum ? `count = ${vals.reduce((a, b) => a + b, 0)}` : op.keys.map((k, i) => fmt(k, vals[i])).join(", ") };
  }
  if (op.t === "set") {
    const snap = stmtSnap(st, t, level);
    let target = st.vers.find((v) => v.key === op.key && visible(v, snap, t.xid, st.clog));
    if (!target) return { kind: "ok", text: "UPDATE 0" };
    if (target.xmax !== null && target.xmax !== t.xid) {
      const who = st.clog[target.xmax];
      if (who === "active") return { kind: "wait", text: `ждёт COMMIT/ROLLBACK xid ${target.xmax} (блокировка строки)` };
      if (who === "committed") {
        if (level !== "rc") {
          fail(st, t, "could not serialize access due to concurrent update");
          return { kind: "err", text: "ERROR: could not serialize access due to concurrent update" };
        }
        // READ COMMITTED: EvalPlanQual — берём свежую версию строки и пересчитываем
        target = latest(st, op.key);
        if (target.xmax !== null && st.clog[target.xmax] === "active" && target.xmax !== t.xid)
          return { kind: "wait", text: `ждёт xid ${target.xmax}` };
      }
    }
    const base = op.from === "read" ? (t.vars[op.key] ?? target.val) : op.from === "row" ? target.val : 0;
    const val = op.from === "const" ? op.d : base + op.d;
    target.xmax = t.xid;
    st.vers.push({ key: op.key, val, xmin: t.xid, xmax: null });
    if (!t.writes.includes(op.key)) t.writes.push(op.key);
    return { kind: "ok", text: `UPDATE 1 → ${fmt(op.key, val)}${op.from === "row" && target.val !== (t.vars[op.key] ?? target.val) ? ` (от свежей версии ${target.val})` : ""}` };
  }
  // commit
  if (level === "ser") {
    const other = st.txn[s === "A" ? "B" : "A"];
    // проверяем только против уже закоммиченного соседа: первый коммит проходит, второй откатывается
    if (other && st.clog[other.xid] === "committed") {
      const rwIn = t.reads.some((k) => other.writes.includes(k));
      const rwOut = other.reads.some((k) => t.writes.includes(k));
      if (rwIn && rwOut) {
        fail(st, t, "read/write dependencies");
        return { kind: "err", text: "ERROR: could not serialize access due to read/write dependencies among transactions" };
      }
    }
  }
  st.clog[t.xid] = "committed";
  return { kind: "ok", text: "COMMIT" };
}

function fail(st: St, t: Txn, why: string) {
  t.failed = why;
  st.clog[t.xid] = "aborted";
}

function advance(st0: St, sc: Scenario, level: Level): St {
  const st: St = structuredClone(st0);
  if (st.pc >= sc.steps.length) return st;
  const idx = st.pc;
  const step = sc.steps[idx];
  st.pc++;
  // сессия, которая ждёт, не может выполнять следующие шаги — они встают в очередь за ней
  if (st.waiting && st.waiting.s === step.s) {
    st.results[idx] = { kind: "wait", text: "сессия занята ожиданием" };
    return st;
  }
  const r = exec(st, sc, idx, level);
  st.results[idx] = r;
  st.order.push(idx);
  if (r.kind === "wait") {
    const on = +(r.text.match(/xid (\d+)/)?.[1] ?? 0);
    st.waiting = { s: step.s, idx, on };
  }
  // разблокировка: тот, кого ждали, завершился → повторяем ожидавший оператор
  if (st.waiting && st.waiting.idx !== idx && st.clog[st.waiting.on] !== "active") {
    const w = st.waiting;
    st.waiting = null;
    const rr = exec(st, sc, w.idx, level);
    st.results[w.idx] = { ...rr, text: `дождалась → ${rr.text}` };
    st.order.push(w.idx);
    // шаги этой сессии, отложенные на время ожидания, выполняем сейчас по порядку
    for (let j = w.idx + 1; j < st.pc; j++) {
      if (sc.steps[j].s === w.s && st.results[j]?.text === "сессия занята ожиданием") {
        const r2 = exec(st, sc, j, level);
        st.results[j] = r2;
        st.order.push(j);
      }
    }
  }
  return st;
}

function finalValues(st: St, sc: Scenario) {
  const out: Record<string, number> = {};
  for (const k of Object.keys(sc.init)) {
    const v = [...st.vers].reverse().find((x) => x.key === k && st.clog[x.xmin] === "committed");
    out[k] = v!.val;
  }
  return out;
}

export function TxnLab({ scenarios = ["nonrepeatable", "lost", "atomic", "skew"], level: initialLevel = "rc" }: { scenarios?: string[]; level?: Level }) {
  const phone = useIsPhone();
  const [scId, setScId] = useState(scenarios[0]);
  const [level, setLevel] = useState<Level>(initialLevel);
  const sc = SCENARIOS[scId];
  const [st, setSt] = useState(() => init(sc));
  const restart = (id = scId) => setSt(init(SCENARIOS[id]));
  const done = st.pc >= sc.steps.length;
  const player = usePlayer(() => {
    if (st.pc >= sc.steps.length) return false;
    setSt(advance(st, sc, level));
    return st.pc + 1 < sc.steps.length;
  }, 900);

  const verdict = useMemo(() => (done ? sc.verdict(finalValues(st, sc), st) : null), [done, st, sc]);
  const fmt = (k: string, v: number) => (sc.fmt ? sc.fmt(k, v) : String(v));
  const viewOf = (s: Sess) => {
    const t = st.txn[s];
    if (!t || st.clog[t.xid] !== "active") return null;
    return { snap: level === "rc" ? takeSnap(st, t.xid) : (t.snap ?? takeSnap(st, t.xid)), me: t.xid, taken: level === "rc" || !!t.snap };
  };
  const views = { A: viewOf("A"), B: viewOf("B") };

  return (
    <Frame
      title="Лаборатория транзакций"
      hint="две сессии, один движок MVCC"
      controls={
        <div className="grid gap-3">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
            {scenarios.map((id) => (
              <Chip
                key={id}
                active={id === scId}
                onClick={() => {
                  player.stop();
                  setScId(id);
                  restart(id);
                }}
              >
                {SCENARIOS[id].title}
              </Chip>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
            <Segmented<Level>
              value={level}
              onChange={(l) => {
                player.stop();
                setLevel(l);
                restart();
              }}
              block
              options={[
                { value: "rc", label: phone ? "READ COMM." : "READ COMMITTED" },
                { value: "rr", label: phone ? "REP. READ" : "REPEATABLE READ" },
                { value: "ser", label: phone ? "SERIALIZ." : "SERIALIZABLE" },
              ]}
              className="[&_button]:px-1.5 [&_button]:text-[12px] sm:[&_button]:text-[13px]"
            />
            <StepControls
              onStep={() => setSt((p) => advance(p, sc, level))}
              onReset={() => {
                player.stop();
                restart();
              }}
              canStep={!done}
              player={player}
            />
          </div>
        </div>
      }
    >
      <p className="mb-3 text-[14px] text-dim">{sc.blurb}</p>
      <div className="overflow-hidden rounded-xl border border-line">
        <div className="grid grid-cols-2 border-b border-line bg-bg/50 font-mono text-[11.5px] text-mute">
          {(["A", "B"] as Sess[]).map((s) => (
            <div key={s} className={cx("px-3 py-2", s === "B" && "border-l border-line")}>
              Сессия {s}
              {st.txn[s] && <span className="ml-1.5 text-dim">· xid {st.txn[s]!.xid}</span>}
              {st.txn[s] && (
                <span className={cx("ml-1.5", st.clog[st.txn[s]!.xid] === "committed" ? "text-ok" : st.clog[st.txn[s]!.xid] === "aborted" ? "text-bad" : "text-amber")}>
                  {st.clog[st.txn[s]!.xid] === "committed" ? "закоммичена" : st.clog[st.txn[s]!.xid] === "aborted" ? "откачена" : "активна"}
                </span>
              )}
            </div>
          ))}
        </div>
        {sc.steps.map((step, i) => {
          const r = st.results[i];
          const isNext = i === st.pc;
          const waitingNow = st.waiting?.idx === i;
          const label = step.op.t === "begin" ? "BEGIN" : step.op.t === "commit" ? "COMMIT" : step.op.sql;
          const cell = (
            <div className={cx("min-w-0 px-3 py-2", isNext && "bg-accent/[0.06]")}>
              <div className={cx("flex items-start gap-1.5 font-mono text-[12px] leading-5", r ? "text-ink" : isNext ? "text-ink" : "text-mute")}>
                <span className="mt-0.5 shrink-0">
                  {isNext ? (
                    <Play className="size-3 text-accent" fill="currentColor" />
                  ) : waitingNow || r?.kind === "wait" ? (
                    <Hourglass className="size-3 text-amber" />
                  ) : r?.kind === "err" ? (
                    <X className="size-3 text-bad" />
                  ) : r ? (
                    <Check className="size-3 text-ok" />
                  ) : (
                    <span className="inline-block size-3" />
                  )}
                </span>
                <span className="break-words">{label}</span>
              </div>
              {r && (
                <div
                  className={cx(
                    "ml-[18px] mt-0.5 break-words font-mono text-[11.5px] leading-5",
                    r.kind === "err" ? "text-bad" : r.kind === "wait" ? "text-amber" : r.kind === "skip" ? "text-mute" : "text-accent",
                  )}
                >
                  {r.text}
                </div>
              )}
            </div>
          );
          return (
            <div key={i} className="grid grid-cols-2 border-b border-line/60 last:border-b-0">
              {step.s === "A" ? cell : <div className={cx(isNext && "bg-accent/[0.03]")} />}
              <div className="border-l border-line">{step.s === "B" ? cell : <div className={cx("h-full", isNext && "bg-accent/[0.03]")} />}</div>
            </div>
          );
        })}
      </div>

      {verdict && (
        <div className={cx("anim-fade mt-3 rounded-xl border px-3.5 py-2.5 text-[13.5px] leading-relaxed", verdict.ok ? "border-ok/40 bg-ok/10 text-ok" : "border-bad/40 bg-bad/10 text-bad")}>
          {verdict.text}
        </div>
      )}

      <div className="mt-4">
        <Caption>Версии строк в куче</Caption>
        <div className="overflow-x-auto rounded-xl border border-line">
          <table className="w-full font-mono text-[12px]">
            <thead className="bg-bg/50 text-mute">
              <tr>
                {["строка", "значение", "xmin", "xmax", "видит A", "видит B"].map((h) => (
                  <th key={h} className="whitespace-nowrap px-2.5 py-1.5 text-left font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {st.vers.map((v, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-2.5 py-1 text-dim">{v.key}</td>
                  <td className="px-2.5 py-1 text-ink">{fmt(v.key, v.val)}</td>
                  <td className="px-2.5 py-1"><Xid x={v.xmin} st={st} /></td>
                  <td className="px-2.5 py-1">{v.xmax === null ? <span className="text-mute">—</span> : <Xid x={v.xmax} st={st} />}</td>
                  {(["A", "B"] as Sess[]).map((s) => {
                    const w = views[s];
                    return (
                      <td key={s} className="px-2.5 py-1">
                        {w ? visible(v, w.snap, w.me, st.clog) ? <span className="text-accent">●</span> : <span className="text-mute">○</span> : <span className="text-mute">·</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 grid gap-1 font-mono text-[11px] text-mute sm:grid-cols-2">
          {(["A", "B"] as Sess[]).map((s) => {
            const w = views[s];
            return (
              <div key={s}>
                снимок {s}:{" "}
                {w ? (
                  <span className="text-dim">
                    {w.taken ? "" : "(будет взят) "}xmin={w.snap.xmin} xmax={w.snap.xmax} xip=[{w.snap.xip.join(",")}]
                  </span>
                ) : (
                  "нет активной транзакции"
                )}
              </div>
            );
          })}
        </div>
      </div>
    </Frame>
  );
}

function Xid({ x, st }: { x: number; st: St }) {
  const s = st.clog[x];
  return <span className={s === "committed" ? "text-ok" : s === "aborted" ? "text-bad line-through" : "text-amber"}>{x === 1 ? "1" : x}</span>;
}
