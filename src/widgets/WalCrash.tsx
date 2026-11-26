import { HardDrive, MemoryStick, RotateCcw, Zap } from "lucide-react";
import { useCallback, useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { Toggle } from "../ui/Field";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { Caption, Log, useHistory } from "./kit";

// Write-ahead log: изменение сначала попадает в WAL, страница данных — когда-нибудь потом.
// Правило WAL: страницу нельзя записать на диск раньше, чем WAL до её LSN.
// COMMIT = fsync WAL (при synchronous_commit = on). Сбой стирает память; восстановление
// проигрывает WAL с LSN страницы на диске.

interface Version {
  val: number;
  xid: number;
}
interface PageImg {
  versions: Version[];
  lsn: number;
}
interface Rec {
  lsn: number;
  kind: "update" | "commit";
  xid: number;
  val?: number;
}
interface S {
  buffer: (PageImg & { dirty: boolean }) | null;
  disk: PageImg;
  walBuf: Rec[];
  walDisk: Rec[];
  nextLsn: number;
  nextXid: number;
  active: number | null;
  acked: { xid: number; val: number }[];
  crashed: boolean;
  log: string[];
  recovered: string | null;
}

const init = (): S => ({
  buffer: { versions: [{ val: 100, xid: 1 }], lsn: 10, dirty: false },
  disk: { versions: [{ val: 100, xid: 1 }], lsn: 10 },
  walBuf: [],
  walDisk: [{ lsn: 10, kind: "commit", xid: 1 }],
  nextLsn: 11,
  nextXid: 2,
  active: null,
  acked: [{ xid: 1, val: 100 }],
  crashed: false,
  log: ["balance = 100 закоммичен давно, всё уже на диске"],
  recovered: null,
});

const committedIn = (recs: Rec[]) => new Set(recs.filter((r) => r.kind === "commit").map((r) => r.xid));
function visible(p: PageImg, committed: Set<number>) {
  const v = [...p.versions].reverse().find((x) => committed.has(x.xid));
  return v?.val ?? null;
}

function flushUpTo(s: S, lsn: number) {
  const move = s.walBuf.filter((r) => r.lsn <= lsn);
  s.walDisk.push(...move);
  s.walBuf = s.walBuf.filter((r) => r.lsn > lsn);
  return move.length;
}

export function WalCrash() {
  const initial = useCallback(init, []);
  const { cur: s, push, back, canBack, reset } = useHistory(initial);
  const [syncCommit, setSyncCommit] = useState(true);

  const act = (f: (d: S) => void) => push((p) => {
    const d = structuredClone(p);
    f(d);
    return d;
  });

  const update = () =>
    act((d) => {
      if (!d.buffer) return;
      if (d.active === null) d.active = d.nextXid++;
      const cur = d.buffer.versions[d.buffer.versions.length - 1].val;
      const val = cur - 10;
      const lsn = d.nextLsn++;
      d.buffer.versions.push({ val, xid: d.active });
      d.buffer.lsn = lsn;
      d.buffer.dirty = true;
      d.walBuf.push({ lsn, kind: "update", xid: d.active, val });
      d.log.push(`T${d.active}: UPDATE balance = ${val} → страница в памяти (LSN ${lsn}) + запись в WAL-буфер`);
    });
  const commit = () =>
    act((d) => {
      if (d.active === null) return;
      const lsn = d.nextLsn++;
      d.walBuf.push({ lsn, kind: "commit", xid: d.active });
      const val = d.buffer!.versions[d.buffer!.versions.length - 1].val;
      if (syncCommit) {
        const n = flushUpTo(d, lsn);
        d.log.push(`T${d.active}: COMMIT → fsync WAL (${n} записей) → клиенту «OK». Страница данных на диске всё ещё старая — и это нормально`);
      } else {
        d.log.push(`T${d.active}: COMMIT → клиенту «OK» сразу, WAL сбросится фоном через ~200 мс (synchronous_commit = off)`);
      }
      d.acked.push({ xid: d.active, val });
      d.active = null;
    });
  const writePage = () =>
    act((d) => {
      if (!d.buffer?.dirty) return;
      const n = flushUpTo(d, d.buffer.lsn);
      d.disk = { versions: structuredClone(d.buffer.versions), lsn: d.buffer.lsn };
      d.buffer.dirty = false;
      d.log.push(`запись страницы на диск: сначала WAL до LSN ${d.buffer.lsn}${n ? ` (дописано ${n})` : " (уже на диске)"}, потом сама страница`);
    });
  const walWriter = () =>
    act((d) => {
      const n = flushUpTo(d, Infinity);
      d.log.push(`walwriter: фоновый сброс WAL-буфера (${n} записей)`);
    });
  const crash = () =>
    act((d) => {
      d.buffer = null;
      d.walBuf = [];
      d.crashed = true;
      d.log.push(`💥 сбой питания: shared_buffers и WAL-буферы потеряны${d.active ? `, T${d.active} не успела закоммититься` : ""}`);
      d.active = null;
    });
  const recover = () =>
    act((d) => {
      const page: PageImg = structuredClone(d.disk);
      const replay = d.walDisk.filter((r) => r.lsn > page.lsn && r.kind === "update");
      for (const r of replay) page.versions.push({ val: r.val!, xid: r.xid });
      page.lsn = Math.max(page.lsn, ...d.walDisk.map((r) => r.lsn));
      d.buffer = { ...page, dirty: replay.length > 0 };
      d.crashed = false;
      const committed = committedIn(d.walDisk);
      const lost = d.acked.filter((a) => !committed.has(a.xid));
      const val = visible(page, committed);
      d.recovered = lost.length
        ? `Потеряны подтверждённые коммиты: ${lost.map((l) => `T${l.xid}`).join(", ")}. Клиенту сказали OK, а данных нет.`
        : `Все подтверждённые коммиты на месте. balance = ${val}.`;
      d.log.push(`восстановление: страница с диска (LSN ${d.disk.lsn}) + проигрываю ${replay.length} записей WAL → видимое balance = ${val}`);
      d.acked = d.acked.filter((a) => committed.has(a.xid));
    });

  const committed = committedIn([...s.walDisk, ...(s.crashed ? [] : s.walBuf)]);

  return (
    <Frame
      title="WAL: что переживёт сбой"
      hint="делай изменения и роняй сервер в любой момент"
      controls={
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <Button variant="primary" onClick={update} disabled={s.crashed}>
              UPDATE −10
            </Button>
            <Button onClick={commit} disabled={s.crashed || s.active === null}>
              COMMIT
            </Button>
            <Button onClick={writePage} disabled={s.crashed || !s.buffer?.dirty}>
              Записать страницу
            </Button>
            <Button onClick={walWriter} disabled={s.crashed || !s.walBuf.length}>
              walwriter
            </Button>
            {s.crashed ? (
              <Button variant="primary" icon={<RotateCcw className="size-4" />} onClick={recover}>
                Восстановить
              </Button>
            ) : (
              <Button variant="danger" icon={<Zap className="size-4" />} onClick={crash}>
                Сбой
              </Button>
            )}
            <Button onClick={back} disabled={!canBack}>
              Отменить
            </Button>
            <Button onClick={() => reset()}>Сначала</Button>
          </div>
          <Toggle checked={syncCommit} onChange={setSyncCommit} label="synchronous_commit = on" />
        </div>
      }
    >
      <div className="grid gap-3 md:grid-cols-2">
        <Zone icon={<MemoryStick className="size-4" />} title="Память (теряется при сбое)" dead={s.crashed}>
          <Caption>shared_buffers · страница 7</Caption>
          {s.buffer ? <PageView p={s.buffer} committed={committed} dirty={s.buffer.dirty} /> : <Gone />}
          <Caption className="mt-3">WAL-буфер</Caption>
          <Recs recs={s.crashed ? [] : s.walBuf} empty={s.crashed ? "потерян" : "пусто"} />
        </Zone>
        <Zone icon={<HardDrive className="size-4" />} title="Диск (переживает сбой)">
          <Caption>файл таблицы · страница 7</Caption>
          <PageView p={s.disk} committed={committedIn(s.walDisk)} />
          <Caption className="mt-3">WAL на диске (pg_wal)</Caption>
          <Recs recs={s.walDisk.slice(-6)} empty="пусто" />
        </Zone>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-mute">Клиенту ответили «OK»:</span>
        {s.acked.map((a) => (
          <span key={a.xid} className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[12px] text-ink">
            T{a.xid} → {a.val}
          </span>
        ))}
        {s.active !== null && <span className="rounded-md border border-dashed border-amber/50 px-2 py-0.5 font-mono text-[12px] text-amber">T{s.active} в процессе</span>}
      </div>
      {s.recovered && (
        <div className={cx("mt-3 rounded-xl border px-3.5 py-2.5 text-[13.5px]", s.recovered.startsWith("Потеряны") ? "border-bad/40 bg-bad/10 text-bad" : "border-ok/40 bg-ok/10 text-ok")}>
          {s.recovered}
        </div>
      )}
      <Log className="mt-3" lines={s.log} max={4} />
    </Frame>
  );
}

function Zone({ icon, title, dead, children }: { icon: ReactNode; title: string; dead?: boolean; children: ReactNode }) {
  return (
    <div className={cx("rounded-xl border p-3 transition", dead ? "border-bad/40 bg-bad/[0.04]" : "border-line bg-bg/40")}>
      <div className={cx("mb-2.5 flex items-center gap-2 text-[13px] font-medium", dead ? "text-bad" : "text-ink")}>
        {icon}
        {title}
      </div>
      {children}
    </div>
  );
}

function Gone() {
  return <div className="rounded-lg border border-dashed border-bad/40 px-3 py-3 text-center font-mono text-[12px] text-bad">стёрто</div>;
}

function PageView({ p, committed, dirty }: { p: PageImg; committed: Set<number>; dirty?: boolean }) {
  const vis = visible(p, committed);
  return (
    <div className="rounded-lg border border-line bg-surface p-2">
      <div className="mb-1.5 flex justify-between font-mono text-[10.5px] text-mute">
        <span>LSN {p.lsn}</span>
        {dirty !== undefined && <span className={dirty ? "text-rose" : ""}>{dirty ? "грязная" : "чистая"}</span>}
      </div>
      <div className="flex flex-wrap gap-1">
        {p.versions.map((v, i) => (
          <span
            key={i}
            className={cx(
              "rounded-md border px-1.5 py-0.5 font-mono text-[11.5px]",
              committed.has(v.xid) ? (v.val === vis && i === p.versions.map((x) => committed.has(x.xid)).lastIndexOf(true) ? "border-accent/60 bg-accent/10 text-accent" : "border-line text-mute line-through") : "border-dashed border-amber/50 text-amber",
            )}
            title={`xmin = T${v.xid}`}
          >
            {v.val}
            <span className="ml-1 text-[9.5px] opacity-70">T{v.xid}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Recs({ recs, empty }: { recs: Rec[]; empty: string }) {
  if (!recs.length) return <div className="px-1 font-mono text-[11.5px] text-mute">{empty}</div>;
  return (
    <div className="grid gap-1">
      {recs.map((r) => (
        <div key={r.lsn} className="flex items-center gap-2 rounded-md bg-surface px-2 py-1 font-mono text-[11.5px]">
          <span className="text-mute">{r.lsn}</span>
          <span className={r.kind === "commit" ? "text-ok" : "text-blue"}>{r.kind === "commit" ? "COMMIT" : "UPDATE"}</span>
          <span className="text-dim">T{r.xid}{r.val !== undefined && ` = ${r.val}`}</span>
        </div>
      ))}
    </div>
  );
}
