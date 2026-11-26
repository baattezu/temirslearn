import { Check, Circle, CircleDot, Clock } from "lucide-react";
import { Link, Navigate, useParams } from "react-router";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { trackById } from "../../content/catalog";
import { Badge, Progress } from "../../ui/misc";
import { cx } from "../../ui/cx";

export function TrackPage() {
  const { trackId = "" } = useParams();
  const track = trackById(trackId);
  const { progress } = useData();
  if (!track) return <Navigate to="/tracks" replace />;
  const done = track.lessons.filter((l) => progress[l.id]?.status === "done").length;

  return (
    <div className="pb-12">
      <PageHeader title={track.title} eyebrow={track.group} back="/tracks">
        <p className="mt-2 max-w-2xl text-[15px] text-mute">{track.blurb}</p>
      </PageHeader>
      <div className="px-5 pt-3 md:hidden">
        <p className="text-[14px] text-mute">{track.blurb}</p>
      </div>
      <div className="max-w-3xl px-5 pt-5 md:px-10">
        <div className="mb-5 flex items-center gap-3">
          <Progress value={done / track.lessons.length} className="flex-1" />
          <span className="font-mono text-[12px] text-mute">
            {done}/{track.lessons.length}
          </span>
        </div>
        <ol className="grid gap-2">
          {track.lessons.map((l, i) => {
            const st = progress[l.id]?.status;
            const Icon = st === "done" ? Check : st === "doing" ? CircleDot : Circle;
            const body = (
              <>
                <div
                  className={cx(
                    "flex size-8 shrink-0 items-center justify-center rounded-full border font-mono text-[12px]",
                    st === "done" ? "border-accent/40 bg-accent/10 text-accent" : st === "doing" ? "border-blue/40 text-blue" : "border-line text-mute",
                  )}
                >
                  {st ? <Icon className="size-4" /> : i + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className={cx("font-medium", l.ready ? "text-ink" : "text-dim")}>{l.title}</div>
                  <div className="mt-0.5 line-clamp-1 text-[13px] text-mute">{l.summary}</div>
                </div>
                {l.ready ? (
                  <span className="hidden shrink-0 items-center gap-1 text-[12px] text-mute sm:flex">
                    <Clock className="size-3.5" /> {l.minutes} мин
                  </span>
                ) : (
                  <Badge>скоро</Badge>
                )}
              </>
            );
            return (
              <li key={l.id}>
                {l.ready ? (
                  <Link to={`/l/${l.id}`} className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-3.5 transition hover:border-line-strong">
                    {body}
                  </Link>
                ) : (
                  <div className="flex items-center gap-3.5 rounded-2xl border border-dashed border-line p-3.5 opacity-70">{body}</div>
                )}
              </li>
            );
          })}
        </ol>
        {track.lessons.some((l) => !l.ready) && (
          <p className="mt-5 text-[13px] leading-relaxed text-mute">
            Уроки «скоро» — план. Новый урок — это файл <code className="font-mono text-dim">src/content/lessons/{track.id}/&lt;slug&gt;.mdx</code>, попроси Claude написать его с виджетом.
          </p>
        )}
      </div>
    </div>
  );
}
