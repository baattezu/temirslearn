import { HardDriveDownload, Shuffle } from "lucide-react";
import { useCallback, useState } from "react";
import { Button } from "../ui/Button";
import { Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Legend, Log, Metric, Metrics, rng, usePlayer, useHistory } from "./kit";

// shared_buffers + clock-sweep (freelist.c): у каждого буфера usage_count 0..5.
// Попадание → usage_count++. Промах → стрелка идёт по кругу, уменьшая usage_count, пока не найдёт 0.
// Грязную жертву бэкенд сначала пишет на диск сам. Seq Scan большой таблицы идёт через маленькое
// кольцо (BAS_BULKREAD), чтобы не вымыть горячие страницы.
const SLOTS = 8;
const BLOCKS = 24;
const MAX_USAGE = 5;
const RING = 2;

interface Buf {
  block: number | null;
  usage: number;
  dirty: boolean;
}
interface S {
  bufs: Buf[];
  hand: number;
  hits: number;
  misses: number;
  backendWrites: number;
  ckptWrites: number;
  ring: number[];
  ringPos: number;
  seqNext: number;
  seed: number;
  last: { slot: number; hit: boolean; swept: number[] } | null;
  log: string[];
}

const init = (): S => ({
  bufs: Array.from({ length: SLOTS }, () => ({ block: null, usage: 0, dirty: false })),
  hand: 0,
  hits: 0,
  misses: 0,
  backendWrites: 0,
  ckptWrites: 0,
  ring: [],
  ringPos: 0,
  seqNext: 0,
  seed: 11,
  last: null,
  log: [],
});

function clockVictim(s: S) {
  const swept: number[] = [];
  for (let guard = 0; guard < SLOTS * (MAX_USAGE + 2); guard++) {
    const i = s.hand;
    const b = s.bufs[i];
    s.hand = (s.hand + 1) % SLOTS;
    if (b.block === null || b.usage === 0) return { victim: i, swept };
    b.usage--;
    swept.push(i);
  }
  return { victim: s.hand, swept };
}

function access(s0: S, block: number, write: boolean, strategy: boolean): S {
  const s: S = structuredClone(s0);
  const found = s.bufs.findIndex((b) => b.block === block);
  if (found >= 0) {
    const b = s.bufs[found];
    // буферы кольца не «разогреваются» выше 1 — иначе скан всё равно вытеснит горячие
    b.usage = strategy && s.ring.includes(found) ? Math.max(b.usage, 1) : Math.min(MAX_USAGE, b.usage + 1);
    b.dirty ||= write;
    s.hits++;
    s.last = { slot: found, hit: true, swept: [] };
    s.log.push(`блок ${block}: попадание в буфер ${found}, usage_count → ${b.usage}${write ? ", буфер грязный" : ""}`);
    return s;
  }
  s.misses++;
  let victim: number;
  let swept: number[] = [];
  let how: string;
  if (strategy && s.ring.length >= RING) {
    victim = s.ring[s.ringPos % RING];
    s.ringPos++;
    how = `кольцо seq scan: переиспользую буфер ${victim}`;
  } else {
    const empty = s.bufs.findIndex((b) => b.block === null);
    if (empty >= 0) {
      victim = empty;
      how = `свободный буфер ${victim}`;
    } else {
      const r = clockVictim(s);
      victim = r.victim;
      swept = r.swept;
      how = `clock-sweep прошёл ${swept.length} буфер(ов), уменьшая usage_count → жертва ${victim}`;
    }
    if (strategy) s.ring.push(victim);
  }
  const v = s.bufs[victim];
  let extra = "";
  if (v.block !== null && v.dirty) {
    s.backendWrites++;
    extra = ` · блок ${v.block} грязный — бэкенд сам пишет его на диск (медленно!)`;
  } else if (v.block !== null) extra = ` · вытеснен блок ${v.block}`;
  s.bufs[victim] = { block, usage: 1, dirty: write };
  s.last = { slot: victim, hit: false, swept };
  s.log.push(`блок ${block}: промах, ${how}${extra}`);
  return s;
}

function checkpoint(s0: S): S {
  const s: S = structuredClone(s0);
  const n = s.bufs.filter((b) => b.dirty).length;
  s.bufs.forEach((b) => (b.dirty = false));
  s.ckptWrites += n;
  s.last = null;
  s.log.push(`CHECKPOINT: записано ${n} грязных страниц, теперь их можно вытеснять без записи`);
  return s;
}

type Load = "hot" | "uniform" | "seq";

export function BufferPool() {
  const initial = useCallback(init, []);
  const { cur: s, push, reset } = useHistory(initial);
  const [load, setLoad] = useState<Load>("hot");
  const [writes, setWrites] = useState(true);
  const [ringOn, setRingOn] = useState(true);

  const next = () => {
    const r = rng(s.seed);
    const a = r();
    const w = writes && r() < 0.3;
    if (load === "seq") {
      const b = s.seqNext;
      push({ ...access(s, b, false, ringOn), seqNext: (b + 1) % BLOCKS, seed: s.seed + 1 });
    } else {
      const block = load === "hot" ? (a < 0.8 ? Math.floor(r() * 4) : 4 + Math.floor(r() * (BLOCKS - 4))) : Math.floor(r() * BLOCKS);
      push({ ...access(s, block, w, false), seed: s.seed + 1 });
    }
  };
  const player = usePlayer(() => {
    next();
    return true;
  }, 550);

  const total = s.hits + s.misses;
  const R = 112;
  const cx0 = 150;
  const cy0 = 150;
  const pos = (i: number) => {
    const a = (i / SLOTS) * Math.PI * 2 - Math.PI / 2;
    return [cx0 + R * Math.cos(a), cy0 + R * Math.sin(a)] as const;
  };
  const handA = (s.hand / SLOTS) * Math.PI * 2 - Math.PI / 2;
  const hot = (b: number) => load === "hot" && b < 4;

  return (
    <Frame
      title="shared_buffers и clock-sweep"
      hint="кликай блоки на диске или включи поток запросов"
      controls={
        <div className="grid gap-3">
          <Segmented<Load>
            value={load}
            onChange={setLoad}
            block
            options={[
              { value: "hot", label: "OLTP: горячие 4" },
              { value: "uniform", label: "Равномерно" },
              { value: "seq", label: "Seq Scan" },
            ]}
          />
          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button variant="primary" icon={<Shuffle className="size-4" />} onClick={next}>
              Запрос
            </Button>
            <Button onClick={player.toggle}>{player.playing ? "Пауза" : "Поток запросов"}</Button>
            <Button icon={<HardDriveDownload className="size-4" />} onClick={() => push(checkpoint(s))}>
              CHECKPOINT
            </Button>
            <Button onClick={() => { player.stop(); reset(); }}>Сначала</Button>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            <Toggle checked={writes} onChange={setWrites} label="30% запросов пишут" />
            <Toggle checked={ringOn} onChange={setRingOn} label="Кольцо для Seq Scan" />
          </div>
        </div>
      }
    >
      <Metrics>
        <Metric label="hit ratio" value={total ? `${Math.round((s.hits / total) * 100)}%` : "—"} tone={total && s.hits / total > 0.8 ? "ok" : undefined} />
        <Metric label="чтений с диска" value={s.misses} />
        <Metric label="запись бэкендом" value={s.backendWrites} tone={s.backendWrites ? "bad" : undefined} />
        <Metric label="запись чекпоинтом" value={s.ckptWrites} />
      </Metrics>

      <div className="mt-4 grid items-center gap-4 md:grid-cols-[300px_1fr]">
        <svg viewBox="0 0 300 300" className="mx-auto block w-full max-w-[300px]">
          <circle cx={cx0} cy={cy0} r={R} fill="none" stroke={C.line} strokeDasharray="3 5" />
          <line x1={cx0} y1={cy0} x2={cx0 + (R - 34) * Math.cos(handA)} y2={cy0 + (R - 34) * Math.sin(handA)} stroke={C.amber} strokeWidth={3} strokeLinecap="round" />
          <circle cx={cx0} cy={cy0} r={5} fill={C.amber} />
          <text x={cx0} y={cy0 + 22} textAnchor="middle" fontSize={10} fill={C.mute} fontFamily="var(--font-mono)">
            стрелка
          </text>
          {s.bufs.map((b, i) => {
            const [x, y] = pos(i);
            const isLast = s.last?.slot === i;
            const swept = s.last?.swept.includes(i);
            const inRing = ringOn && load === "seq" && s.ring.includes(i);
            return (
              <g key={i} transform={`translate(${x - 27} ${y - 22})`}>
                <rect
                  width={54}
                  height={44}
                  rx={8}
                  fill={b.block === null ? C.bg : hot(b.block) ? "color-mix(in oklab, var(--color-accent) 16%, var(--color-surface))" : C.raised}
                  stroke={isLast ? (s.last!.hit ? C.ok : C.blue) : swept ? C.amber : inRing ? C.violet : C.lineStrong}
                  strokeWidth={isLast || swept || inRing ? 2 : 1}
                  strokeDasharray={inRing && !isLast ? "4 3" : undefined}
                />
                <text x={27} y={19} textAnchor="middle" fontSize={14} fontWeight={600} fill={b.block === null ? C.mute : C.ink} fontFamily="var(--font-mono)">
                  {b.block === null ? "—" : b.block}
                </text>
                {Array.from({ length: MAX_USAGE }, (_, k) => (
                  <rect key={k} x={8 + k * 8} y={29} width={6} height={6} rx={1.5} fill={k < b.usage ? C.accent : C.line} />
                ))}
                {b.dirty && <circle cx={48} cy={7} r={4} fill={C.rose} />}
                <text x={-4} y={-4} fontSize={9} fill={C.mute} fontFamily="var(--font-mono)">
                  {i}
                </text>
              </g>
            );
          })}
        </svg>

        <div className="min-w-0">
          <Caption>Таблица на диске · {BLOCKS} блоков</Caption>
          <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-12">
            {Array.from({ length: BLOCKS }, (_, b) => {
              const cached = s.bufs.some((x) => x.block === b);
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => push(access(s, b, writes, false))}
                  className={cx(
                    "flex h-9 items-center justify-center rounded-lg border font-mono text-[12px] transition",
                    cached ? "border-blue/50 bg-blue/10 text-ink" : "border-line text-mute hover:border-line-strong hover:text-ink",
                    hot(b) && "ring-1 ring-accent/40",
                  )}
                >
                  {b}
                </button>
              );
            })}
          </div>
          <Legend
            className="mt-3"
            items={[
              { color: C.accent, label: "usage_count" },
              { color: C.rose, label: "грязный буфер" },
              { color: C.amber, label: "стрелка обошла" },
              { color: C.violet, label: "кольцо seq scan" },
            ]}
          />
          <Log className="mt-3" lines={s.log} max={4} empty="Кликни блок на диске — он поднимется в shared_buffers." />
        </div>
      </div>
    </Frame>
  );
}
