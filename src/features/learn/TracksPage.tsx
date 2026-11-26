import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { TRACKS } from "../../content/catalog";
import { Progress } from "../../ui/misc";

export function TracksPage() {
  const { progress } = useData();
  const groups = [...new Set(TRACKS.map((t) => t.group))];
  return (
    <div className="pb-12">
      <PageHeader title="Треки" eyebrow="Всё, что учим" />
      <div className="grid gap-8 px-5 pt-4 md:px-10">
        {groups.map((g) => (
          <section key={g}>
            <h2 className="mb-3 font-mono text-[12px] uppercase tracking-[0.12em] text-mute">{g}</h2>
            <div className="grid gap-2.5 md:grid-cols-2 md:gap-3 xl:grid-cols-3">
              {TRACKS.filter((t) => t.group === g).map((t) => {
                const ready = t.lessons.filter((l) => l.ready).length;
                const done = t.lessons.filter((l) => progress[l.id]?.status === "done").length;
                return (
                  <Link
                    key={t.id}
                    to={`/t/${t.id}`}
                    className="group flex items-center gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="size-2 shrink-0 rounded-full" style={{ background: t.color }} />
                        <span className="truncate font-medium text-ink">{t.title}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[13px] leading-snug text-mute">{t.blurb}</div>
                      <div className="mt-3 flex items-center gap-3">
                        <Progress value={done / t.lessons.length} className="flex-1" />
                        <span className="shrink-0 font-mono text-[11px] text-mute">
                          {done}/{t.lessons.length}
                          {ready > 0 && ready < t.lessons.length && <span className="text-accent"> · {ready} готово</span>}
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="size-4 shrink-0 text-mute transition group-hover:text-ink" />
                  </Link>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
