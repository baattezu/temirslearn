import { MDXProvider } from "@mdx-js/react";
import { Check, ChevronLeft, ChevronRight, Clock, NotebookPen } from "lucide-react";
import { useEffect, useState, type ComponentType } from "react";
import { Link, Navigate, useParams } from "react-router";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { lessonById, trackById } from "../../content/catalog";
import { mdxComponents } from "../../content/mdx";
import { useApi, useIsPhone } from "../../lib/hooks";
import { Button, IconButton } from "../../ui/Button";
import { Sheet } from "../../ui/Sheet";
import { Spinner } from "../../ui/misc";
import { NoteEditor, type Note } from "../notes/NoteEditor";

export function LessonPage() {
  const params = useParams();
  const id = params["*"] ?? "";
  const lesson = lessonById(id);
  const track = lesson && trackById(lesson.track);
  const { progress, setStatus } = useData();
  const phone = useIsPhone();
  const [Content, setContent] = useState<ComponentType | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);

  useEffect(() => {
    setContent(null);
    lesson?.load?.().then((m) => setContent(() => m.default));
  }, [lesson]);

  const status = lesson ? progress[lesson.id]?.status : undefined;
  useEffect(() => {
    if (lesson?.ready && !status) void setStatus(lesson.id, "doing");
  }, [lesson, status, setStatus]);

  if (!lesson || !track || !lesson.ready) return <Navigate to={track ? `/t/${track.id}` : "/tracks"} replace />;

  const ready = track.lessons.filter((l) => l.ready);
  const pos = ready.findIndex((l) => l.id === lesson.id);
  const prev = ready[pos - 1];
  const next = ready[pos + 1];
  const done = status === "done";

  return (
    <div className="pb-16">
      <PageHeader
        back={`/t/${track.id}`}
        eyebrow={<Link to={`/t/${track.id}`} className="hover:text-ink" style={{ color: track.color }}>{track.title}</Link>}
        title={lesson.title}
        actions={
          phone ? (
            <IconButton label="Конспект" onClick={() => setNotesOpen(true)}>
              <NotebookPen className="size-5" />
            </IconButton>
          ) : null
        }
      >
        <div className="mt-2 flex items-center gap-4 text-[13px] text-mute">
          <span className="flex items-center gap-1.5"><Clock className="size-3.5" /> {lesson.minutes} мин</span>
          {done && <span className="flex items-center gap-1.5 text-accent"><Check className="size-3.5" /> изучено</span>}
        </div>
      </PageHeader>

      <div className="flex gap-10 px-5 md:px-10">
        <article className="min-w-0 max-w-[720px] flex-1 pt-4">
          {phone && (
            <div className="mb-4">
              <div className="font-mono text-[11px] uppercase tracking-[0.14em]" style={{ color: track.color }}>{track.title}</div>
              <h1 className="mt-1 text-[24px] font-semibold leading-tight tracking-tight text-ink">{lesson.title}</h1>
            </div>
          )}
          {Content ? (
            <MDXProvider components={mdxComponents}>
              <div className="prose-lab">
                <Content />
              </div>
            </MDXProvider>
          ) : (
            <div className="flex justify-center py-20 text-mute"><Spinner /></div>
          )}

          <div className="mt-12 grid gap-3 border-t border-line pt-6">
            <Button
              variant={done ? "secondary" : "primary"}
              size="lg"
              block
              icon={<Check className="size-4" />}
              onClick={() => setStatus(lesson.id, done ? "doing" : "done")}
            >
              {done ? "Изучено — снять отметку" : "Отметить изученным"}
            </Button>
            <div className="grid grid-cols-2 gap-3">
              {prev ? (
                <Link to={`/l/${prev.id}`} className="flex min-h-14 items-center gap-2 rounded-xl border border-line p-3 text-[13px] text-dim hover:border-line-strong hover:text-ink">
                  <ChevronLeft className="size-4 shrink-0" /> <span className="line-clamp-2">{prev.title}</span>
                </Link>
              ) : <span />}
              {next ? (
                <Link to={`/l/${next.id}`} className="flex min-h-14 items-center justify-end gap-2 rounded-xl border border-line p-3 text-right text-[13px] text-dim hover:border-line-strong hover:text-ink">
                  <span className="line-clamp-2">{next.title}</span> <ChevronRight className="size-4 shrink-0" />
                </Link>
              ) : <span />}
            </div>
          </div>
        </article>

        {!phone && (
          <aside className="sticky top-6 hidden h-[calc(100dvh-48px)] w-[340px] shrink-0 flex-col pt-4 xl:flex">
            <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">Мой конспект</div>
            <LessonNotes lessonId={lesson.id} title={lesson.title} />
          </aside>
        )}
      </div>

      {!phone && (
        <div className="fixed bottom-6 right-6 xl:hidden">
          <Button variant="secondary" size="lg" icon={<NotebookPen className="size-4" />} onClick={() => setNotesOpen(true)} className="shadow-xl">
            Конспект
          </Button>
        </div>
      )}
      <Sheet open={notesOpen} onClose={() => setNotesOpen(false)} title="Мой конспект" tall>
        <div className="flex h-full flex-col pt-1">
          <LessonNotes lessonId={lesson.id} title={lesson.title} />
        </div>
      </Sheet>
    </div>
  );
}

function LessonNotes({ lessonId, title }: { lessonId: string; title: string }) {
  const { data, loading } = useApi<Note[]>(`/notes?lesson=${encodeURIComponent(lessonId)}`);
  if (loading && !data) return <div className="flex justify-center py-10 text-mute"><Spinner /></div>;
  return (
    <NoteEditor
      note={data?.[0] ?? null}
      lessonId={lessonId}
      defaultTitle={title}
      placeholder="Своими словами: что понял, что спросят, где споткнулся…"
    />
  );
}
