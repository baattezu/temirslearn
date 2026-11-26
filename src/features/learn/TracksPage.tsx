import { ChevronRight } from "lucide-react";
import { Link } from "react-router";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { GROUPS, trackById } from "../../content/catalog";
import { heatColor, heatOpacity, indexOf, masteryOf } from "../../lib/mastery";
import { TrackIcon } from "../../ui/TrackIcon";

export function TracksPage() {
  const data = useData();
  return (
    <div className="pb-12">
      <PageHeader title="Треки" eyebrow="От «почему» к «как»">
        <p className="mt-2 max-w-2xl text-[15px] text-mute">
          Порядок не случайный: сначала история и математика, потом железо, алгоритмы и ремесло, и только потом языки — они лишь форма.
        </p>
      </PageHeader>
      <div className="grid grid-cols-1 gap-8 px-5 pt-4 md:px-10">
        {GROUPS.map((g, gi) => (
          <section key={g.id}>
            <h2 className="mb-3 flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em] text-mute">
              <span className="text-line-strong">{String(gi + 1).padStart(2, "0")}</span> {g.title}
            </h2>
            <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2 md:gap-3 xl:grid-cols-3">
              {g.tracks.map((id) => {
                const t = trackById(id)!;
                const ready = t.lessons.filter((l) => l.ready).length;
                const idx = Math.round(indexOf(t.lessons, data) * 100);
                return (
                  <Link key={t.id} to={`/t/${t.id}`} className="group flex min-w-0 items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong">
                    <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-raised">
                      <TrackIcon id={t.id} color={ready ? t.color : "var(--color-mute)"} className="size-6" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium text-ink">{t.title}</span>
                        {idx > 0 && <span className="ml-auto font-mono text-[12px] text-dim">{idx}</span>}
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-mute">{t.blurb}</div>
                      <div className="mt-2.5 flex gap-[3px]">
                        {t.lessons.map((l) => {
                          const m = masteryOf(l.id, data);
                          return (
                            <span
                              key={l.id}
                              className="h-1.5 flex-1 rounded-full"
                              style={{
                                background: !l.ready ? "transparent" : m.heat === "none" ? "var(--color-line)" : heatColor(m),
                                opacity: m.heat === "none" ? 1 : heatOpacity(m),
                                border: l.ready ? undefined : "1px dashed var(--color-line)",
                              }}
                            />
                          );
                        })}
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
