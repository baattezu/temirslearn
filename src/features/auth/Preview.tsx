import { BookOpen, Code2, House, Mic, NotebookPen, Play } from "lucide-react";
import { TRACKS } from "../../content/catalog";

/** Демо-превью главной для экрана входа: только каталог из бандла, никаких данных пользователя. */
export function LearnPreview() {
  const bars = [0.8, 0.35, 0.6, 0.15];
  return (
    <div className="flex min-h-dvh">
      <aside className="hidden w-[248px] shrink-0 border-r border-line bg-surface/60 p-4 md:block">
        <div className="mb-6 h-6 w-36 rounded bg-raised" />
        {[House, BookOpen, Code2, Mic, NotebookPen].map((I, i) => (
          <div key={i} className="mb-1 flex h-9 items-center gap-3 px-2 text-dim">
            <I className="size-[18px]" />
            <div className="h-3 w-20 rounded bg-raised" />
          </div>
        ))}
        <div className="mt-6 grid gap-2.5 px-2">
          {TRACKS.slice(0, 11).map((t) => (
            <div key={t.id} className="flex items-center gap-2.5 text-[13px] text-dim">
              <span className="size-1.5 rounded-full" style={{ background: t.color }} />
              {t.title}
            </div>
          ))}
        </div>
      </aside>
      <div className="flex-1 p-5 md:p-10">
        <div className="h-3 w-24 rounded bg-raised" />
        <div className="mt-3 text-[30px] font-semibold text-ink">Что учим сегодня</div>
        <div className="mt-6 flex items-center gap-4 rounded-2xl border border-line bg-surface p-6">
          <div className="flex-1">
            <div className="text-[12px] uppercase tracking-widest text-rose">Базы данных</div>
            <div className="mt-2 text-[22px] font-semibold text-ink">Когда Postgres берёт индекс</div>
          </div>
          <div className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-ink">
            <Play className="size-5" fill="currentColor" />
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-3">
          {["3/5", "7/11", "72"].map((v) => (
            <div key={v} className="rounded-2xl border border-line bg-surface p-4 font-mono text-[26px] text-ink">
              {v}
            </div>
          ))}
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {TRACKS.slice(8, 11).map((t, i) => (
            <div key={t.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="font-medium text-ink">{t.title}</div>
              <div className="mt-1 text-[13px] text-mute">{t.blurb}</div>
              <div className="mt-3 h-1.5 rounded-full bg-line">
                <div className="h-full rounded-full bg-accent" style={{ width: `${bars[i] * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 grid grid-flow-col grid-rows-7 gap-[3px] rounded-2xl border border-line bg-surface p-4">
          {Array.from({ length: 7 * 40 }, (_, i) => (
            <div key={i} className="aspect-square rounded-[3px]" style={{ background: (i * 7919) % 11 < 3 ? "#6a8a2d" : (i * 7919) % 13 < 2 ? "var(--color-accent)" : "var(--color-raised)" }} />
          ))}
        </div>
      </div>
    </div>
  );
}
