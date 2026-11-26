import { MDXProvider } from "@mdx-js/react";
import { Check, ChevronLeft, ChevronRight, Clock, HelpCircle, Mic, NotebookPen, Repeat, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { lessonQuestions, type QA } from "../../content/questions";
import { api } from "../../lib/api";
import { LEVELS, heatColor, masteryOf } from "../../lib/mastery";
import { ErrorNote } from "../../ui/misc";
import { useHighlights } from "./Highlights";
import { LessonSkeleton, Skeleton } from "../../ui/Skeleton";
import { cx } from "../../ui/cx";
import { QuestionList } from "./QuestionList";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { lessonById, trackById } from "../../content/catalog";
import { mdxComponents } from "../../content/mdx";
import { useApi, useIsPhone } from "../../lib/hooks";
import { Button, IconButton } from "../../ui/Button";
import { Sheet } from "../../ui/Sheet";
import { NoteEditor, type Note } from "../notes/NoteEditor";

export function LessonPage() {
  const params = useParams();
  const id = params["*"] ?? "";
  const lesson = lessonById(id);
  const track = lesson && trackById(lesson.track);
  const { progress, setStatus, settings } = useData();
  const phone = useIsPhone();
  const [Content, setContent] = useState<ComponentType | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const articleRef = useRef<HTMLDivElement>(null);
  const { toolbar } = useHighlights(articleRef, id, !!Content);
  const [questions, setQuestions] = useState<QA[]>([]);
  useEffect(() => {
    setQuestions([]);
    if (lesson) void lessonQuestions(lesson.id).then(setQuestions);
  }, [lesson]);

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
          {questions.length > 0 && settings.preQuestions !== false && <BeforeReading questions={questions} />}
          {Content ? (
            <MDXProvider components={mdxComponents}>
              <div className={cx("prose-lab", settings.lessonFont === "s" && "font-s", settings.lessonFont === "l" && "font-l")} ref={articleRef}>
                <Content />
              </div>
            </MDXProvider>
          ) : (
            <LessonSkeleton />
          )}

          {questions.length > 0 && Content && (
            <section className="mt-12">
              <h2 className="mb-1 text-[20px] font-semibold text-ink">Вопросы с собеседований</h2>
              <p className="mb-4 text-[13.5px] text-mute">Те, что были в начале. Ответь сам, потом открой и сравни.</p>
              <QuestionList items={questions} />
            </section>
          )}

          <div className="mt-12 grid gap-3 border-t border-line pt-6">
            {done ? (
              <MasteryPanel lessonId={lesson.id} title={lesson.title} summary={lesson.summary} questions={questions} />
            ) : (
              <Button variant="primary" size="lg" block icon={<Check className="size-4" />} onClick={() => setStatus(lesson.id, "done")}>
                Прошёл урок
              </Button>
            )}
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
        <div className="fixed bottom-6 right-[92px] xl:hidden">
          <Button variant="secondary" size="lg" icon={<NotebookPen className="size-4" />} onClick={() => setNotesOpen(true)} className="shadow-xl">
            Конспект
          </Button>
        </div>
      )}
      {toolbar}
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
  if (loading && !data) return <Skeleton className="h-full min-h-64 rounded-2xl" />;
  return (
    <NoteEditor
      note={data?.[0] ?? null}
      lessonId={lessonId}
      defaultTitle={title}
      placeholder="Своими словами: что понял, что спросят, где споткнулся…"
    />
  );
}

/** До чтения: вопросы без ответов. Попытка вспомнить до объяснения делает объяснение запоминаемым. */
function BeforeReading({ questions }: { questions: QA[] }) {
  return (
    <div className="not-prose mb-8 rounded-2xl border border-blue/25 bg-blue/[0.04] p-4 sm:p-5">
      <div className="mb-2 flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em] text-blue">
        <HelpCircle className="size-3.5" /> До чтения — попробуй ответить
      </div>
      <ol className="grid list-decimal gap-1.5 pl-5 text-[15px] leading-snug text-ink marker:font-mono marker:text-[12px] marker:text-mute">
        {questions.slice(0, 4).map((q, i) => (
          <li key={i} className="pl-1">{q.q}</li>
        ))}
      </ol>
      <p className="mt-3 text-[13px] text-mute">Не получилось — нормально, так и задумано. Ответы в конце урока.</p>
    </div>
  );
}

/** После прохождения: свежесть, ступень, повторение и устный зачёт. */
function MasteryPanel({ lessonId, title, summary, questions }: { lessonId: string; title: string; summary: string; questions: QA[] }) {
  const data = useData();
  const navigate = useNavigate();
  const m = masteryOf(lessonId, data);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const now = Date.now();
  const early = m.due !== null && now < m.due;
  const days = m.due ? Math.ceil((m.due - now) / 86_400_000) : 0;
  const score = data.topicScores[lessonId];

  const grade = async (g: "good" | "hard" | "again") => {
    setBusy(g);
    try {
      // до срока «помню» не двигает лестницу — только освежает
      await data.review(lessonId, early && g === "good" ? "hard" : g);
    } finally {
      setBusy(null);
    }
  };

  const exam = async () => {
    setBusy("exam");
    setErr(null);
    try {
      const focus = [summary, ...questions.map((q) => `Q: ${q.q}\nA: ${q.a}`)].join("\n\n");
      const { id } = await api<{ id: string }>("/interviews", {
        method: "POST",
        json: { topic: { id: lessonId, title, focus }, lang: "ru", count: 3 },
      });
      navigate(`/interview/${id}`);
    } catch (e) {
      setErr((e as Error).message);
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <div className="flex items-center gap-3">
        <div className="flex size-11 items-center justify-center rounded-full border-[3px]" style={{ borderColor: heatColor(m) }}>
          <Check className="size-5" style={{ color: heatColor(m) }} strokeWidth={2.6} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink">{LEVELS[m.level]}</div>
          <div className="text-[12.5px] text-mute">
            пройдено {m.total} раз · свежесть {Math.round(m.fresh * 100)}% ·{" "}
            {early ? `повтор через ${days} д` : "пора повторить"}
          </div>
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center gap-1.5 text-[13.5px] font-medium text-dim">
          <Repeat className="size-3.5" /> {early ? "Повторить раньше срока" : "Повтори: вспомни главное, не подглядывая"}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" loading={busy === "again"} onClick={() => grade("again")}>
            Забыл
          </Button>
          <Button variant="secondary" loading={busy === "hard"} onClick={() => grade("hard")}>
            С трудом
          </Button>
          <Button variant={early ? "secondary" : "primary"} loading={busy === "good"} onClick={() => grade("good")}>
            Помню
          </Button>
        </div>
        <p className="mt-2 text-[12px] leading-snug text-mute">
          «Помню» — следующий повтор через больший интервал, «Забыл» — лестница начинается заново.
          {early && " До срока повтор только освежает тему, интервал не растёт."}
        </p>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
        <Button variant="secondary" icon={<Mic className="size-4" />} loading={busy === "exam"} onClick={exam}>
          Устный зачёт
        </Button>
        <span className="text-[12.5px] text-mute">
          {score !== undefined ? (
            <>
              последний: <span className={score >= 70 ? "font-mono text-ok" : "font-mono text-amber"}>{score}</span> · 70+ даёт ступень «Объясняю»
            </>
          ) : (
            "3 вопроса голосом по теме, 70+ даёт ступень «Объясняю»"
          )}
        </span>
        <button
          type="button"
          onClick={async () => {
            await api(`/reviews/${encodeURIComponent(lessonId)}`, { method: "DELETE" });
            await data.setStatus(lessonId, "doing");
            location.reload();
          }}
          className="ml-auto flex items-center gap-1 text-[12px] text-mute hover:text-ink"
        >
          <RotateCcw className="size-3" /> сбросить
        </button>
      </div>
      {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
    </div>
  );
}
