import { ArrowRight, Flag, Keyboard, Mic, RotateCcw, Sparkles, Square, Trash2, Volume2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import type { Grade, Summary } from "../../../shared/interview";
import { PageHeader } from "../../app/Layout";
import { api } from "../../lib/api";
import { useApi, useIsPhone } from "../../lib/hooks";
import { Button, IconButton } from "../../ui/Button";
import { TextArea } from "../../ui/Field";
import { Card, ErrorNote, Spinner } from "../../ui/misc";
import { cx } from "../../ui/cx";
import { roleLabel, scoreTone } from "./InterviewHome";
import { speak, useRecorder } from "./recorder";
import type { Answer, Interview } from "./types";

type Phase = "ask" | "recording" | "transcribing" | "review" | "grading" | "graded";

export function InterviewSession() {
  const { id = "" } = useParams();
  const { data, error, setData } = useApi<Interview>(`/interviews/${id}`);
  if (error) return <Navigate to="/interview" replace />;
  if (!data)
    return (
      <div className="flex min-h-dvh items-center justify-center text-mute">
        <Spinner />
      </div>
    );
  return <Session iv={data} setIv={(f) => setData((d) => (d ? f(d) : d))} />;
}

function Session({ iv, setIv }: { iv: Interview; setIv: (f: (d: Interview) => Interview) => void }) {
  const phone = useIsPhone();
  const navigate = useNavigate();
  const firstOpen = iv.questions.findIndex((_, i) => !iv.answers.some((a) => a.idx === i));
  const [idx, setIdx] = useState(firstOpen === -1 ? iv.questions.length - 1 : firstOpen);
  const [showSummary, setShowSummary] = useState(!!iv.summary);
  const answer = iv.answers.find((a) => a.idx === idx);
  const allAnswered = iv.answers.length === iv.questions.length;
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  const finish = async () => {
    setFinishing(true);
    setFinishError(null);
    try {
      const summary = await api<Summary>(`/interviews/${iv.id}/finish`, { method: "POST" });
      setIv((d) => ({ ...d, summary, score: summary.score, finished_at: Date.now() }));
      setShowSummary(true);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setFinishError((e as Error).message);
    } finally {
      setFinishing(false);
    }
  };

  const remove = async () => {
    await api(`/interviews/${iv.id}`, { method: "DELETE" });
    navigate("/interview", { replace: true });
  };

  const title = `${roleLabel(iv.role)} · ${iv.level}`;

  return (
    <div className="pb-16">
      <PageHeader
        back="/interview"
        eyebrow="Интервью"
        title={title}
        actions={
          <IconButton label="Удалить интервью" onClick={remove}>
            <Trash2 className="size-4" />
          </IconButton>
        }
      />
      <div className="mx-auto grid max-w-3xl gap-5 px-5 pt-4 md:px-10">
        {/* Шаги */}
        <div className="flex items-center gap-1.5">
          {iv.questions.map((q, i) => {
            const a = iv.answers.find((x) => x.idx === i);
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setShowSummary(false);
                  setIdx(i);
                }}
                title={q.topic}
                className={cx(
                  "h-2 flex-1 rounded-full transition",
                  i === idx && !showSummary ? "ring-2 ring-ink/60 ring-offset-2 ring-offset-bg" : "",
                  a ? (a.score >= 7 ? "bg-ok" : a.score >= 5 ? "bg-amber" : "bg-bad") : "bg-line",
                )}
              />
            );
          })}
          {iv.summary && (
            <button
              type="button"
              onClick={() => setShowSummary(true)}
              className={cx("ml-1 rounded-full px-2.5 py-1 font-mono text-[12px]", showSummary ? "bg-raised text-ink" : "text-mute")}
            >
              итог
            </button>
          )}
        </div>

        {showSummary && iv.summary ? (
          <SummaryCard summary={iv.summary} />
        ) : (
          <QuestionBlock
            key={idx}
            iv={iv}
            idx={idx}
            answer={answer}
            phone={phone}
            onGraded={(a) => setIv((d) => ({ ...d, answers: [...d.answers.filter((x) => x.idx !== a.idx), a].sort((x, y) => x.idx - y.idx) }))}
            onNext={() => {
              const nextOpen = iv.questions.findIndex((_, i) => i > idx && !iv.answers.some((a) => a.idx === i));
              setIdx(nextOpen === -1 ? Math.min(idx + 1, iv.questions.length - 1) : nextOpen);
              window.scrollTo({ top: 0 });
            }}
            isLast={idx === iv.questions.length - 1}
          />
        )}

        {!showSummary && iv.answers.length > 0 && (allAnswered || idx === iv.questions.length - 1) && (
          <div className="grid gap-2">
            {finishError && <ErrorNote>{finishError}</ErrorNote>}
            <Button variant={allAnswered ? "primary" : "secondary"} size="lg" block loading={finishing} icon={<Flag className="size-4" />} onClick={finish}>
              {iv.summary ? "Пересчитать итог" : allAnswered ? "Завершить и получить итог" : `Завершить досрочно (${iv.answers.length}/${iv.questions.length})`}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function QuestionBlock({
  iv,
  idx,
  answer,
  phone,
  onGraded,
  onNext,
  isLast,
}: {
  iv: Interview;
  idx: number;
  answer?: Answer;
  phone: boolean;
  onGraded: (a: Answer) => void;
  onNext: () => void;
  isLast: boolean;
}) {
  const q = iv.questions[idx];
  const rec = useRecorder();
  const [phase, setPhase] = useState<Phase>(answer ? "graded" : "ask");
  const [text, setText] = useState(answer?.transcript ?? "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (rec.recording && rec.seconds >= 300) void stopAndTranscribe();
  }, [rec.seconds]); // eslint-disable-line react-hooks/exhaustive-deps

  const startRec = async () => {
    setError(null);
    window.speechSynthesis?.cancel();
    await rec.start();
    setPhase("recording");
  };

  const stopAndTranscribe = async () => {
    const blob = await rec.stop();
    setPhase("transcribing");
    try {
      const { text: t } = await api<{ text: string }>(`/interviews/${iv.id}/transcribe`, {
        method: "POST",
        body: blob,
        headers: { "content-type": blob.type || "audio/webm" },
      });
      setText((prev) => (prev.trim() ? `${prev.trim()}\n${t}` : t));
      setPhase("review");
    } catch (e) {
      setError((e as Error).message);
      setPhase(text ? "review" : "ask");
    }
  };

  const grade = async () => {
    setPhase("grading");
    setError(null);
    try {
      const a = await api<Answer>(`/interviews/${iv.id}/answers/${idx}`, { method: "POST", json: { transcript: text } });
      onGraded(a);
      setPhase("graded");
    } catch (e) {
      setError((e as Error).message);
      setPhase("review");
    }
  };

  useEffect(() => {
    if (rec.error) {
      setError(rec.error);
      setPhase("ask");
    }
  }, [rec.error]);

  return (
    <div className="grid gap-5">
      <Card className="p-5 md:p-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="font-mono text-[11.5px] uppercase tracking-[0.12em] text-mute">
            Вопрос {idx + 1}/{iv.questions.length} · {q.topic}
          </span>
          <IconButton label="Прочитать вслух" className="ml-auto -my-2 -mr-2" onClick={() => speak(q.q, iv.lang)}>
            <Volume2 className="size-4" />
          </IconButton>
        </div>
        <p className="text-[18px] font-medium leading-snug text-ink md:text-[20px]">{q.q}</p>
      </Card>

      {error && <ErrorNote>{error}</ErrorNote>}

      {phase === "ask" && (
        <div className="grid justify-items-center gap-4 py-4">
          <button
            type="button"
            onClick={startRec}
            className="flex size-24 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_0_0_8px_color-mix(in_oklab,var(--color-accent)_14%,transparent)] transition hover:scale-[1.03] active:scale-95"
            aria-label="Начать запись"
          >
            <Mic className="size-9" />
          </button>
          <div className="text-[14px] text-mute">Нажми и отвечай вслух</div>
          <Button variant="ghost" size="sm" icon={<Keyboard className="size-4" />} onClick={() => setPhase("review")}>
            Ответить текстом
          </Button>
        </div>
      )}

      {phase === "recording" && (
        <div className={cx("grid justify-items-center gap-4 py-4", phone && "sticky bottom-4")}>
          <div className="flex h-10 items-end gap-1">
            {Array.from({ length: 16 }, (_, i) => (
              <span
                key={i}
                className="w-1.5 rounded-full bg-accent transition-[height] duration-75"
                style={{ height: `${Math.max(8, rec.level * 100 * (0.45 + 0.55 * Math.abs(Math.sin(i * 1.7 + rec.seconds))))}%` }}
              />
            ))}
          </div>
          <div className="font-mono text-2xl tabular-nums text-ink">
            {String(Math.floor(rec.seconds / 60)).padStart(2, "0")}:{String(rec.seconds % 60).padStart(2, "0")}
          </div>
          <button
            type="button"
            onClick={stopAndTranscribe}
            className="flex size-20 items-center justify-center rounded-full bg-bad text-white shadow-[0_0_0_8px_color-mix(in_oklab,var(--color-bad)_18%,transparent)] transition active:scale-95"
            aria-label="Остановить запись"
          >
            <Square className="size-7" fill="currentColor" />
          </button>
          <div className="text-[13px] text-mute">Остановить и расшифровать</div>
        </div>
      )}

      {phase === "transcribing" && (
        <div className="flex items-center justify-center gap-2.5 py-10 text-mute">
          <Spinner className="size-4" /> Расшифровываю запись…
        </div>
      )}

      {(phase === "review" || phase === "grading") && (
        <div className="grid gap-3">
          <TextArea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={phone ? 8 : 7}
            placeholder="Твой ответ…"
            disabled={phase === "grading"}
            autoFocus={!text}
          />
          <div className="flex gap-2">
            <Button icon={<Mic className="size-4" />} onClick={startRec} disabled={phase === "grading"}>
              {text ? "Дописать голосом" : "Записать"}
            </Button>
            <Button variant="primary" className="flex-1" icon={<Sparkles className="size-4" />} onClick={grade} loading={phase === "grading"} disabled={!text.trim()}>
              {phase === "grading" ? "Оцениваю…" : "Оценить ответ"}
            </Button>
          </div>
        </div>
      )}

      {phase === "graded" && answer && (
        <>
          <GradeCard grade={answer.grade} transcript={answer.transcript} expects={q.expects} />
          <div className="flex gap-2">
            <Button
              icon={<RotateCcw className="size-4" />}
              onClick={() => {
                setText("");
                setPhase("ask");
              }}
            >
              Ответить заново
            </Button>
            {!isLast && (
              <Button variant="primary" className="flex-1" onClick={onNext}>
                Следующий вопрос <ArrowRight className="size-4" />
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

const VERDICT: Record<Grade["verdict"], string> = { strong: "сильно", ok: "нормально", weak: "слабо", miss: "мимо" };

function GradeCard({ grade, transcript, expects }: { grade: Grade; transcript: string; expects: string[] }) {
  const [showModel, setShowModel] = useState(false);
  const [showMine, setShowMine] = useState(false);
  return (
    <Card className="anim-pop overflow-hidden">
      <div className="flex items-center gap-4 border-b border-line p-5">
        <div className={cx("font-mono text-[40px] font-semibold leading-none tabular-nums", scoreTone(grade.score, 10))}>{grade.score}</div>
        <div>
          <div className="text-[13px] text-mute">из 10</div>
          <div className={cx("font-medium", scoreTone(grade.score, 10))}>{VERDICT[grade.verdict]}</div>
        </div>
      </div>
      <div className="grid gap-4 p-5">
        <List title="Раскрыл" items={grade.covered} cls="text-ok" mark="+" />
        <List title="Упустил" items={grade.missed} cls="text-amber" mark="−" />
        <List title="Ошибки" items={grade.wrong} cls="text-bad" mark="!" />
        {grade.delivery && (
          <div>
            <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">Подача</div>
            <p className="text-[14.5px] leading-relaxed text-dim">{grade.delivery}</p>
          </div>
        )}
        {grade.followup && (
          <div className="rounded-xl border border-blue/25 bg-blue/[0.06] p-3.5">
            <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-blue">Интервьюер спросил бы дальше</div>
            <p className="text-[14.5px] leading-relaxed text-ink">{grade.followup}</p>
          </div>
        )}
        <Collapsible open={showModel} onToggle={() => setShowModel(!showModel)} title="Сильный ответ">
          <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed text-dim">{grade.better_answer}</p>
          <div className="mt-3 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">Ключевые пункты</div>
          <ul className="mt-1 list-disc pl-5 text-[14px] text-dim">
            {expects.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Collapsible>
        <Collapsible open={showMine} onToggle={() => setShowMine(!showMine)} title="Мой ответ (расшифровка)">
          <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-mute">{transcript}</p>
        </Collapsible>
      </div>
    </Card>
  );
}

function List({ title, items, cls, mark }: { title: string; items: string[]; cls: string; mark: string }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">{title}</div>
      <ul className="grid gap-1">
        {items.map((it, i) => (
          <li key={i} className="flex gap-2.5 text-[14.5px] leading-snug text-dim">
            <span className={cx("w-3 shrink-0 font-mono font-semibold", cls)}>{mark}</span>
            {it}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Collapsible({ open, onToggle, title, children }: { open: boolean; onToggle: () => void; title: string; children: ReactNode }) {
  return (
    <div className="rounded-xl border border-line">
      <button type="button" onClick={onToggle} className="flex w-full items-center justify-between px-3.5 py-2.5 text-left text-[14px] font-medium text-ink">
        {title}
        <span className="font-mono text-mute">{open ? "−" : "+"}</span>
      </button>
      {open && <div className="border-t border-line px-3.5 py-3">{children}</div>}
    </div>
  );
}

const DECISION: Record<Summary["decision"], { label: string; cls: string }> = {
  hire: { label: "Hire", cls: "text-ok border-ok/40 bg-ok/10" },
  lean_hire: { label: "Lean hire", cls: "text-accent border-accent/40 bg-accent/10" },
  lean_no: { label: "Lean no", cls: "text-amber border-amber/40 bg-amber/10" },
  no: { label: "No hire", cls: "text-bad border-bad/40 bg-bad/10" },
};

function SummaryCard({ summary }: { summary: Summary }) {
  const d = DECISION[summary.decision];
  return (
    <Card className="anim-pop overflow-hidden">
      <div className="flex items-center gap-5 border-b border-line p-5 md:p-6">
        <div className={cx("font-mono text-[52px] font-semibold leading-none tabular-nums", scoreTone(summary.score))}>{summary.score}</div>
        <div className="min-w-0">
          <span className={cx("inline-flex rounded-lg border px-2.5 py-1 text-[13px] font-semibold", d.cls)}>{d.label}</span>
          <p className="mt-2 text-[15px] leading-snug text-ink">{summary.headline}</p>
        </div>
      </div>
      <div className="grid gap-5 p-5 md:grid-cols-2 md:p-6">
        <List title="Сильные стороны" items={summary.strengths} cls="text-ok" mark="+" />
        <List title="Пробелы" items={summary.gaps} cls="text-amber" mark="−" />
        <div className="md:col-span-2">
          <div className="mb-1 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">Что учить дальше</div>
          <ol className="grid gap-1.5">
            {summary.study_plan.map((s, i) => (
              <li key={i} className="flex gap-3 text-[14.5px] leading-snug text-dim">
                <span className="font-mono text-accent">{i + 1}</span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  );
}
