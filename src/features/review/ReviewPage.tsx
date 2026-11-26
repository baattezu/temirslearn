import { Check, ChevronRight, Eye, PartyPopper } from "lucide-react";
import { SkeletonText } from "../../ui/Skeleton";
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { SRS_MODES, type SrsMode } from "../../../shared/srs";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { LESSONS, TRACKS, trackById, type Lesson } from "../../content/catalog";
import { lessonQuestions, type QA } from "../../content/questions";
import { LEVELS, dueLessons, heatColor, heatOpacity, indexOf, masteryOf } from "../../lib/mastery";
import { Button } from "../../ui/Button";
import { Markdown } from "../../ui/Markdown";
import { Segmented } from "../../ui/Segmented";
import { TrackIcon } from "../../ui/TrackIcon";

export function ReviewPage() {
  const data = useData();
  // очередь фиксируем на входе, чтобы карточки не прыгали после оценки
  const [queue, setQueue] = useState<string[] | null>(null);
  useEffect(() => {
    if (queue === null && Object.keys(data.reviews).length) setQueue(dueLessons(data).map((x) => x.lesson.id));
  }, [data, queue]);
  const [pos, setPos] = useState(0);
  const current = queue?.[pos];

  const started = LESSONS.filter((l) => l.ready && data.reviews[l.id]);
  const idx = indexOf(LESSONS, data);

  return (
    <div className="pb-16">
      <PageHeader title="Повторение" eyebrow="Интервальные повторы" back="/">
        <p className="mt-2 max-w-2xl text-[15px] text-mute">
          Пройденная тема горит зелёным, со временем желтеет и сереет — это кривая забывания. Повтори вовремя, и следующий интервал станет длиннее.
        </p>
      </PageHeader>

      <div className="grid max-w-3xl gap-6 px-5 pt-4 md:px-10">
        <ModeSwitch />

        {current ? (
          <ReviewCard key={current} lessonId={current} n={pos + 1} of={queue!.length} onNext={() => setPos((p) => p + 1)} />
        ) : (
          <div className="flex flex-col items-center rounded-2xl border border-line bg-surface px-5 py-10 text-center">
            <PartyPopper className="size-8 text-accent" />
            <div className="mt-3 text-[17px] font-semibold text-ink">{queue && queue.length ? "На сегодня всё повторено" : "Повторять пока нечего"}</div>
            <div className="mt-1 max-w-sm text-[14px] text-mute">
              {started.length ? "Темы снова пожелтеют, когда подойдёт срок. Я напомню." : "Пройди первый урок — он появится здесь завтра."}
            </div>
          </div>
        )}

        <section>
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-mono text-[12px] uppercase tracking-[0.12em] text-mute">Все пройденные темы</h2>
            <span className="font-mono text-[12px] text-mute">общий индекс {Math.round(idx * 100)}</span>
          </div>
          <HeatGrid />
        </section>
      </div>
    </div>
  );
}

function ModeSwitch() {
  const { mode, setSetting } = useData();
  const m = SRS_MODES.find((x) => x.id === mode)!;
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <div className="mb-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">Режим интервалов</div>
      <Segmented<SrsMode>
        block
        value={mode}
        onChange={(v) => void setSetting("srsMode", v)}
        options={SRS_MODES.map((x) => ({ value: x.id, label: x.short }))}
      />
      <p className="mt-2.5 text-[13px] leading-relaxed text-dim">{m.about}</p>
    </div>
  );
}

/** Карточка повторения: вопросы по теме → вспомнил сам → открыл ответы → честная оценка. */
function ReviewCard({ lessonId, n, of, onNext }: { lessonId: string; n: number; of: number; onNext: () => void }) {
  const data = useData();
  const lesson = LESSONS.find((l) => l.id === lessonId)!;
  const track = trackById(lesson.track)!;
  const m = masteryOf(lessonId, data);
  const [qs, setQs] = useState<QA[] | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    void lessonQuestions(lessonId).then(setQs);
  }, [lessonId]);

  const grade = async (g: "good" | "hard" | "again") => {
    setBusy(g);
    await data.review(lessonId, g);
    setBusy(null);
    onNext();
  };

  return (
    <div className="anim-fade rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="mb-1 flex items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-[0.12em]">
        <span className="flex items-center gap-1.5" style={{ color: track.color }}>
          <TrackIcon id={track.id} color={track.color} className="size-3.5" /> {track.title}
        </span>
        <span className="text-mute">
          {n} / {of}
        </span>
      </div>
      <div className="text-[19px] font-semibold leading-snug text-ink">{lesson.title}</div>
      <div className="mt-1 text-[13px] text-mute">
        {LEVELS[m.level]} · пройдено {m.total} раз · свежесть {Math.round(m.fresh * 100)}%
      </div>

      <div className="mt-4">
        {qs === null ? (
          <SkeletonText lines={3} />
        ) : qs.length ? (
          <>
            <div className="mb-2 text-[13.5px] text-dim">Ответь вслух или в голове, не подглядывая:</div>
            <ol className="grid gap-3">
              {qs.slice(0, 3).map((q, i) => (
                <li key={i} className="rounded-xl bg-raised/60 p-3">
                  <div className="text-[15px] font-medium text-ink">{q.q}</div>
                  {open && <Markdown className="anim-fade mt-2 text-[14px] [&_p]:my-1.5">{q.a}</Markdown>}
                </li>
              ))}
            </ol>
          </>
        ) : (
          <div className="rounded-xl bg-raised/60 p-3 text-[15px] text-ink">
            Расскажи своими словами: <span className="text-dim">{lesson.summary}</span>. Что там главное, что спросят, где подвох?
          </div>
        )}
      </div>

      {!open ? (
        <Button className="mt-4" variant="secondary" icon={<Eye className="size-4" />} onClick={() => setOpen(true)}>
          {qs?.length ? "Показать ответы" : "Готово, оценить себя"}
        </Button>
      ) : (
        <div className="mt-4">
          <div className="mb-2 text-[13px] text-mute">Насколько хорошо вспомнил?</div>
          <div className="grid grid-cols-3 gap-2">
            <Button variant="secondary" loading={busy === "again"} onClick={() => grade("again")}>Забыл</Button>
            <Button variant="secondary" loading={busy === "hard"} onClick={() => grade("hard")}>С трудом</Button>
            <Button variant="primary" loading={busy === "good"} onClick={() => grade("good")} icon={<Check className="size-4" />}>Помню</Button>
          </div>
          <Link to={`/l/${lesson.id}`} className="mt-3 inline-flex items-center gap-1 text-[13px] text-dim hover:text-ink">
            перечитать урок <ChevronRight className="size-3.5" />
          </Link>
        </div>
      )}
    </div>
  );
}

/** Карта свежести: каждая пройденная тема — плитка своего цвета. */
export function HeatGrid({ lessons }: { lessons?: Lesson[] }) {
  const data = useData();
  const groups = useMemo(
    () =>
      TRACKS.map((t) => ({ t, ls: (lessons ?? t.lessons).filter((l) => l.track === t.id && l.ready && data.reviews[l.id]) })).filter((g) => g.ls.length),
    [data.reviews, lessons],
  );
  if (!groups.length) return <div className="rounded-2xl border border-dashed border-line p-5 text-center text-[13.5px] text-mute">Пройденных тем пока нет.</div>;
  return (
    <div className="grid gap-3">
      {groups.map(({ t, ls }) => (
        <div key={t.id} className="flex items-start gap-3">
          <Link to={`/t/${t.id}`} className="flex w-36 shrink-0 items-center gap-2 truncate pt-1 text-[12.5px] text-dim hover:text-ink max-sm:w-24">
            <TrackIcon id={t.id} color={t.color} className="size-3.5 shrink-0" />
            <span className="truncate">{t.title}</span>
          </Link>
          <div className="flex flex-wrap gap-1.5">
            {ls.map((l) => {
              const m = masteryOf(l.id, data);
              return (
                <Link
                  key={l.id}
                  to={`/l/${l.id}`}
                  title={`${l.title} · ${LEVELS[m.level]} · свежесть ${Math.round(m.fresh * 100)}% · ×${m.total}`}
                  className="flex h-7 min-w-7 items-center justify-center rounded-lg px-1.5 font-mono text-[11px] font-bold text-bg transition hover:scale-110"
                  style={{ background: heatColor(m), opacity: heatOpacity(m) }}
                >
                  {m.total}
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
