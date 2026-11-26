import { Check, ChevronRight, Code2, Mic, Play, Star } from "lucide-react";
import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { PageHeader } from "../../app/Layout";
import { useData, type Status } from "../../app/data";
import { lessonById, trackById } from "../../content/catalog";
import { PROFESSIONS, professionById, professionLessons, SEGMENTS, segmentLessons, segmentUsage, type Profession, type Segment } from "../../content/roadmaps";
import { useLocalStorage } from "../../lib/hooks";
import { PROBLEMS } from "../../problems";
import { Button } from "../../ui/Button";
import { Sheet } from "../../ui/Sheet";
import { Badge, Progress, SectionTitle } from "../../ui/misc";
import { cx } from "../../ui/cx";

export const PRIMARY_KEY = "tl.profession";
export function usePrimaryProfession() {
  return useLocalStorage<string>(PRIMARY_KEY, "backend-java");
}

type ProgressMap = Record<string, { status: Status }>;
export function stats(ids: string[], progress: ProgressMap) {
  const ready = ids.filter((id) => lessonById(id)?.ready).length;
  const done = ids.filter((id) => progress[id]?.status === "done").length;
  return { total: ids.length, ready, done };
}

/** Первый готовый, но не пройденный урок профессии — по порядку этапов. */
export function nextInProfession(p: Profession, progress: ProgressMap) {
  return professionLessons(p)
    .map(lessonById)
    .find((l) => l?.ready && progress[l.id]?.status !== "done");
}

const SHORT: Record<string, string> = {
  "backend-java": "Java",
  "backend-python": "Python",
  devops: "DevOps",
  "ai-swe": "AI SWE",
  "ai-research": "Research",
  embedded: "Embedded",
  frontend: "Frontend",
};

// ── Список профессий + матрица общих сегментов ─────────────────

export function RoadmapsPage() {
  const { progress } = useData();
  const [primary] = usePrimaryProfession();
  const ordered = [...PROFESSIONS].sort((a, b) => (a.id === primary ? -1 : b.id === primary ? 1 : 0));
  const segs = Object.values(SEGMENTS)
    .map((s) => ({ s, used: segmentUsage(s.id) }))
    .sort((a, b) => b.used.length - a.used.length);

  return (
    <div className="pb-12">
      <PageHeader title="Роадмапы" eyebrow="Профессии" />
      <div className="px-5 pt-1 md:hidden">
        <p className="text-[14px] text-mute">Профессия = этапы из сегментов. Сегменты общие: пройденное засчитывается во всех профессиях сразу.</p>
      </div>
      <div className="grid gap-8 px-5 pt-4 md:px-10">
        <p className="hidden max-w-2xl text-[15px] text-mute md:block">
          Профессия = этапы из сегментов. Сегменты общие: «Сеть» у бэкендера, DevOps и фронтендера одна и та же — пройденный урок засчитывается во всех профессиях сразу.
        </p>
        <div className="grid gap-2.5 md:grid-cols-2 md:gap-3 xl:grid-cols-3">
          {ordered.map((p) => {
            const st = stats(professionLessons(p), progress);
            const segCount = new Set(p.stages.flatMap((x) => x.segments)).size;
            return (
              <Link key={p.id} to={`/roadmaps/${p.id}`} className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong">
                <div className="pointer-events-none absolute -right-16 -top-16 size-40 rounded-full opacity-[0.12] blur-2xl" style={{ background: p.color }} />
                <div className="relative">
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full" style={{ background: p.color }} />
                    <span className="truncate font-medium text-ink">{p.title}</span>
                    {p.id === primary && (
                      <Badge tone="accent" className="ml-auto">
                        <Star className="size-3" /> основная
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 line-clamp-2 min-h-[2.6em] text-[13px] leading-snug text-mute">{p.blurb}</div>
                  <div className="mt-3 flex gap-1">
                    {p.stages.map((s, i) => {
                      const ids = s.segments.flatMap((x) => SEGMENTS[x].lessons);
                      const v = stats(ids, progress);
                      return <Progress key={i} value={v.done / v.total} className="flex-1" />;
                    })}
                  </div>
                  <div className="mt-1.5 flex justify-between font-mono text-[11px] text-mute">
                    <span>
                      {p.stages.length} этапа · {segCount} сегментов
                    </span>
                    <span>
                      {st.done}/{st.total} · готово {st.ready}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <section>
          <SectionTitle>Общие сегменты</SectionTitle>
          {/* десктоп: матрица сегмент × профессия */}
          <div className="hidden overflow-x-auto rounded-2xl border border-line bg-surface md:block">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line">
                  <th className="px-4 py-2.5 text-left font-normal text-mute">Сегмент</th>
                  {PROFESSIONS.map((p) => (
                    <th key={p.id} className="px-2 py-2.5 text-center font-mono text-[11px] font-normal text-mute">
                      <Link to={`/roadmaps/${p.id}`} className="hover:text-ink">{SHORT[p.id]}</Link>
                    </th>
                  ))}
                  <th className="px-4 py-2.5 text-right font-normal text-mute">прогресс</th>
                </tr>
              </thead>
              <tbody>
                {segs.map(({ s, used }) => {
                  const v = stats(s.lessons, progress);
                  return (
                    <tr key={s.id} className="border-b border-line/60 last:border-0">
                      <td className="px-4 py-2">
                        <div className="text-ink">{s.title}</div>
                        <div className="text-[12px] text-mute">{s.blurb}</div>
                      </td>
                      {PROFESSIONS.map((p) => {
                        const on = used.includes(p);
                        return (
                          <td key={p.id} className="px-2 py-2 text-center">
                            {on ? <span className="inline-block size-3 rounded-full" style={{ background: p.color, opacity: v.done === v.total ? 1 : 0.75 }} /> : <span className="inline-block size-1 rounded-full bg-line-strong" />}
                          </td>
                        );
                      })}
                      <td className="px-4 py-2 text-right font-mono text-[11.5px] text-mute">
                        {v.done}/{v.total}
                        {v.ready > 0 && <span className="text-accent"> · {v.ready}</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {/* телефон: сегменты списком с точками профессий */}
          <div className="grid gap-2 md:hidden">
            {segs.slice(0, 14).map(({ s, used }) => {
              const v = stats(s.lessons, progress);
              return (
                <div key={s.id} className="rounded-xl border border-line bg-surface px-3.5 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] text-ink">{s.title}</span>
                    <span className="shrink-0 font-mono text-[11px] text-mute">{v.done}/{v.total}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {used.map((p) => (
                      <span key={p.id} className="rounded-md px-1.5 py-0.5 font-mono text-[10.5px]" style={{ color: p.color, background: `color-mix(in oklab, ${p.color} 12%, transparent)` }}>
                        {SHORT[p.id]}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Одна профессия ─────────────────────────────────────────────

export function RoadmapPage() {
  const { profId = "" } = useParams();
  const p = professionById(profId);
  const { progress } = useData();
  const [primary, setPrimary] = usePrimaryProfession();
  const [open, setOpen] = useState<Segment | null>(null);
  const navigate = useNavigate();
  if (!p) return <Navigate to="/roadmaps" replace />;
  const all = stats(professionLessons(p), progress);
  const next = nextInProfession(p, progress);

  const startInterview = () => {
    try {
      const cur = JSON.parse(localStorage.getItem("tl.interview") ?? "{}");
      localStorage.setItem("tl.interview", JSON.stringify({ level: "middle", lang: "en", count: 5, ...cur, role: p.role }));
    } catch {
      /* ignore */
    }
    navigate("/interview");
  };

  return (
    <div className="pb-14">
      <PageHeader
        title={p.title}
        eyebrow="Роадмап"
        back="/roadmaps"
        actions={
          <>
            {p.id !== primary && (
              <Button size="sm" variant="ghost" icon={<Star className="size-4" />} onClick={() => setPrimary(p.id)} className="max-md:px-2">
                <span className="max-md:hidden">Сделать основной</span>
              </Button>
            )}
            <Button size="sm" icon={<Mic className="size-4" />} onClick={startInterview} className="max-md:hidden">
              Интервью по роли
            </Button>
          </>
        }
      >
        <p className="mt-2 max-w-2xl text-[15px] text-mute">{p.blurb}</p>
      </PageHeader>

      <div className="max-w-5xl px-5 pt-4 md:px-10">
        <div className="flex items-center gap-3">
          <Progress value={all.done / all.total} className="flex-1" />
          <span className="font-mono text-[12px] text-mute">
            {all.done}/{all.total} · готово {all.ready}
          </span>
        </div>

        {next && (
          <Link to={`/l/${next.id}`} className="group mt-5 flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: p.color }}>
                Дальше по роадмапу · {trackById(next.track)?.title}
              </div>
              <div className="mt-1 font-semibold text-ink">{next.title}</div>
              <div className="line-clamp-1 text-[13px] text-mute">{next.summary}</div>
            </div>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition group-hover:scale-105">
              <Play className="ml-0.5 size-4" fill="currentColor" />
            </div>
          </Link>
        )}

        <ol className="relative mt-8">
          {p.stages.map((stage, si) => {
            const ids = stage.segments.flatMap((x) => SEGMENTS[x].lessons);
            const v = stats(ids, progress);
            const complete = v.done === v.total;
            return (
              <li key={si} className="relative pb-8 pl-11 last:pb-0">
                {si < p.stages.length - 1 && <span className="absolute bottom-0 left-[15px] top-9 w-px bg-line-strong" />}
                <span
                  className={cx("absolute left-0 top-0 flex size-8 items-center justify-center rounded-full border font-mono text-[13px]", complete ? "border-accent bg-accent text-accent-ink" : "border-line-strong bg-surface text-ink")}
                >
                  {complete ? <Check className="size-4" /> : si + 1}
                </span>
                <div className="flex items-baseline justify-between gap-3 pt-1">
                  <h2 className="text-[17px] font-semibold text-ink">{stage.title}</h2>
                  <span className="font-mono text-[11.5px] text-mute">
                    {v.done}/{v.total}
                  </span>
                </div>
                <div className="mt-3 grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                  {stage.segments.map((sid) => (
                    <SegmentCard key={sid} seg={SEGMENTS[sid]} current={p} onOpen={() => setOpen(SEGMENTS[sid])} />
                  ))}
                </div>
              </li>
            );
          })}
        </ol>

        <Button size="lg" block icon={<Mic className="size-4" />} onClick={startInterview} className="mt-10 md:hidden">
          Интервью по роли
        </Button>
      </div>

      <Sheet open={!!open} onClose={() => setOpen(null)} title={open?.title ?? ""}>
        {open && <SegmentSheet seg={open} current={p} />}
      </Sheet>
    </div>
  );
}

function LessonDot({ id }: { id: string }) {
  const { progress } = useData();
  const l = lessonById(id);
  const st = progress[id]?.status;
  return (
    <span
      title={l?.title}
      className={cx(
        "h-1.5 flex-1 rounded-full",
        st === "done" ? "bg-accent" : st === "doing" ? "bg-blue" : l?.ready ? "bg-line-strong" : "border border-dashed border-line-strong",
      )}
    />
  );
}

function SegmentCard({ seg, current, onOpen }: { seg: Segment; current: Profession; onOpen: () => void }) {
  const { progress } = useData();
  const v = stats(seg.lessons, progress);
  const others = segmentUsage(seg.id).filter((p) => p.id !== current.id);
  return (
    <button type="button" onClick={onOpen} className="group flex flex-col rounded-2xl border border-line bg-surface p-3.5 text-left transition hover:border-line-strong">
      <div className="flex w-full items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink">{seg.title}</div>
          <div className="mt-0.5 line-clamp-1 text-[12.5px] text-mute">{seg.blurb}</div>
        </div>
        <ChevronRight className="mt-0.5 size-4 shrink-0 text-mute transition group-hover:text-ink" />
      </div>
      <div className="mt-3 flex w-full gap-1">
        {seg.lessons.map((id) => (
          <LessonDot key={id} id={id} />
        ))}
      </div>
      <div className="mt-2 flex w-full items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-mute">
          {v.done}/{v.total}
          {v.ready > v.done && <span className="text-accent"> · {v.ready - v.done} ждут</span>}
        </span>
        {others.length > 0 && (
          <span className="truncate text-[11px] text-mute" title={others.map((o) => o.title).join(", ")}>
            ещё в {others.length} {others.length === 1 ? "профессии" : "профессиях"}
          </span>
        )}
      </div>
    </button>
  );
}

function SegmentSheet({ seg, current }: { seg: Segment; current: Profession }) {
  const { progress, submissions } = useData();
  const lessons = segmentLessons(seg);
  const others = segmentUsage(seg.id).filter((p) => p.id !== current.id);
  const problems = (seg.problems ?? []).map((id) => PROBLEMS.find((x) => x.id === id)).filter(Boolean);
  return (
    <div className="grid gap-5 pt-1">
      <p className="text-[14px] text-mute">{seg.blurb}</p>
      <div className="grid gap-1.5">
        {lessons.map((l) => {
          const st = progress[l.id]?.status;
          const t = trackById(l.track);
          const body = (
            <>
              <span
                className={cx(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border",
                  st === "done" ? "border-accent/50 bg-accent/10 text-accent" : st === "doing" ? "border-blue/50 text-blue" : "border-line text-mute",
                )}
              >
                {st === "done" ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cx("block truncate text-[14px]", l.ready ? "text-ink" : "text-dim")}>{l.title}</span>
                <span className="block truncate text-[12px] text-mute">
                  {t?.title} · {l.summary}
                </span>
              </span>
              {!l.ready && <Badge>скоро</Badge>}
            </>
          );
          return l.ready ? (
            <Link key={l.id} to={`/l/${l.id}`} className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 transition hover:border-line-strong">
              {body}
            </Link>
          ) : (
            <div key={l.id} className="flex items-center gap-3 rounded-xl border border-dashed border-line px-3 py-2.5 opacity-75">
              {body}
            </div>
          );
        })}
      </div>
      {problems.length > 0 && (
        <div>
          <SectionTitle>Задачи</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {problems.map((pr) => (
              <Link
                key={pr!.id}
                to={`/problems/${pr!.id}`}
                className={cx("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[13px] transition", submissions[pr!.id]?.solved ? "border-ok/40 text-ok" : "border-line text-dim hover:text-ink")}
              >
                <Code2 className="size-3.5" />
                {pr!.title}
              </Link>
            ))}
          </div>
        </div>
      )}
      {others.length > 0 && (
        <div>
          <SectionTitle>Тот же сегмент в профессиях</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {others.map((o) => (
              <Link key={o.id} to={`/roadmaps/${o.id}`} className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-[12.5px] text-dim hover:text-ink">
                <span className="size-1.5 rounded-full" style={{ background: o.color }} />
                {o.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
