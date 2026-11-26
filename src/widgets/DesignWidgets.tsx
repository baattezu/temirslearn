import { Plus, Minus, Send, Zap } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Slider, Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Legend, Log, Metric, Metrics, rng } from "./kit";

const fmt = (n: number, unit = "") => {
  const a = Math.abs(n);
  const s = a >= 1e12 ? `${+(n / 1e12).toPrecision(3)} T` : a >= 1e9 ? `${+(n / 1e9).toPrecision(3)} G` : a >= 1e6 ? `${+(n / 1e6).toPrecision(3)} M` : a >= 1e3 ? `${+(n / 1e3).toPrecision(3)} K` : `${+n.toPrecision(3)} `;
  return s + unit;
};
const bytes = (b: number) => (b >= 1e15 ? `${+(b / 1e15).toPrecision(3)} ПБ` : b >= 1e12 ? `${+(b / 1e12).toPrecision(3)} ТБ` : b >= 1e9 ? `${+(b / 1e9).toPrecision(3)} ГБ` : b >= 1e6 ? `${+(b / 1e6).toPrecision(3)} МБ` : `${+(b / 1e3).toPrecision(3)} КБ`);

// ══ Оценка нагрузки «на салфетке» ═══════════════════════════

export function CapacityCalc() {
  const [dauExp, setDauExp] = useState(7); // 10M
  const [reads, setReads] = useState(20);
  const [ratio, setRatio] = useState(10);
  const [size, setSize] = useState(1);
  const [peak, setPeak] = useState(3);
  const dau = 10 ** dauExp;
  const writesPerUser = reads / ratio;
  const readQps = (dau * reads) / 86400;
  const writeQps = (dau * writesPerUser) / 86400;
  const storageYear = dau * writesPerUser * size * 1024 * 365;
  const egress = readQps * peak * size * 1024 * 8;
  const servers = Math.ceil((readQps + writeQps) * peak / 5000);
  return (
    <Frame title="Оценка нагрузки на салфетке" hint="1 день ≈ 10⁵ секунд">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Пользователей в день (DAU)" value={dauExp} min={4} max={9} step={0.5} onChange={setDauExp} display={fmt(dau)} />
        <Slider label="Чтений на пользователя в день" value={reads} min={1} max={200} onChange={setReads} />
        <Slider label="Чтений на одну запись" value={ratio} min={1} max={100} onChange={setRatio} display={`${ratio} : 1`} />
        <Slider label="Размер записи" value={size} min={0.25} max={500} step={0.25} onChange={setSize} display={size >= 1 ? `${size} КБ` : `${size * 1024} Б`} />
        <Slider label="Пик / среднее" value={peak} min={1} max={10} onChange={setPeak} display={`×${peak}`} />
      </div>
      <Metrics className="mt-5">
        <Metric label="чтений/с (пик)" value={fmt(readQps * peak)} tone="accent" />
        <Metric label="записей/с (пик)" value={fmt(writeQps * peak)} />
        <Metric label="данных за год" value={bytes(storageYear)} tone={storageYear > 1e14 ? "amber" : undefined} />
        <Metric label="исходящий трафик" value={`${fmt(egress, "бит/с")}`} />
      </Metrics>
      <div className="mt-3 rounded-xl border border-line bg-bg/40 p-3 text-[13.5px] leading-relaxed text-dim">
        {writeQps * peak > 10_000 ? (
          <>Записей больше 10K/с — один Postgres-мастер на пределе: нужно шардирование или лог-ориентированное хранилище (Kafka → Cassandra/ClickHouse).</>
        ) : (
          <>Записи влезают в один хорошо настроенный Postgres (единицы тысяч/с). Чтения — реплики и кэш.</>
        )}{" "}
        Stateless-серверов при ~5K запросов/с на сервер: <b className="font-mono text-ink">~{servers}</b>.{" "}
        {storageYear > 1e13 ? "Данные за год не влезут на один узел — думай о партиционировании и холодном хранилище (S3)." : "Данные за год помещаются на один узел с запасом."}
      </div>
    </Frame>
  );
}

// ══ Кэш: hit ratio от размера и перекоса ═════════════════════

function zipfSampler(n: number, s: number, r: () => number) {
  const w = Array.from({ length: n }, (_, i) => 1 / (i + 1) ** s);
  const total = w.reduce((a, b) => a + b, 0);
  const cdf: number[] = [];
  let acc = 0;
  for (const x of w) cdf.push((acc += x / total));
  return () => {
    const u = r();
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (cdf[m] < u) lo = m + 1;
      else hi = m;
    }
    return lo;
  };
}

function lruHit(sample: number[], cap: number) {
  const m = new Map<number, true>();
  let hit = 0;
  for (const k of sample) {
    if (m.has(k)) {
      hit++;
      m.delete(k);
    } else if (m.size >= cap) m.delete(m.keys().next().value!);
    m.set(k, true);
  }
  return hit / sample.length;
}

export function CacheCurve() {
  const [skew, setSkew] = useState(1.0);
  const [pct, setPct] = useState(5);
  const N = 2000;
  const sample = useMemo(() => {
    const next = zipfSampler(N, skew, rng(17));
    return Array.from({ length: 60000 }, next);
  }, [skew]);
  const curve = useMemo(() => [0.5, 1, 2, 5, 10, 20, 40, 70, 100].map((p) => ({ p, h: lruHit(sample, Math.max(1, Math.round((p / 100) * N))) })), [sample]);
  const cur = useMemo(() => lruHit(sample, Math.max(1, Math.round((pct / 100) * N))), [sample, pct]);
  const W = 560;
  const H = 170;
  const X = (p: number) => (Math.log10(p / 0.5) / Math.log10(200)) * W;
  const dbLoad = 1 - cur;
  return (
    <Frame title="Сколько даёт кэш" hint={`${N} ключей, LRU, распределение Ципфа`}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Перекос популярности (s)" value={skew} min={0.4} max={1.4} step={0.1} onChange={setSkew} display={skew.toFixed(1)} />
        <Slider label="Размер кэша, % ключей" value={pct} min={0.5} max={100} step={0.5} onChange={setPct} display={`${pct}%`} />
      </div>
      <svg viewBox={`-34 -8 ${W + 44} ${H + 30}`} className="mt-4 block w-full">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={0} x2={W} y1={H - v * H} y2={H - v * H} stroke={C.line} />
            <text x={-6} y={H - v * H + 3} textAnchor="end" fontSize={10} fill={C.mute} fontFamily="var(--font-mono)">
              {v * 100}%
            </text>
          </g>
        ))}
        <polyline points={curve.map((c) => `${X(c.p)},${H - c.h * H}`).join(" ")} fill="none" stroke={C.accent} strokeWidth={2.2} />
        <circle cx={X(pct)} cy={H - cur * H} r={5} fill={C.amber} />
        {[1, 10, 100].map((p) => (
          <text key={p} x={X(p)} y={H + 16} textAnchor="middle" fontSize={10} fill={C.mute} fontFamily="var(--font-mono)">
            {p}%
          </text>
        ))}
      </svg>
      <Metrics className="mt-3">
        <Metric label="hit ratio" value={`${(cur * 100).toFixed(1)}%`} tone="accent" />
        <Metric label="до базы доходит" value={`${(dbLoad * 100).toFixed(1)}%`} />
        <Metric label="разгрузка базы" value={`×${(1 / Math.max(0.001, dbLoad)).toFixed(1)}`} tone="ok" />
        <Metric label="кэш" value={`${Math.round((pct / 100) * N)} ключей`} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Кривая растёт логарифмически: каждое удвоение кэша добавляет примерно одинаковый прирост, а не удваивает hit ratio. Чем сильнее перекос, тем больше даёт маленький кэш — подвинь s к 1.3. И помни: 90% против 99% — это разница в нагрузке на базу в 10 раз.
      </p>
    </Frame>
  );
}

// ══ Cache stampede ══════════════════════════════════════════

export function Stampede() {
  const [mode, setMode] = useState<"naive" | "lock" | "early">("naive");
  const [n, setN] = useState(40);
  // запросы приходят равномерно; в момент 0 ключ протух; запрос в базу занимает 200 мс
  const reqs = useMemo(() => {
    const r = rng(3);
    return Array.from({ length: n }, () => r() * 400).sort((a, b) => a - b);
  }, [n]);
  const DB = 200;
  const events = reqs.map((t) => {
    if (mode === "early") return { t, kind: "hit" as const };
    if (mode === "naive") return { t, kind: t < DB ? ("db" as const) : ("hit" as const) };
    return { t, kind: t === reqs[0] ? ("db" as const) : t < reqs[0] + DB ? ("wait" as const) : ("hit" as const) };
  });
  const dbCalls = mode === "early" ? 1 : events.filter((e) => e.kind === "db").length;
  const W = 560;
  return (
    <Frame title="Cache stampede: ключ протух под нагрузкой" hint="запрос в базу — 200 мс">
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr] sm:items-end">
        <Segmented
          value={mode}
          onChange={setMode}
          block
          options={[
            { value: "naive", label: "Наивно" },
            { value: "lock", label: "Singleflight" },
            { value: "early", label: "Раннее обновление" },
          ]}
        />
        <Slider label="Запросов за 400 мс" value={n} min={5} max={120} onChange={setN} />
      </div>
      <svg viewBox={`0 0 ${W} 110`} className="mt-4 block w-full">
        <rect x={0} y={8} width={(DB / 400) * W} height={18} rx={4} fill="color-mix(in oklab, var(--color-rose) 20%, transparent)" />
        <text x={6} y={21} fontSize={10.5} fill={C.rose} fontFamily="var(--font-mono)">
          {mode === "early" ? "фоновое обновление до истечения TTL" : "ключа нет в кэше, значение считается 200 мс"}
        </text>
        {events.map((e, i) => (
          <rect key={i} x={(e.t / 400) * W - 2} y={40 + (i % 6) * 10} width={4} height={8} rx={1} fill={e.kind === "db" ? C.bad : e.kind === "wait" ? C.amber : C.ok} />
        ))}
        <line x1={0} x2={W} y1={104} y2={104} stroke={C.line} />
      </svg>
      <Legend className="mt-1" items={[{ color: C.bad, label: "пошёл в базу" }, { color: C.amber, label: "ждёт чужой результат" }, { color: C.ok, label: "попадание" }]} />
      <Metrics className="mt-3">
        <Metric label="запросов в базу" value={dbCalls} tone={dbCalls > 3 ? "bad" : "ok"} />
        <Metric label="всего запросов" value={n} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {mode === "naive"
          ? `Каждый запрос в первые 200 мс видит пустой кэш и сам идёт в базу: ${dbCalls} одинаковых тяжёлых запросов разом. На горячем ключе так кладут базу.`
          : mode === "lock"
            ? "Первый промах берёт блокировку (или общий future — singleflight), остальные ждут его результат. В базу — ровно один запрос."
            : "Значение обновляется в фоне чуть раньше истечения TTL (или вероятностно — XFetch). Пользователи вообще не видят промаха."}
      </p>
    </Frame>
  );
}

// ══ Kafka: партиции, ключи, consumer group ═══════════════════

const KEYS = ["user-1", "user-2", "user-3", "order-7", "order-9", "cart-4"];
const kHash = (s: string) => {
  let h = 7;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
};

interface Msg {
  key: string;
  n: number;
}
export function KafkaViz() {
  const [parts, setParts] = useState(3);
  const [consumers, setConsumers] = useState(2);
  const [logs, setLogs] = useState<Msg[][]>(() => Array.from({ length: 6 }, () => []));
  const [committed, setCommitted] = useState<number[]>(() => Array(6).fill(0));
  const [processed, setProcessed] = useState<number[]>(() => Array(6).fill(0));
  const [seq, setSeq] = useState(1);
  const [log, setLog] = useState<string[]>([]);
  const [crashBeforeCommit, setCrash] = useState(false);

  const owner = (p: number) => (p % Math.max(1, consumers));
  const produce = () => {
    const key = KEYS[seq % KEYS.length];
    const p = kHash(key) % parts;
    setLogs((l) => l.map((x, i) => (i === p ? [...x, { key, n: seq }] : x)));
    setLog((x) => [...x, `produce key=${key} → hash % ${parts} = партиция ${p}, offset ${logs[p].length}`]);
    setSeq(seq + 1);
  };
  const consume = () => {
    const out: string[] = [];
    const np = [...processed];
    const nc = [...committed];
    for (let p = 0; p < parts; p++) {
      if (owner(p) >= consumers) continue;
      if (np[p] < logs[p].length) {
        const m = logs[p][np[p]];
        np[p]++;
        out.push(`C${owner(p)} обработал P${p}@${np[p] - 1} (${m.key} #${m.n})`);
        if (!crashBeforeCommit) nc[p] = np[p];
      }
    }
    setProcessed(np);
    setCommitted(nc);
    setLog((x) => [...x, ...(out.length ? out : ["нечего читать"]), ...(crashBeforeCommit && out.length ? ["…offset ещё не закоммичен"] : [])]);
  };
  const crash = () => {
    const dup = processed.slice(0, parts).reduce((a, v, p) => a + (v - committed[p]), 0);
    setProcessed([...committed]);
    setLog((x) => [...x, `консьюмер упал и перезапустился: читаем с закоммиченных offset'ов → ${dup} сообщений будут обработаны ПОВТОРНО (at-least-once)`]);
  };
  const reset = () => {
    setLogs(Array.from({ length: 6 }, () => []));
    setCommitted(Array(6).fill(0));
    setProcessed(Array(6).fill(0));
    setSeq(1);
    setLog([]);
  };
  const keyColor = (k: string) => [C.accent, C.blue, C.amber, C.violet, C.teal, C.rose][KEYS.indexOf(k)];

  return (
    <Frame
      title="Kafka: партиции и consumer group"
      hint="порядок — только внутри партиции"
      controls={
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="primary" icon={<Send className="size-4" />} onClick={produce}>
              produce
            </Button>
            <Button onClick={consume}>poll + обработать</Button>
            <Button variant="danger" icon={<Zap className="size-4" />} onClick={crash}>
              падение консьюмера
            </Button>
            <Button onClick={reset}>Сначала</Button>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <div className="flex items-center gap-2 text-[13px] text-dim">
              партиций
              <Button size="sm" icon={<Minus className="size-3.5" />} onClick={() => { setParts(Math.max(1, parts - 1)); reset(); }} aria-label="меньше" />
              <span className="w-4 text-center font-mono text-ink">{parts}</span>
              <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => { setParts(Math.min(6, parts + 1)); reset(); }} aria-label="больше" />
            </div>
            <div className="flex items-center gap-2 text-[13px] text-dim">
              консьюмеров
              <Button size="sm" icon={<Minus className="size-3.5" />} onClick={() => setConsumers(Math.max(1, consumers - 1))} aria-label="меньше" />
              <span className="w-4 text-center font-mono text-ink">{consumers}</span>
              <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setConsumers(Math.min(6, consumers + 1))} aria-label="больше" />
            </div>
            <Toggle checked={crashBeforeCommit} onChange={setCrash} label="Коммитить offset позже" />
          </div>
        </div>
      }
    >
      <div className="grid gap-2">
        {Array.from({ length: parts }, (_, p) => (
          <div key={p} className="grid grid-cols-[42px_1fr_64px] items-center gap-2">
            <span className="font-mono text-[12px] text-dim">P{p}</span>
            <div className="flex min-h-9 items-center gap-1 overflow-x-auto rounded-lg border border-line bg-bg/40 px-1.5 py-1 scrollbar-none">
              {logs[p].length === 0 && <span className="font-mono text-[11px] text-mute">пусто</span>}
              {logs[p].map((m, i) => (
                <span
                  key={i}
                  title={`${m.key} #${m.n}`}
                  className={cx("flex h-6 min-w-6 shrink-0 items-center justify-center rounded px-1 font-mono text-[10px] text-bg", i < processed[p] ? "opacity-40" : "")}
                  style={{ background: keyColor(m.key), outline: i === committed[p] - 1 ? "2px solid var(--color-ink)" : undefined }}
                >
                  {m.n}
                </span>
              ))}
            </div>
            <span className={cx("rounded-md px-1.5 py-1 text-center font-mono text-[11px]", "bg-blue/10 text-blue")}>C{owner(p)}</span>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {Array.from({ length: consumers }, (_, c) => {
          const mine = Array.from({ length: parts }, (_, p) => p).filter((p) => owner(p) === c);
          return (
            <span key={c} className={cx("rounded-md border px-2 py-0.5 font-mono text-[11.5px]", mine.length ? "border-blue/40 text-ink" : "border-dashed border-line text-mute")}>
              C{c}: {mine.length ? mine.map((p) => `P${p}`).join(", ") : "простаивает"}
            </span>
          );
        })}
      </div>
      <Legend className="mt-3" items={KEYS.map((k) => ({ color: keyColor(k), label: k }))} />
      <Caption className="mt-3">Бледные — обработаны; в рамке — последний закоммиченный offset</Caption>
      <Log lines={log} max={4} empty="produce кладёт сообщение в партицию по хешу ключа. Сообщения одного ключа всегда в одной партиции — и только там порядок гарантирован." />
    </Frame>
  );
}

// ══ Консистентное хеширование ═════════════════════════════════

const h32 = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
  // финальное перемешивание — иначе соседние строки дают соседние хеши
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  return h >>> 0;
};
const NODE_COLORS = [C.accent, C.blue, C.amber, C.violet, C.teal, C.rose, "#9cc744", "#e79bff"];

export function HashRing() {
  const [nodes, setNodes] = useState(4);
  const [vnodes, setVnodes] = useState(1);
  const [scheme, setScheme] = useState<"ring" | "mod">("ring");
  const keys = useMemo(() => Array.from({ length: 60 }, (_, i) => `key:${i}`), []);
  const ringPoints = (n: number) =>
    Array.from({ length: n }, (_, k) => Array.from({ length: vnodes }, (_, v) => ({ node: k, pos: h32(`node-${k}#${v}`) / 2 ** 32 }))).flat().sort((a, b) => a.pos - b.pos);
  const assign = (n: number) => {
    if (scheme === "mod") return keys.map((k) => h32(k) % n);
    const pts = ringPoints(n);
    return keys.map((k) => {
      const p = h32(k) / 2 ** 32;
      return (pts.find((x) => x.pos >= p) ?? pts[0]).node;
    });
  };
  const now = assign(nodes);
  const before = assign(Math.max(1, nodes - 1));
  const moved = now.filter((v, i) => v !== before[i]).length;
  const load = Array.from({ length: nodes }, (_, k) => now.filter((x) => x === k).length);
  const pts = ringPoints(nodes);
  const R = 92;
  const cx0 = 120;
  const cy0 = 115;
  const P = (pos: number, r = R) => [cx0 + r * Math.cos(pos * 2 * Math.PI - Math.PI / 2), cy0 + r * Math.sin(pos * 2 * Math.PI - Math.PI / 2)] as const;
  return (
    <Frame
      title="Шардирование: hash % N против кольца"
      hint="60 ключей"
      controls={
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
          <Segmented
            value={scheme}
            onChange={setScheme}
            block
            options={[
              { value: "mod", label: "hash % N" },
              { value: "ring", label: "Консистентное кольцо" },
            ]}
          />
          <div className="flex items-center gap-2 text-[13px] text-dim">
            узлов
            <Button size="sm" icon={<Minus className="size-3.5" />} onClick={() => setNodes(Math.max(2, nodes - 1))} aria-label="меньше" />
            <span className="w-4 text-center font-mono text-ink">{nodes}</span>
            <Button size="sm" icon={<Plus className="size-3.5" />} onClick={() => setNodes(Math.min(8, nodes + 1))} aria-label="больше" />
          </div>
          {scheme === "ring" && (
            <div className="sm:col-span-2">
              <Slider label="Виртуальных узлов на сервер" value={vnodes} min={1} max={64} onChange={setVnodes} />
            </div>
          )}
        </div>
      }
    >
      <div className="grid items-center gap-4 md:grid-cols-[240px_1fr]">
        <svg viewBox="0 0 240 230" className="mx-auto block w-full max-w-[260px]">
          <circle cx={cx0} cy={cy0} r={R} fill="none" stroke={C.lineStrong} />
          {scheme === "ring"
            ? pts.map((p, i) => {
                const [x, y] = P(p.pos);
                return <circle key={i} cx={x} cy={y} r={vnodes > 8 ? 2.5 : 6} fill={NODE_COLORS[p.node]} stroke={C.bg} />;
              })
            : null}
          {keys.map((k, i) => {
            const [x, y] = P(h32(k) / 2 ** 32, R - 14);
            const movedNow = now[i] !== before[i];
            return <circle key={k} cx={x} cy={y} r={movedNow ? 3.4 : 2.4} fill={NODE_COLORS[now[i]]} stroke={movedNow ? C.ink : "none"} strokeWidth={1} opacity={0.9} />;
          })}
          <text x={cx0} y={cy0 - 4} textAnchor="middle" fontSize={11} fill={C.dim} fontFamily="var(--font-mono)">
            {scheme === "ring" ? "кольцо 2³²" : "hash % " + nodes}
          </text>
          <text x={cx0} y={cy0 + 12} textAnchor="middle" fontSize={10} fill={C.mute} fontFamily="var(--font-mono)">
            ключ → ближайший узел ↻
          </text>
        </svg>
        <div>
          <Metrics className="sm:grid-cols-2">
            <Metric label={`переехало при ${nodes - 1}→${nodes}`} value={`${moved} / ${keys.length}`} tone={moved > keys.length / 2 ? "bad" : "ok"} />
            <Metric label="идеально" value={`${Math.round(keys.length / nodes)}`} />
          </Metrics>
          <Caption className="mt-3">Нагрузка по узлам</Caption>
          <div className="grid gap-1">
            {load.map((l, k) => (
              <div key={k} className="flex items-center gap-2">
                <span className="w-7 font-mono text-[11px] text-dim">N{k}</span>
                <div className="h-3.5 flex-1 overflow-hidden rounded bg-raised">
                  <div className="h-full rounded" style={{ width: `${(l / keys.length) * 100 * 2.5}%`, background: NODE_COLORS[k], maxWidth: "100%" }} />
                </div>
                <span className="w-6 text-right font-mono text-[11px] text-dim">{l}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {scheme === "mod"
          ? `hash % N: при добавлении одного узла переезжает ${Math.round((moved / keys.length) * 100)}% ключей — почти все. Для кэша это означает холодный старт, для БД — перенос всех данных.`
          : `Кольцо: при добавлении узла переезжают только ключи на его дуге — ~1/N. ${vnodes < 8 ? "Но с одной точкой на сервер нагрузка неравномерна — добавь виртуальные узлы." : "Виртуальные узлы выравнивают нагрузку."}`}
      </p>
    </Frame>
  );
}
