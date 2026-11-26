import { Plus, Search, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "../ui/Button";
import { Input, Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Legend, Log, Metric, Metrics, useHistory } from "./kit";

// Хеш-таблица двумя способами: цепочки (как HashMap в Java) и открытая адресация
// с линейным пробированием (как dict в Python, только там пробирование хитрее).
// Хеш — String.hashCode из Java, индекс — h & (m − 1), m — степень двойки.

type Mode = "chain" | "probe";
const TOMB = "†"; // надгробие после удаления в открытой адресации

function hashCode(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}
const spread = (h: number) => (h ^ (h >>> 16)) >>> 0; // как HashMap.hash(): подмешать старшие биты

interface T {
  mode: Mode;
  m: number;
  chains: string[][];
  slots: (string | null)[];
  size: number;
  tombs: number;
  log: string[];
  probe: number[];
  hit: number | null;
  hk?: string;
}

const KEYS = ["temir", "dana", "arman", "java", "kotlin", "rust", "redis", "aigerim", "saule", "go", "pg", "marat", "olga", "kafka", "erlan", "zig", "spring", "nginx"];

function empty(mode: Mode, m = 8): T {
  return { mode, m, chains: Array.from({ length: m }, () => []), slots: Array(m).fill(null), size: 0, tombs: 0, log: [], probe: [], hit: null };
}
const idx = (k: string, m: number) => spread(hashCode(k)) & (m - 1);
const keysOf = (t: T) => (t.mode === "chain" ? t.chains.flat() : (t.slots.filter((s) => s && s !== TOMB) as string[]));

function rawInsert(t: T, k: string): { probe: number[]; at: number; existed: boolean } {
  const i = idx(k, t.m);
  if (t.mode === "chain") {
    const existed = t.chains[i].includes(k);
    if (!existed) {
      t.chains[i].push(k);
      t.size++;
    }
    return { probe: [i], at: i, existed };
  }
  const probe: number[] = [];
  let firstTomb = -1;
  for (let j = 0; j < t.m; j++) {
    const p = (i + j) & (t.m - 1);
    probe.push(p);
    const s = t.slots[p];
    if (s === k) return { probe, at: p, existed: true };
    if (s === TOMB && firstTomb < 0) firstTomb = p;
    if (s === null) {
      const at = firstTomb >= 0 ? firstTomb : p;
      if (firstTomb >= 0) t.tombs--;
      t.slots[at] = k;
      t.size++;
      return { probe, at, existed: false };
    }
  }
  const at = firstTomb;
  t.slots[at] = k;
  t.tombs--;
  t.size++;
  return { probe, at, existed: false };
}

function rehash(t: T, m: number): T {
  const n = empty(t.mode, m);
  for (const k of keysOf(t)) rawInsert(n, k);
  return { ...n, log: t.log };
}

function insert(t0: T, k: string, autoResize: boolean): T {
  let t: T = structuredClone(t0);
  if (t.mode === "probe" && t.size + t.tombs + 1 > t.m - 1 && !autoResize) {
    t.log.push(`INSERT '${k}': таблица заполнена — без resize открытая адресация встаёт`);
    return t;
  }
  const r = rawInsert(t, k);
  const h = spread(hashCode(k));
  t.probe = r.probe;
  t.hit = r.at;
  t.hk = k;
  const coll = t.mode === "chain" ? t.chains[r.at].length > 1 : r.probe.length > 1;
  t.log.push(
    `put '${k}': hash = ${h} → & ${t.m - 1} = ${r.probe[0]}` +
      (r.existed ? " · ключ уже есть, обновляем значение" : t.mode === "chain" ? (coll ? ` · коллизия, цепочка длиной ${t.chains[r.at].length}` : "") : coll ? ` · занято, пробирую → ${r.probe.slice(1).join(" → ")}` : ""),
  );
  const lf = (t.size + (t.mode === "probe" ? t.tombs : 0)) / t.m;
  if (autoResize && lf > 0.75) {
    const m = t.m * 2;
    t = rehash(t, m);
    t.log.push(`load factor ${lf.toFixed(2)} > 0.75 → resize до ${m}: все ${t.size} ключей переразложены заново, O(n)`);
    t.probe = [];
    t.hit = null;
  }
  return t;
}

function lookup(t0: T, k: string, del: boolean): T {
  const t: T = structuredClone(t0);
  t.hk = k;
  const i = idx(k, t.m);
  if (t.mode === "chain") {
    const pos = t.chains[i].indexOf(k);
    t.probe = [i];
    t.hit = pos >= 0 ? i : null;
    if (del && pos >= 0) {
      t.chains[i].splice(pos, 1);
      t.size--;
    }
    t.log.push(`${del ? "remove" : "get"} '${k}': бакет ${i}, сравнений в цепочке ${pos >= 0 ? pos + 1 : t.chains[i].length} → ${pos >= 0 ? (del ? "удалён" : "найден") : "нет"}`);
    return t;
  }
  const probe: number[] = [];
  for (let j = 0; j < t.m; j++) {
    const p = (i + j) & (t.m - 1);
    probe.push(p);
    const s = t.slots[p];
    if (s === null) break;
    if (s === k) {
      t.probe = probe;
      t.hit = p;
      if (del) {
        t.slots[p] = TOMB;
        t.size--;
        t.tombs++;
      }
      t.log.push(`${del ? "remove" : "get"} '${k}': проб ${probe.length} (${probe.join(" → ")}) → ${del ? "на месте ключа надгробие †: иначе поиск ключей дальше по цепочке оборвался бы здесь" : "найден"}`);
      return t;
    }
  }
  t.probe = probe;
  t.hit = null;
  t.log.push(`${del ? "remove" : "get"} '${k}': проб ${probe.length} (${probe.join(" → ")}) → дошли до пустой ячейки, ключа нет`);
  return t;
}

export function HashTableViz() {
  const [mode, setMode] = useState<Mode>("chain");
  const init = useCallback((): T => {
    let t = empty("chain");
    for (const k of KEYS.slice(0, 5)) t = insert(t, k, true);
    return { ...t, log: ["5 ключей уже вставлено"], probe: [], hit: null };
  }, []);
  const { cur: t, push, reset } = useHistory(init);
  const [autoResize, setAutoResize] = useState(true);
  const [key, setKey] = useState("kafka");
  const nextKey = KEYS.find((k) => !keysOf(t).includes(k)) ?? `k${t.size}`;
  const lf = t.size / t.m;
  const longest = t.mode === "chain" ? Math.max(0, ...t.chains.map((c) => c.length)) : 0;

  const switchMode = (m: Mode) => {
    setMode(m);
    let n = empty(m);
    for (const k of KEYS.slice(0, 5)) n = insert(n, k, true);
    reset({ ...n, log: [m === "chain" ? "цепочки: в бакете — связный список" : "открытая адресация: один ключ на ячейку, при коллизии — следующая свободная"], probe: [], hit: null });
  };

  return (
    <Frame
      title="Хеш-таблица изнутри"
      hint="hash(key) & (m − 1)"
      controls={
        <div className="grid gap-3">
          <Segmented<Mode>
            value={mode}
            onChange={switchMode}
            block
            options={[
              { value: "chain", label: "Цепочки" },
              { value: "probe", label: "Пробирование" },
            ]}
          />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => push(insert(t, nextKey, autoResize))} className="col-span-2 sm:col-span-1">
              put &apos;{nextKey}&apos;
            </Button>
            <Input value={key} onChange={(e) => setKey(e.target.value.trim().slice(0, 12))} className="col-span-2 h-10 sm:w-32" aria-label="Ключ" />
            <Button icon={<Plus className="size-4" />} onClick={() => key && push(insert(t, key, autoResize))}>
              put
            </Button>
            <Button icon={<Search className="size-4" />} onClick={() => key && push(lookup(t, key, false))}>
              get
            </Button>
            <Button icon={<Trash2 className="size-4" />} onClick={() => key && push(lookup(t, key, true))}>
              remove
            </Button>
            <Button onClick={() => switchMode(mode)}>Сначала</Button>
          </div>
          <Toggle checked={autoResize} onChange={setAutoResize} label="Resize при load factor > 0.75" />
        </div>
      }
    >
      <Metrics>
        <Metric label="ключей / бакетов" value={`${t.size} / ${t.m}`} />
        <Metric label="load factor" value={lf.toFixed(2)} tone={lf > 0.75 ? "bad" : undefined} />
        <Metric label={t.mode === "chain" ? "самая длинная цепочка" : "надгробий"} value={t.mode === "chain" ? longest : t.tombs} tone={(t.mode === "chain" ? longest : t.tombs) > 2 ? "amber" : undefined} />
        <Metric label="последняя операция" value={`${t.probe.length} проб`} />
      </Metrics>
      <div className="mt-4 grid gap-1">
        {Array.from({ length: t.m }, (_, i) => {
          const inProbe = t.probe.includes(i);
          const isHit = t.hit === i;
          const order = t.probe.indexOf(i);
          return (
            <div key={i} className="flex min-h-8 items-center gap-2">
              <div className={cx("w-7 shrink-0 text-right font-mono text-[11.5px]", inProbe ? "text-amber" : "text-mute")}>{i}</div>
              {t.mode === "chain" ? (
                <div className={cx("flex min-h-8 flex-1 flex-wrap items-center gap-1 rounded-lg border px-1.5 py-1", inProbe ? "border-amber/50 bg-amber/[0.05]" : "border-line")}>
                  {t.chains[i].length === 0 && <span className="px-1 font-mono text-[11px] text-mute">null</span>}
                  {t.chains[i].map((k, j) => (
                    <span key={k} className="flex items-center gap-1">
                      {j > 0 && <span className="text-[11px] text-blue">→</span>}
                      <span className={cx("rounded-md border px-1.5 py-0.5 font-mono text-[12px]", isHit && k === t.hk ? "border-accent bg-accent/15 text-accent" : "border-line-strong bg-raised text-ink")}>{k}</span>
                    </span>
                  ))}
                </div>
              ) : (
                <div
                  className={cx(
                    "flex min-h-8 flex-1 items-center justify-between rounded-lg border px-2.5 py-1 font-mono text-[12px]",
                    isHit ? "border-accent bg-accent/12 text-accent" : inProbe ? "border-amber/50 bg-amber/[0.05] text-ink" : "border-line",
                    t.slots[i] === null ? "text-mute" : t.slots[i] === TOMB ? "text-rose" : "text-ink",
                  )}
                >
                  <span>{t.slots[i] === null ? "пусто" : t.slots[i] === TOMB ? "† надгробие" : t.slots[i]}</span>
                  {t.slots[i] && t.slots[i] !== TOMB && <span className="text-[10.5px] text-mute">дом {idx(t.slots[i]!, t.m)}</span>}
                  {order >= 0 && <span className="text-[10.5px] text-amber">проба {order + 1}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Legend className="mt-3" items={[{ color: C.amber, label: "куда смотрели" }, { color: C.accent, label: "нашли / положили" }, { color: C.rose, label: "надгробие" }]} />
      <Log className="mt-3" lines={t.log} max={3} />
    </Frame>
  );
}
