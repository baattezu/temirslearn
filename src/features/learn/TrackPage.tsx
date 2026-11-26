import { ArrowLeft, ArrowRight, Check, ChevronRight, Lock, Repeat } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams, useSearchParams } from "react-router";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { RELATED, groupById, trackById, type Lesson, type Track } from "../../content/catalog";
import { GENS } from "../../content/practice";
import { hasBank, loadBank, type QA } from "../../content/questions";
import { useIsPhone } from "../../lib/hooks";
import { LEVELS, heatColor, heatOpacity, indexOf, masteryOf, type Mastery } from "../../lib/mastery";
import { cx } from "../../ui/cx";
import { Spinner } from "../../ui/misc";
import { Segmented } from "../../ui/Segmented";
import { TrackIcon } from "../../ui/TrackIcon";
import { QuestionList } from "./QuestionList";

type Tab = "path" | "questions" | "practice";

export function TrackPage() {
  const { trackId = "" } = useParams();
  const track = trackById(trackId);
  const data = useData();
  const [sp, setSp] = useSearchParams();
  if (!track) return <Navigate to="/tracks" replace />;

  const gens = GENS.filter((g) => g.lesson.startsWith(`${track.id}/`));
  const tabs: { value: Tab; label: string }[] = [
    { value: "path", label: "Путь" },
    ...(hasBank(track.id) ? [{ value: "questions" as Tab, label: "Вопросы" }] : []),
    ...(gens.length ? [{ value: "practice" as Tab, label: "Тренажёр" }] : []),
  ];
  const tab = (tabs.find((t) => t.value === sp.get("tab"))?.value ?? "path") as Tab;
  const idx = indexOf(track.lessons, data);

  return (
    <div className="pb-14">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <TrackIcon id={track.id} color={track.color} className="size-7 shrink-0 max-md:hidden" />
            {track.title}
          </span>
        }
        eyebrow={groupById(track.group)?.title}
        back="/tracks"
      >
        <p className="mt-2 max-w-2xl text-[15px] text-mute">{track.blurb}</p>
      </PageHeader>
      <div className="px-5 pt-3 md:hidden">
        <div className="flex items-center gap-3">
          <TrackIcon id={track.id} color={track.color} className="size-6 shrink-0" />
          <p className="text-[14px] leading-snug text-mute">{track.blurb}</p>
        </div>
      </div>

      <div className="max-w-3xl px-5 pt-5 md:px-10">
        <IndexBar value={idx} track={track} />
        {tabs.length > 1 && (
          <div className="mt-5">
            <Segmented value={tab} onChange={(v) => setSp(v === "path" ? {} : { tab: v }, { replace: true })} options={tabs} />
          </div>
        )}
        <div className="mt-5">
          {tab === "path" && <Path track={track} />}
          {tab === "questions" && <Bank track={track} />}
          {tab === "practice" && (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {gens.map((g) => (
                <Link key={g.id} to={`/practice/${g.id}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 hover:border-line-strong">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-ink">{g.title}</div>
                    <div className="text-[12.5px] text-mute">
                      решено: {data.practice[g.id]?.solved ?? 0}
                    </div>
                  </div>
                  <ChevronRight className="size-4 text-mute group-hover:text-ink" />
                </Link>
              ))}
            </div>
          )}
        </div>
        <Related track={track} />
      </div>
    </div>
  );
}

function IndexBar({ value, track }: { value: number; track: Track }) {
  const data = useData();
  const counts = [0, 0, 0, 0, 0];
  for (const l of track.lessons.filter((x) => x.ready)) counts[masteryOf(l.id, data).level]++;
  const pct = Math.round(value * 100);
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-mute">Индекс понимания</div>
        <div className="font-mono text-[22px] font-semibold tabular-nums text-ink">{pct}</div>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: track.color }} />
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-mute">
        {LEVELS.slice(1).map((l, i) => (
          <span key={l}>
            {l}: <span className="font-mono text-dim">{counts[i + 1]}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Путь ─────────────────────────────────────────────────

const ROW = 92;

function Path({ track }: { track: Track }) {
  const data = useData();
  const phone = useIsPhone();
  const amp = phone ? 22 : 70;
  const nodeX = (i: number) => Math.round(Math.sin(i * 0.95) * amp);
  const firstUnstarted = track.lessons.find((l) => l.ready && !data.reviews[l.id] && data.progress[l.id]?.status !== "done");
  const width = phone ? 96 : 200;
  const cx0 = width / 2;

  // плавная кривая через центры узлов
  const d = track.lessons
    .map((_, i) => {
      const x = cx0 + nodeX(i);
      const y = i * ROW + 30;
      if (i === 0) return `M ${x} ${y}`;
      const px = cx0 + nodeX(i - 1);
      const py = (i - 1) * ROW + 30;
      return `C ${px} ${py + ROW / 2}, ${x} ${y - ROW / 2}, ${x} ${y}`;
    })
    .join(" ");

  return (
    <div>
      <Legend />
      <div className="relative mt-4" style={{ height: track.lessons.length * ROW }}>
        <svg className="pointer-events-none absolute left-0 top-0" width={width} height={track.lessons.length * ROW} aria-hidden>
          <path d={d} fill="none" stroke="var(--color-line-strong)" strokeWidth={3} strokeDasharray="2 9" strokeLinecap="round" />
        </svg>
        {track.lessons.map((l, i) => (
          <PathNode key={l.id} lesson={l} index={i} x={cx0 + nodeX(i)} isNext={l.id === firstUnstarted?.id} labelLeft={width + 8} size={phone ? 48 : 58} />
        ))}
      </div>
    </div>
  );
}

function Legend() {
  const { mode } = useData();
  const item = (color: string, text: string, op = 1) => (
    <span className="flex items-center gap-1.5">
      <span className="size-2.5 rounded-full" style={{ background: color, opacity: op }} />
      {text}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-mute">
      {item("var(--color-ok)", "свежо")}
      {item("var(--color-amber)", "пора повторить")}
      {item("var(--color-mute)", "забывается", 0.5)}
      <span className="flex items-center gap-1">
        <Repeat className="size-3" /> сколько раз прошёл
      </span>
      <Link to="/review" className="ml-auto text-dim hover:text-ink">
        режим: {mode === "exam" ? "перед собесом" : mode === "light" ? "лёгкий" : "стандарт"} →
      </Link>
    </div>
  );
}

function PathNode({ lesson, index, x, isNext, labelLeft, size }: { lesson: Lesson; index: number; x: number; isNext: boolean; labelLeft: number; size: number }) {
  const data = useData();
  const m = masteryOf(lesson.id, data);
  const st = data.progress[lesson.id]?.status;
  const top = index * ROW;

  const node = (
    <div
      className={cx(
        "relative flex items-center justify-center rounded-full border-[3px] font-mono text-[15px] font-semibold transition",
        lesson.ready && "group-hover:scale-105",
        m.heat === "due" && "anim-pulse-ring",
      )}
      style={{
        width: size,
        height: size,
        borderColor: !lesson.ready ? "var(--color-line)" : m.heat !== "none" ? heatColor(m) : isNext ? "var(--color-accent)" : st === "doing" ? "var(--color-blue)" : "var(--color-line-strong)",
        background: m.heat !== "none" ? `color-mix(in oklab, ${heatColor(m)} ${Math.round(heatOpacity(m) * 28)}%, var(--color-surface))` : "var(--color-surface)",
        opacity: m.heat !== "none" ? heatOpacity(m) : 1,
        borderStyle: lesson.ready ? "solid" : "dashed",
      }}
    >
      {!lesson.ready ? (
        <Lock className="size-4 text-mute" />
      ) : m.heat !== "none" ? (
        <Check className="size-6" style={{ color: heatColor(m) }} strokeWidth={2.6} />
      ) : (
        <span className={isNext ? "text-accent" : "text-dim"}>{index + 1}</span>
      )}
      {m.total > 0 && (
        <span
          className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border border-bg px-1 font-mono text-[10.5px] font-bold text-bg"
          style={{ background: heatColor(m) }}
          title={`Пройдено раз: ${m.total}`}
        >
          {m.total}
        </span>
      )}
    </div>
  );

  const label = (
    <div className="min-w-0">
      <div className={cx("text-[15px] font-medium leading-snug", lesson.ready ? "text-ink" : "text-mute")}>{lesson.title}</div>
      <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-mute">{lesson.summary}</div>
      <NodeStatus m={m} ready={lesson.ready} isNext={isNext} />
    </div>
  );

  const body = (
    <>
      <div className="absolute" style={{ left: x - size / 2, top: 30 - size / 2 }}>
        {node}
      </div>
      <div className="absolute right-0 top-1" style={{ left: labelLeft }}>
        {label}
      </div>
    </>
  );

  return lesson.ready ? (
    <Link to={`/l/${lesson.id}`} className="group absolute inset-x-0 block" style={{ top, height: ROW }}>
      {body}
    </Link>
  ) : (
    <div className="absolute inset-x-0" style={{ top, height: ROW }}>
      {body}
    </div>
  );
}

function NodeStatus({ m, ready, isNext }: { m: Mastery; ready: boolean; isNext: boolean }) {
  if (!ready) return <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-mute">скоро</div>;
  if (m.heat === "none")
    return isNext ? <div className="mt-1 font-mono text-[11px] uppercase tracking-wider text-accent">начать →</div> : null;
  const days = m.due ? Math.round((m.due - Date.now()) / 86_400_000) : 0;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-x-2 font-mono text-[11px] text-mute">
      <span style={{ color: heatColor(m) }}>{LEVELS[m.level]}</span>
      <span>·</span>
      <span>{days > 0 ? `повтор через ${days} д` : days === 0 ? "повторить сегодня" : `просрочено на ${-days} д`}</span>
    </div>
  );
}

// ── Вопросы ──────────────────────────────────────────────

function Bank({ track }: { track: Track }) {
  const [items, setItems] = useState<QA[] | null>(null);
  const [lesson, setLesson] = useState<string>("all");
  useEffect(() => {
    void loadBank(track.id).then(setItems);
  }, [track.id]);
  const lessons = useMemo(() => track.lessons.filter((l) => items?.some((q) => q.lesson === l.slug)), [items, track]);
  if (!items) return <div className="flex justify-center py-10 text-mute"><Spinner /></div>;
  const shown = lesson === "all" ? items : items.filter((q) => q.lesson === lesson);
  return (
    <div>
      <p className="mb-3 text-[13.5px] leading-relaxed text-mute">
        Сначала ответь сам — вслух или в голове. Потом открой ответ и сравни. Так запоминается в разы лучше, чем перечитывать.
      </p>
      <div className="-mx-5 mb-4 flex gap-1.5 overflow-x-auto px-5 pb-1 md:mx-0 md:flex-wrap md:px-0">
        {[{ slug: "all", title: `Все · ${items.length}` }, ...lessons.map((l) => ({ slug: l.slug, title: l.title }))].map((o) => (
          <button
            key={o.slug}
            type="button"
            onClick={() => setLesson(o.slug)}
            className={cx(
              "h-8 shrink-0 whitespace-nowrap rounded-full border px-3 text-[12.5px] transition",
              lesson === o.slug ? "border-accent/50 bg-accent/10 text-ink" : "border-line text-dim hover:text-ink",
            )}
          >
            {o.title}
          </button>
        ))}
      </div>
      <QuestionList items={shown} hrefOf={(qa) => (track.lessons.find((l) => l.slug === qa.lesson)?.ready ? `/l/${track.id}/${qa.lesson}` : undefined)} />
    </div>
  );
}

// ── Связи ────────────────────────────────────────────────

function Related({ track }: { track: Track }) {
  const rel = RELATED[track.id];
  if (!rel || (!rel.needs.length && !rel.feeds.length)) return null;
  const chip = (id: string) => {
    const t = trackById(id);
    if (!t) return null;
    return (
      <Link key={id} to={`/t/${id}`} className="flex h-9 items-center gap-2 rounded-xl border border-line bg-surface px-3 text-[13px] text-dim hover:border-line-strong hover:text-ink">
        <TrackIcon id={id} color={t.color} className="size-4" />
        {t.title}
      </Link>
    );
  };
  return (
    <div className="mt-10 grid gap-4 border-t border-line pt-6 sm:grid-cols-2">
      {rel.needs.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">
            <ArrowLeft className="size-3" /> Опирается на
          </div>
          <div className="flex flex-wrap gap-2">{rel.needs.map(chip)}</div>
        </div>
      )}
      {rel.feeds.length > 0 && (
        <div>
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">
            Пригодится в <ArrowRight className="size-3" />
          </div>
          <div className="flex flex-wrap gap-2">{rel.feeds.map(chip)}</div>
        </div>
      )}
    </div>
  );
}
