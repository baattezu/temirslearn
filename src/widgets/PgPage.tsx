import { Eraser, PenLine, Plus, Sparkles, Trash2, Undo2 } from "lucide-react";
import { useCallback, useState } from "react";
import { useIsPhone } from "../lib/hooks";
import { Button } from "../ui/Button";
import { Toggle } from "../ui/Field";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Legend, Log, Metric, Metrics, rng, useHistory } from "./kit";

// Страница кучи PostgreSQL (bufpage.h / htup_details.h), байт в байт:
// 24 Б заголовок → массив line pointer'ов по 4 Б растёт вниз → свободное место → кортежи растут вверх от конца.
// Кортеж = 23 Б заголовка (выровнено до t_hoff = 24) + данные, место под него выровнено по MAXALIGN = 8.
const PAGE = 8192;
const HDR = 24;
const LP = 4;
const T_HOFF = 24;
const align = (n: number) => Math.ceil(n / 8) * 8;

type LpState = "normal" | "redirect" | "dead" | "unused";
interface Tuple {
  off: number;
  len: number;
  xmin: number;
  xmax: number; // 0 = нет (HEAP_XMAX_INVALID)
  next: number; // t_ctid: своя позиция или новая версия
  hotUpdated: boolean; // HEAP_HOT_UPDATED — следующая версия на этой же странице, без новой записи в индексе
  heapOnly: boolean; // HEAP_ONLY_TUPLE — на неё не ссылается индекс, только цепочка
  updated: boolean; // HEAP_UPDATED — появилась в результате UPDATE
  id: number;
  name: string;
  wide: boolean;
}
interface Slot {
  state: LpState;
  t?: Tuple;
  redirect?: number;
}
interface Page {
  slots: Slot[]; // slots[0] — это lp 1
  xid: number;
  nextId: number;
  log: string[];
  seed: number;
}

const NAMES = ["alice", "bob", "aigerim", "temir", "dana", "arman", "carol", "ivan", "zhanna", "erlan", "judy", "nursultan", "olga", "marat", "saule"];

function tupleLen(name: string, wide: boolean) {
  // int4 id (4 Б) + text name (1 Б короткий varlena-заголовок + байты) [+ text bio 180 Б с 4-байтным заголовком]
  return T_HOFF + 4 + 1 + name.length + (wide ? 4 + 180 : 0);
}
const lower = (p: Page) => HDR + LP * p.slots.length;
const upper = (p: Page) => Math.min(PAGE, ...p.slots.flatMap((s) => (s.t ? [s.t.off] : [])));
const free = (p: Page) => upper(p) - lower(p);
const pick = (p: Page) => {
  const r = rng(p.seed)();
  return { name: NAMES[Math.floor(r * NAMES.length)], seed: p.seed + 1 };
};
const clone = (p: Page): Page => structuredClone(p);

/** PageAddItem: занимает свободный lp (если есть) или добавляет новый в конец массива. */
function addTuple(p: Page, t: Omit<Tuple, "off" | "next">): number | null {
  const reuse = p.slots.findIndex((s) => s.state === "unused");
  const need = align(t.len) + (reuse >= 0 ? 0 : LP);
  if (need > free(p)) return null;
  const off = upper(p) - align(t.len);
  const lp = reuse >= 0 ? reuse + 1 : p.slots.length + 1;
  const slot: Slot = { state: "normal", t: { ...t, off, next: lp } };
  if (reuse >= 0) p.slots[reuse] = slot;
  else p.slots.push(slot);
  return lp;
}

function insert(p0: Page, wide: boolean, quiet = false): Page {
  const p = clone(p0);
  const { name, seed } = pick(p);
  p.seed = seed;
  const xid = p.xid;
  const lp = addTuple(p, { len: tupleLen(name, wide), xmin: xid, xmax: 0, hotUpdated: false, heapOnly: false, updated: false, id: p.nextId, name, wide });
  if (lp === null) {
    if (!quiet) p.log.push(`INSERT: не помещается — строка уйдёт на другую страницу (по карте свободного места, FSM)`);
    return p;
  }
  p.xid++;
  p.nextId++;
  if (!quiet) p.log.push(`INSERT id=${p.nextId - 1} '${name}' xid ${xid} → ctid (0,${lp})`);
  return p;
}

function update(p0: Page, lp: number, indexOnName: boolean): Page {
  const p = clone(p0);
  const old = p.slots[lp - 1]?.t;
  if (!old || old.xmax) return p;
  const { name, seed } = pick(p);
  p.seed = seed;
  const xid = p.xid;
  // HOT возможен, если не менялась ни одна индексированная колонка и новая версия влезает на ту же страницу
  const hot = !(indexOnName && name !== old.name);
  const nlp = addTuple(p, { len: tupleLen(name, old.wide), xmin: xid, xmax: 0, hotUpdated: false, heapOnly: hot, updated: true, id: old.id, name, wide: old.wide });
  if (nlp === null) {
    p.log.push(`UPDATE: новая версия не влезает — она ушла бы на другую страницу, и это точно не HOT`);
    return p;
  }
  const o = p.slots[lp - 1].t!;
  o.xmax = xid;
  o.next = nlp;
  o.hotUpdated = hot;
  p.xid++;
  p.log.push(
    `UPDATE id=${o.id} → '${name}' xid ${xid}: (0,${lp}).xmax = ${xid}, новая версия (0,${nlp})` +
      (hot ? " — HOT, индекс не трогаем" : " — не HOT: name в индексе, нужна новая запись индекса"),
  );
  return p;
}

function del(p0: Page, lp: number): Page {
  const p = clone(p0);
  const t = p.slots[lp - 1]?.t;
  if (!t || t.xmax) return p;
  t.xmax = p.xid;
  p.log.push(`DELETE id=${t.id} xid ${p.xid}: (0,${lp}).xmax = ${p.xid}. Байты на месте — строка просто стала мёртвой для новых снимков`);
  p.xid++;
  return p;
}

/** VACUUM (все транзакции закоммичены, старых снимков нет): чистит цепочки, освобождает lp, уплотняет страницу. */
function vacuum(p0: Page): Page {
  const p = clone(p0);
  let removed = 0;
  let redirects = 0;
  const isDead = (t: Tuple) => t.xmax !== 0;
  // корни: обычные кортежи (на них ссылается индекс), и уже существующие redirect'ы
  for (let i = 0; i < p.slots.length; i++) {
    const s = p.slots[i];
    let start: number | null = null;
    if (s.state === "normal" && s.t && !s.t.heapOnly) start = i + 1;
    else if (s.state === "redirect") start = s.redirect!;
    if (start === null) continue;
    // пройти HOT-цепочку от корня до первой живой версии
    const chain: number[] = [];
    let cur = s.state === "normal" ? i + 1 : start;
    let live: number | null = null;
    for (let guard = 0; guard < 400; guard++) {
      const t = p.slots[cur - 1]?.t;
      if (!t) break;
      if (cur !== i + 1) chain.push(cur);
      if (!isDead(t)) {
        live = cur;
        break;
      }
      if (!t.hotUpdated || t.next === cur) break;
      cur = t.next;
    }
    const root = p.slots[i];
    const rootDead = root.state === "redirect" || (root.t && isDead(root.t));
    if (!rootDead) continue;
    if (live !== null && live !== i + 1) {
      // корень мёртв, но есть живая версия в цепочке → redirect, индекс продолжает указывать на корень
      if (root.t) removed++;
      p.slots[i] = { state: "redirect", redirect: live };
      redirects++;
    } else if (live === null) {
      // вся цепочка мертва: VACUUM удаляет запись индекса, lp освобождается
      if (root.t) removed++;
      p.slots[i] = { state: "unused" };
    }
    for (const c of chain) {
      if (c === live) break;
      if (p.slots[c - 1].t) removed++;
      p.slots[c - 1] = { state: "unused" };
    }
  }
  // осиротевшие мёртвые версии (heap-only без живого корня) — тоже в мусор
  for (let i = 0; i < p.slots.length; i++) {
    const t = p.slots[i].t;
    if (t && isDead(t) && t.heapOnly) {
      p.slots[i] = { state: "unused" };
      removed++;
    }
  }
  // PG 14+: хвост из unused lp обрезается
  while (p.slots.length && p.slots[p.slots.length - 1].state === "unused") p.slots.pop();
  // PageRepairFragmentation: живые кортежи сдвигаются к концу страницы, номера lp (и ctid) не меняются
  const live = p.slots.flatMap((s) => (s.t ? [s.t] : [])).sort((a, b) => b.off - a.off);
  let up = PAGE;
  for (const t of live) {
    up -= align(t.len);
    t.off = up;
  }
  p.log.push(`VACUUM: убрано ${removed} мёртвых версий, redirect ${redirects}. Живые кортежи сдвинуты к концу, их ctid прежние — индексы не перестраиваются`);
  return p;
}

function vacuumFull(p0: Page): Page {
  const p = clone(p0);
  const live = p.slots.flatMap((s) => (s.t && !s.t.xmax ? [s.t] : []));
  const moves: string[] = [];
  const out: Page = { ...p, slots: [] };
  for (const t of live) {
    const was = p.slots.findIndex((s) => s.t === t) + 1;
    const lp = addTuple(out, { ...t, hotUpdated: false, heapOnly: false, updated: false });
    if (lp !== was) moves.push(`(0,${was})→(0,${lp})`);
  }
  out.log = [...p.log, `VACUUM FULL: таблица переписана заново. ${moves.length ? `ctid поменялись: ${moves.slice(0, 4).join(", ")}${moves.length > 4 ? "…" : ""} — индексы построены заново` : "ctid не изменились"}`];
  return out;
}

function initial(): Page {
  let p: Page = { slots: [], xid: 740, nextId: 1, log: [], seed: 3 };
  for (let i = 0; i < 14; i++) p = insert(p, false, true);
  p.log = ["14 строк уже вставлены транзакциями 740–753"];
  return p;
}

// ── Отрисовка ───────────────────────────────────────────────

const ROW = 512; // байт в одной строке схемы
function segs(start: number, len: number) {
  const out: { x: number; row: number; w: number }[] = [];
  let s = start;
  const end = start + len;
  while (s < end) {
    const row = Math.floor(s / ROW);
    const rowEnd = (row + 1) * ROW;
    const e = Math.min(end, rowEnd);
    out.push({ x: s - row * ROW, row, w: e - s });
    s = e;
  }
  return out;
}

const LP_COLOR: Record<LpState, string> = { normal: C.blue, redirect: C.teal, dead: C.rose, unused: C.lineStrong };
const tupleColor = (t: Tuple) => (t.xmax ? C.rose : t.heapOnly ? C.teal : C.accent);

export function PgPage() {
  const phone = useIsPhone();
  const init = useCallback(initial, []);
  const { cur: p, push, back, reset, canBack } = useHistory(init);
  const [sel, setSel] = useState<number | null>(2);
  const [indexOnName, setIndexOnName] = useState(false);
  const [wide, setWide] = useState(false);

  const rowH = phone ? 22 : 13;
  const gap = phone ? 6 : 4;
  const rows = PAGE / ROW;
  const H = rows * (rowH + gap);
  const Y = (row: number) => row * (rowH + gap);

  const selSlot = sel ? p.slots[sel - 1] : undefined;
  const selT = selSlot?.t;
  const chain = new Set<number>();
  if (sel) {
    let c = sel;
    for (let g = 0; g < 50 && p.slots[c - 1]; g++) {
      chain.add(c);
      const s = p.slots[c - 1];
      const nx = s.state === "redirect" ? s.redirect! : s.t && s.t.next !== c ? s.t.next : null;
      if (!nx || chain.has(nx)) break;
      c = nx;
    }
  }
  const dead = p.slots.filter((s) => s.t?.xmax).length;
  const liveRows = p.slots.map((s, i) => ({ s, lp: i + 1 })).filter(({ s }) => s.t && !s.t.xmax);

  const rect = (start: number, len: number, fill: string, key: string, opts: { opacity?: number; hatch?: boolean; stroke?: string; onClick?: () => void } = {}) =>
    segs(start, len).map((g, i) => (
      <rect
        key={`${key}-${i}`}
        x={g.x + 0.25}
        y={Y(g.row)}
        width={Math.max(0.5, g.w - 0.5)}
        height={rowH}
        rx={1.2}
        fill={opts.hatch ? "url(#pg-hatch)" : fill}
        fillOpacity={opts.opacity ?? 1}
        stroke={opts.stroke ?? (opts.hatch ? fill : "none")}
        strokeWidth={opts.stroke ? 1.6 : 0.8}
        onClick={opts.onClick}
        className={opts.onClick ? "cursor-pointer" : undefined}
      />
    ));

  return (
    <Frame
      title="Страница кучи: 8 КБ изнутри"
      hint="кликни кортеж или line pointer"
      controls={
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => push(insert(p, wide))}>
              INSERT
            </Button>
            <Button
              icon={<Plus className="size-4" />}
              onClick={() => push(() => Array.from({ length: 20 }).reduce<Page>((acc) => insert(acc, wide, true), { ...clone(p), log: [...p.log, "INSERT × 20"] }))}
            >
              × 20
            </Button>
            <Button icon={<PenLine className="size-4" />} disabled={!selT || !!selT.xmax} onClick={() => sel && push(update(p, sel, indexOnName))}>
              UPDATE
            </Button>
            <Button icon={<Trash2 className="size-4" />} disabled={!selT || !!selT.xmax} onClick={() => sel && push(del(p, sel))}>
              DELETE
            </Button>
            <Button icon={<Eraser className="size-4" />} onClick={() => push(vacuum(p))}>
              VACUUM
            </Button>
            <Button icon={<Sparkles className="size-4" />} onClick={() => push(vacuumFull(p))}>
              VACUUM FULL
            </Button>
            <Button icon={<Undo2 className="size-4" />} disabled={!canBack} onClick={back}>
              Отменить
            </Button>
            <Button onClick={() => { reset(); setSel(2); }}>Сначала</Button>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Toggle checked={indexOnName} onChange={setIndexOnName} label="Индекс по name (ломает HOT)" />
            <Toggle checked={wide} onChange={setWide} label="Широкие строки (+bio 180 Б)" />
          </div>
        </div>
      }
    >
      <Metrics>
        <Metric label="pd_lower" value={lower(p)} />
        <Metric label="pd_upper" value={upper(p)} />
        <Metric label="свободно" value={`${free(p)} Б`} tone={free(p) < 400 ? "bad" : undefined} />
        <Metric label="мёртвых версий" value={dead} tone={dead ? "amber" : undefined} />
      </Metrics>

      <div className="mt-4">
        <div className="mb-1 flex justify-between font-mono text-[10px] text-mute">
          <span>0</span>
          <span>{phone ? "512 Б в строке" : "каждая полоса — 512 байт"}</span>
          <span>511</span>
        </div>
        <svg viewBox={`0 0 ${ROW} ${H}`} className="block w-full select-none" role="img" aria-label="Раскладка страницы">
          <defs>
            <pattern id="pg-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="5" height="5" fill={C.rose} fillOpacity="0.12" />
              <line x1="0" y1="0" x2="0" y2="5" stroke={C.rose} strokeWidth="2.2" strokeOpacity="0.75" />
            </pattern>
          </defs>
          {Array.from({ length: rows }, (_, r) => (
            <rect key={r} x={0} y={Y(r)} width={ROW} height={rowH} rx={2} fill={C.raised} fillOpacity={0.55} />
          ))}
          {rect(0, HDR, C.violet, "hdr")}
          {p.slots.map((s, i) =>
            rect(HDR + i * LP, LP, LP_COLOR[s.state], `lp${i}`, {
              stroke: chain.has(i + 1) ? C.ink : undefined,
              onClick: () => setSel(i + 1),
            }),
          )}
          {p.slots.map((s, i) =>
            s.t ? (
              <g key={`t${i}`}>
                {rect(s.t.off + s.t.len, align(s.t.len) - s.t.len, tupleColor(s.t), `pad${i}`, { opacity: 0.18 })}
                {rect(s.t.off, s.t.len, tupleColor(s.t), `tu${i}`, {
                  hatch: !!s.t.xmax,
                  stroke: chain.has(i + 1) ? C.ink : undefined,
                  opacity: s.t.xmax ? 1 : chain.has(i + 1) ? 1 : 0.78,
                  onClick: () => setSel(i + 1),
                })}
              </g>
            ) : null,
          )}
          {/* маркеры pd_lower / pd_upper */}
          {[lower(p), upper(p)].map((b, k) => {
            const row = Math.min(rows - 1, Math.floor(b / ROW));
            const x = b - row * ROW;
            return <line key={k} x1={x} x2={x} y1={Y(row) - 2} y2={Y(row) + rowH + 2} stroke={k ? C.amber : C.blue} strokeWidth={1.6} />;
          })}
        </svg>
        <Legend
          className="mt-2.5"
          items={[
            { color: C.violet, label: "заголовок 24 Б" },
            { color: C.blue, label: "line pointer 4 Б" },
            { color: C.accent, label: "живой кортеж" },
            { color: C.teal, label: "HOT-версия / redirect" },
            { color: C.rose, label: "мёртвая версия", hatch: true },
            { color: C.lineStrong, label: "свободный lp" },
          ]}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-line bg-bg/40 p-3">
          {!sel || !selSlot ? (
            <div className="text-[13px] text-mute">Выбери кортеж или line pointer на схеме.</div>
          ) : (
            <TupleDetail lp={sel} slot={selSlot} onJump={setSel} />
          )}
        </div>
        <div className="min-w-0">
          <Caption>SELECT ctid, xmin, xmax, id, name FROM users</Caption>
          <div className="max-h-[188px] overflow-auto rounded-xl border border-line">
            <table className="w-full font-mono text-[12px]">
              <thead className="sticky top-0 bg-surface text-mute">
                <tr>
                  {["ctid", "xmin", "xmax", "id", "name"].map((h) => (
                    <th key={h} className="px-2.5 py-1.5 text-left font-normal">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {liveRows.map(({ s, lp }) => (
                  <tr key={lp} onClick={() => setSel(lp)} className={cx("cursor-pointer border-t border-line", sel === lp ? "bg-accent/10 text-ink" : "text-dim hover:bg-raised")}>
                    <td className="px-2.5 py-1">(0,{lp})</td>
                    <td className="px-2.5 py-1">{s.t!.xmin}</td>
                    <td className="px-2.5 py-1">0</td>
                    <td className="px-2.5 py-1">{s.t!.id}</td>
                    <td className="px-2.5 py-1">{s.t!.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-1.5 text-[12px] text-mute">Видно {liveRows.length} строк, на странице лежит {p.slots.filter((s) => s.t).length} версий.</div>
        </div>
      </div>

      <Log className="mt-4" lines={p.log} max={4} />
    </Frame>
  );
}

function TupleDetail({ lp, slot, onJump }: { lp: number; slot: Slot; onJump: (n: number) => void }) {
  if (slot.state === "unused") return <div className="text-[13px] text-dim">lp {lp}: <b className="text-ink">LP_UNUSED</b> — свободный слот, следующий INSERT займёт его без новых 4 байт.</div>;
  if (slot.state === "redirect")
    return (
      <div className="text-[13px] leading-relaxed text-dim">
        lp {lp}: <b className="text-teal">LP_REDIRECT → {slot.redirect}</b>. Сам кортеж удалён, но индекс всё ещё указывает на (0,{lp}), поэтому слот остался
        перенаправлением на живую HOT-версию.{" "}
        <button type="button" className="text-blue underline" onClick={() => onJump(slot.redirect!)}>
          перейти к (0,{slot.redirect})
        </button>
      </div>
    );
  const t = slot.t!;
  const flags = [t.xmax ? null : "XMAX_INVALID", t.updated && "UPDATED", t.hotUpdated && "HOT_UPDATED", t.heapOnly && "HEAP_ONLY_TUPLE"].filter(Boolean);
  const fields: [string, number, string][] = [
    ["xmin", 4, C.blue],
    ["xmax", 4, t.xmax ? C.rose : C.blue],
    ["cid", 4, C.blue],
    ["ctid", 6, t.next !== lp ? C.amber : C.blue],
    ["mask2", 2, C.violet],
    ["mask", 2, C.violet],
    ["hoff", 1, C.violet],
    ["", 1, C.lineStrong],
    ["id", 4, C.accent],
    ["name", 1 + t.name.length, C.accent],
    ...(t.wide ? ([["bio", 184, C.accent]] as [string, number, string][]) : []),
  ];
  const total = fields.reduce((a, f) => a + Math.min(f[1], 40), 0);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-mono text-[13px] text-ink">
          lp {lp} → off {t.off}, len {t.len}
        </div>
        <div className="font-mono text-[11px] text-mute">выделено {align(t.len)} Б</div>
      </div>
      <div className="mt-2 flex h-7 overflow-hidden rounded-md">
        {fields.map(([name, size, color], i) => (
          <div
            key={i}
            className="flex items-center justify-center border-r border-bg font-mono text-[9.5px] text-bg"
            style={{ width: `${(Math.min(size, 40) / total) * 100}%`, background: color }}
            title={`${name} ${size} Б`}
          >
            {size >= 4 ? name : ""}
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-mute">
        <span>заголовок 23 Б + 1 Б выравнивания</span>
        <span>данные</span>
      </div>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 font-mono text-[12px]">
        <dt className="text-mute">t_xmin</dt>
        <dd className="text-ink">{t.xmin} <span className="text-mute">— кто создал</span></dd>
        <dt className="text-mute">t_xmax</dt>
        <dd className={t.xmax ? "text-rose" : "text-ink"}>{t.xmax || 0} <span className="text-mute">{t.xmax ? "— кто удалил/обновил" : "— жива"}</span></dd>
        <dt className="text-mute">t_ctid</dt>
        <dd className="text-ink">
          (0,{t.next}){" "}
          {t.next !== lp ? (
            <button type="button" className="text-blue underline" onClick={() => onJump(t.next)}>
              → новая версия
            </button>
          ) : (
            <span className="text-mute">— указывает на себя</span>
          )}
        </dd>
        <dt className="text-mute">infomask</dt>
        <dd className="break-words text-dim">{flags.join(" · ") || "—"}</dd>
        <dt className="text-mute">данные</dt>
        <dd className="text-dim">id={t.id}, name='{t.name}'{t.wide && ", bio=…"}</dd>
      </dl>
    </div>
  );
}
