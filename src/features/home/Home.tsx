import { ArrowRight, Code2, Mic, Play } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { LESSONS, ROUTES, TRACKS, lessonById } from "../../content/catalog";
import { useApi } from "../../lib/hooks";
import { PROBLEMS } from "../../problems";
import { Card, Progress, SectionTitle } from "../../ui/misc";
import { cx } from "../../ui/cx";

export function Home() {
  const { progress, submissions } = useData();
  const { data: activity } = useApi<{ day: string; count: number }[]>("/activity");
  const { data: interviews } = useApi<{ score: number | null }[]>("/interviews");

  const ready = LESSONS.filter((l) => l.ready);
  const done = ready.filter((l) => progress[l.id]?.status === "done").length;
  const solved = Object.values(submissions).filter((s) => s.solved).length;
  const scored = (interviews ?? []).filter((i) => i.score !== null);
  const avg = scored.length ? Math.round(scored.reduce((a, i) => a + (i.score ?? 0), 0) / scored.length) : null;

  // продолжить: последний начатый урок, иначе первый готовый урок основного маршрута
  const doing = Object.entries(progress)
    .filter(([, v]) => v.status === "doing")
    .sort((a, b) => b[1].at - a[1].at)
    .map(([id]) => lessonById(id))
    .find((l) => l?.ready);
  const next =
    doing ??
    ROUTES.flatMap((r) => r.lessons)
      .map(lessonById)
      .find((l) => l?.ready && progress[l.id]?.status !== "done");
  const nextTrack = next && TRACKS.find((t) => t.id === next.track);

  return (
    <div className="pb-12">
      <PageHeader eyebrow={greeting()} title="Что учим сегодня" />

      <div className="grid gap-6 px-5 pt-4 md:px-10">
        {next && (
          <Link
            to={`/l/${next.id}`}
            className="group relative overflow-hidden rounded-2xl border border-line bg-surface p-5 transition hover:border-line-strong md:p-6"
          >
            <div
              className="pointer-events-none absolute -right-20 -top-20 size-64 rounded-full opacity-25 blur-3xl"
              style={{ background: nextTrack?.color }}
            />
            <div className="relative flex items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: nextTrack?.color }}>
                  {doing ? "Продолжить" : "Следующий урок"} · {nextTrack?.title}
                </div>
                <div className="mt-1.5 text-[19px] font-semibold leading-snug text-ink md:text-[22px]">{next.title}</div>
                <div className="mt-1 line-clamp-2 text-[14px] text-mute">{next.summary}</div>
              </div>
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink transition group-hover:scale-105">
                <Play className="ml-0.5 size-5" fill="currentColor" />
              </div>
            </div>
          </Link>
        )}

        <div className="grid grid-cols-3 gap-2.5 md:gap-4">
          <Stat label="Уроков" value={`${done}/${ready.length}`} sub={`из ${LESSONS.length} в плане`} />
          <Stat label="Задач" value={`${solved}/${PROBLEMS.length}`} sub="решено" />
          <Stat label="Интервью" value={avg === null ? "—" : `${avg}`} sub={scored.length ? `средний балл · ${scored.length}` : "ещё не было"} />
        </div>

        <div className="grid gap-2.5 sm:grid-cols-2 md:gap-4">
          <QuickLink to="/problems" icon={<Code2 className="size-5" />} title="Решить задачу" sub="Python или JS, судья в браузере" />
          <QuickLink to="/interview" icon={<Mic className="size-5" />} title="Пройти интервью" sub="Отвечаешь голосом, ИИ оценивает" />
        </div>

        <section>
          <SectionTitle>Активность</SectionTitle>
          <Card className="p-4">
            <Heatmap days={activity ?? []} />
          </Card>
        </section>

        <section>
          <SectionTitle>Маршруты</SectionTitle>
          <div className="grid gap-2.5 md:grid-cols-3 md:gap-4">
            {ROUTES.map((r) => {
              const total = r.lessons.length;
              const d = r.lessons.filter((id) => progress[id]?.status === "done").length;
              const first = r.lessons.map(lessonById).find((l) => l?.ready && progress[l.id]?.status !== "done");
              return (
                <Link key={r.id} to={first ? `/l/${first.id}` : "/tracks"} className="rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong">
                  <div className="font-medium text-ink">{r.title}</div>
                  <div className="mt-1 line-clamp-2 min-h-[2.6em] text-[13px] leading-snug text-mute">{r.blurb}</div>
                  <Progress value={d / total} className="mt-3" />
                  <div className="mt-1.5 font-mono text-[11px] text-mute">
                    {d}/{total} · готово {r.lessons.filter((id) => lessonById(id)?.ready).length}
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  return h < 5 ? "Ночь" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
}

function Stat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <Card className="px-3.5 py-3 md:px-5 md:py-4">
      <div className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-mute">{label}</div>
      <div className="mt-1 font-mono text-[22px] font-semibold tabular-nums text-ink md:text-[28px]">{value}</div>
      <div className="truncate text-[11.5px] text-mute md:text-[12.5px]">{sub}</div>
    </Card>
  );
}

function QuickLink({ to, icon, title, sub }: { to: string; icon: ReactNode; title: string; sub: string }) {
  return (
    <Link to={to} className="group flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong">
      <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-raised text-accent">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-ink">{title}</div>
        <div className="truncate text-[13px] text-mute">{sub}</div>
      </div>
      <ArrowRight className="size-4 text-mute transition group-hover:translate-x-0.5 group-hover:text-ink" />
    </Link>
  );
}

/** Календарь активности: год на десктопе, полгода на планшете, 4 месяца на телефоне. */
function Heatmap({ days }: { days: { day: string; count: number }[] }) {
  const map = new Map(days.map((d) => [d.day, d.count]));
  const today = new Date(Date.now() + 5 * 3600_000);
  const weeks = 52;
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + (6 - ((end.getUTCDay() + 6) % 7)));
  const cols: { day: string; count: number; future: boolean }[][] = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const col = [];
    for (let d = 6; d >= 0; d--) {
      const date = new Date(end);
      date.setUTCDate(date.getUTCDate() - w * 7 - d);
      const key = date.toISOString().slice(0, 10);
      col.push({ day: key, count: map.get(key) ?? 0, future: date > today });
    }
    cols.push(col);
  }
  const total = days.reduce((a, d) => a + d.count, 0);
  const level = (c: number) => (c === 0 ? 0 : c < 2 ? 1 : c < 4 ? 2 : c < 7 ? 3 : 4);
  const bg = ["var(--color-raised)", "#3d4a22", "#6a8a2d", "#9cc744", "var(--color-accent)"];

  return (
    <div>
      <div className="flex gap-[3px]">
        {cols.map((col, w) => (
          <div key={w} className={cx("grid flex-1 gap-[3px]", w < 52 - 17 && "max-md:hidden", w < 52 - 30 && "max-lg:hidden")}>
            {col.map((c) => (
              <div
                key={c.day}
                title={`${c.day}: ${c.count}`}
                className="aspect-square rounded-[3px]"
                style={{ background: c.future ? "transparent" : bg[level(c.count)] }}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2.5 text-[12px] text-mute">
        {total ? `${total} действий за год` : "Пройди урок, реши задачу или интервью — здесь появится след."}
      </div>
    </div>
  );
}
