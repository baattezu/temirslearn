import { Camera, Check, ChevronRight, Dices, Eye, GraduationCap, ImagePlus, Lightbulb, RotateCcw, Sparkles, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { lessonById, trackById } from "../../content/catalog";
import { GENS, checkAnswer, genById, type Gen, type Problem } from "../../content/practice";
import { api } from "../../lib/api";
import { useIsPhone } from "../../lib/hooks";
import { Button } from "../../ui/Button";
import { cx } from "../../ui/cx";
import { Input } from "../../ui/Field";
import { MathText, TexBlock, TexInline } from "../../ui/MathText";
import { Badge, ErrorNote, Spinner } from "../../ui/misc";
import { TrackIcon } from "../../ui/TrackIcon";

const LEVEL = ["", "база", "средне", "сложно"];

// ── Список ───────────────────────────────────────────────

export function PracticeList() {
  const { practice } = useData();
  const byTrack = useMemo(() => {
    const m = new Map<string, Gen[]>();
    for (const g of GENS) {
      const t = g.lesson.split("/")[0];
      m.set(t, [...(m.get(t) ?? []), g]);
    }
    return [...m.entries()];
  }, []);
  return (
    <div className="pb-12">
      <PageHeader title="Тренажёр" eyebrow="Решаем на бумаге" back="/">
        <p className="mt-2 max-w-2xl text-[15px] text-mute">
          Сначала разбор метода, как на лекции, потом пример по шагам, потом свои задачи без конца. Решаешь в тетради, вписываешь ответ.
          Не сошлось — фотографируешь решение, и ИИ показывает, на каком шаге ошибка.
        </p>
      </PageHeader>
      <div className="grid gap-7 px-5 pt-4 md:px-10">
        {byTrack.map(([tid, gens]) => {
          const t = trackById(tid);
          return (
            <section key={tid}>
              <h2 className="mb-3 flex items-center gap-2 font-mono text-[12px] uppercase tracking-[0.12em] text-mute">
                <TrackIcon id={tid} className="size-4" color={t?.color} /> {t?.title}
              </h2>
              <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
                {gens.map((g) => {
                  const s = practice[g.id];
                  return (
                    <Link key={g.id} to={`/practice/${g.id}`} className="group flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 transition hover:border-line-strong">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-ink">{g.title}</div>
                        <div className="mt-0.5 truncate text-[12.5px] text-mute">{lessonById(g.lesson)?.title}</div>
                      </div>
                      <div className="text-right">
                        <Badge tone={g.level === 3 ? "amber" : "neutral"}>{LEVEL[g.level]}</Badge>
                        {s && s.solved > 0 && <div className="mt-1 font-mono text-[11px] text-ok">✓ {s.solved}</div>}
                      </div>
                      <ChevronRight className="size-4 shrink-0 text-mute group-hover:text-ink" />
                    </Link>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

// ── Страница генератора ──────────────────────────────────

export function PracticePage() {
  const { genId = "" } = useParams();
  const gen = genById(genId);
  if (!gen) return <Navigate to="/practice" replace />;
  const lesson = lessonById(gen.lesson);
  const track = lesson && trackById(lesson.track);
  return (
    <div className="pb-16">
      <PageHeader
        back="/practice"
        title={gen.title}
        eyebrow={
          <Link to="/practice" className="hover:text-ink">
            Тренажёр · {track?.title}
          </Link>
        }
      />
      <div className="max-w-[760px] px-5 pt-3 md:px-10">
        {lesson?.ready && (
          <Link to={`/l/${lesson.id}`} className="mb-5 inline-flex items-center gap-1.5 text-[13px] text-dim hover:text-ink">
            <GraduationCap className="size-4" /> Урок: {lesson.title}
          </Link>
        )}
        <Trainer gen={gen} key={gen.id} />
      </div>
    </div>
  );
}

/** Встраивается в MDX-урок: <Practice gen="la-det2" /> */
export function PracticeInline({ gen: id }: { gen: string }) {
  const gen = genById(id);
  if (!gen) return null;
  return (
    <div className="not-prose my-8 rounded-2xl border border-violet/30 bg-violet/[0.04] p-4 sm:p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-violet">Реши на бумаге</div>
          <div className="mt-0.5 font-medium text-ink">{gen.title}</div>
        </div>
        <Link to={`/practice/${gen.id}`} className="shrink-0 text-[13px] text-dim hover:text-ink">
          весь тренажёр →
        </Link>
      </div>
      <TaskBox gen={gen} compact />
    </div>
  );
}

function Trainer({ gen }: { gen: Gen }) {
  return (
    <div className="grid gap-5">
      <Method gen={gen} />
      <Worked gen={gen} />
      <section>
        <h2 className="mb-2.5 flex items-center gap-2 text-[17px] font-semibold text-ink">
          <Dices className="size-[18px] text-accent" /> Твоя задача
        </h2>
        <div className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
          <TaskBox gen={gen} />
        </div>
      </section>
    </div>
  );
}

function Method({ gen }: { gen: Gen }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2 text-[17px] font-semibold text-ink">
        <Lightbulb className="size-[18px] text-amber" /> Как решать
      </h2>
      <ol className="grid gap-2.5">
        {gen.method.map((m, i) => (
          <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-dim">
            <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-raised font-mono text-[12px] text-mute">{i + 1}</span>
            <MathText text={m} className="min-w-0" />
          </li>
        ))}
      </ol>
    </section>
  );
}

/** Пример «у доски»: шаги открываются по одному — сначала попробуй сам угадать следующий. */
function Worked({ gen }: { gen: Gen }) {
  const pr = useMemo(() => gen.make(1234), [gen]);
  const [shown, setShown] = useState(0);
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="mb-1 flex items-center gap-2 text-[17px] font-semibold text-ink">
        <GraduationCap className="size-[18px] text-blue" /> Пример у доски
      </h2>
      <p className="mb-3 text-[13px] text-mute">Перед каждым шагом попробуй сказать, что будет дальше. Потом открывай.</p>
      <Statement pr={pr} />
      <ol className="mt-3 grid gap-2">
        {pr.steps.slice(0, shown).map((s, i) => (
          <li key={i} className="anim-fade flex gap-3 rounded-xl bg-raised/60 px-3 py-2.5 text-[14.5px] leading-relaxed text-dim">
            <span className="font-mono text-[12px] text-mute">{i + 1}.</span>
            <MathText text={s} className="min-w-0 overflow-x-auto" />
          </li>
        ))}
      </ol>
      <div className="mt-3 flex gap-2">
        {shown < pr.steps.length ? (
          <Button size="sm" variant="secondary" onClick={() => setShown((n) => n + 1)} icon={<ChevronRight className="size-4" />}>
            {shown === 0 ? "Начать разбор" : "Следующий шаг"}
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setShown(0)} icon={<RotateCcw className="size-3.5" />}>
            Сначала
          </Button>
        )}
        {shown > 0 && shown < pr.steps.length && (
          <Button size="sm" variant="ghost" onClick={() => setShown(pr.steps.length)}>
            Показать всё
          </Button>
        )}
      </div>
    </section>
  );
}

function Statement({ pr }: { pr: Problem }) {
  return (
    <div>
      <MathText text={pr.statement} className="text-[15.5px] leading-relaxed text-ink" />
      {pr.tex && <TexBlock tex={pr.tex} className="my-3 overflow-x-auto py-1 text-[17px]" />}
    </div>
  );
}

const newSeed = () => (Math.random() * 2 ** 31) | 0;

function TaskBox({ gen, compact }: { gen: Gen; compact?: boolean }) {
  const { refreshPractice } = useData();
  const [seed, setSeed] = useState(newSeed);
  const pr = useMemo(() => gen.make(seed), [gen, seed]);
  const [inputs, setInputs] = useState<string[]>(() => pr.fields.map(() => ""));
  const [result, setResult] = useState<ReturnType<typeof checkAnswer> | null>(null);
  const [revealed, setRevealed] = useState(false);
  const recorded = useRef(false);

  useEffect(() => {
    setInputs(pr.fields.map(() => ""));
    setResult(null);
    setRevealed(false);
    recorded.current = false;
  }, [pr]);

  const record = (correct: 1 | 0 | -1) => {
    if (recorded.current && correct !== 1) return;
    recorded.current = true;
    api("/practice", { method: "POST", json: { gen: gen.id, seed, correct } })
      .then(refreshPractice)
      .catch(() => {});
  };

  const check = () => {
    const r = checkAnswer(pr, inputs);
    setResult(r);
    if (r.complete) record(r.ok ? 1 : 0);
  };
  const reveal = () => {
    setRevealed(true);
    if (!result?.ok) record(-1);
  };

  const cols = pr.cols ?? (pr.fields.length <= 3 ? pr.fields.length : 2);
  return (
    <div>
      <Statement pr={pr} />
      <div className="mt-2 grid gap-2.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, maxWidth: cols * 150 }}>
        {pr.fields.map((f, i) => (
          <label key={i} className="block">
            <span className="mb-1 block text-[13px] text-mute">
              <TexInline tex={f.label} />
            </span>
            <Input
              inputMode="text"
              autoComplete="off"
              value={inputs[i] ?? ""}
              onChange={(e) => {
                const v = [...inputs];
                v[i] = e.target.value;
                setInputs(v);
                setResult(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && check()}
              className={cx(
                "font-mono tabular-nums",
                result?.complete && (result.perField[i] ? "border-ok/60!" : "border-bad/60!"),
              )}
            />
          </label>
        ))}
      </div>

      {result && (
        <div className={cx("anim-fade mt-3 flex items-center gap-2 text-[14.5px] font-medium", !result.complete ? "text-amber" : result.ok ? "text-ok" : "text-bad")}>
          {!result.complete ? "Заполни все поля числами (дроби — как 3/4)." : result.ok ? <><Check className="size-4" /> Верно!</> : <><X className="size-4" /> Не сходится. Проверь выделенные поля или прикрепи фото решения.</>}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={check} icon={<Check className="size-4" />}>
          Проверить
        </Button>
        {!revealed && (
          <Button variant="secondary" onClick={reveal} icon={<Eye className="size-4" />}>
            Решение
          </Button>
        )}
        <Button variant="ghost" onClick={() => setSeed(newSeed())} icon={<Dices className="size-4" />}>
          Новая задача
        </Button>
      </div>

      {revealed && (
        <ol className="anim-fade mt-4 grid gap-2 border-t border-line pt-4">
          {pr.steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-[14.5px] leading-relaxed text-dim">
              <span className="font-mono text-[12px] text-mute">{i + 1}.</span>
              <MathText text={s} className="min-w-0 overflow-x-auto" />
            </li>
          ))}
        </ol>
      )}

      {!compact && <PhotoCheck gen={gen} seed={seed} pr={pr} typed={inputs} />}
    </div>
  );
}

// ── Фото решения → ИИ ────────────────────────────────────

interface CheckResult {
  correct: boolean;
  read_answer: string;
  steps: { text: string; ok: boolean; note: string }[];
  first_error: string;
  why: string;
  hint: string;
  praise: string;
  legible: boolean;
}

/** Уменьшаем фото до 1600px по длинной стороне — модели хватает, а грузится в разы быстрее. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b ?? file), "image/jpeg", 0.85));
}

function PhotoCheck({ gen, seed, pr, typed }: { gen: Gen; seed: number; pr: Problem; typed: string[] }) {
  const phone = useIsPhone();
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [res, setRes] = useState<CheckResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previews = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => previews.forEach(URL.revokeObjectURL), [previews]);
  useEffect(() => {
    setFiles([]);
    setRes(null);
    setErr(null);
  }, [pr]);

  const send = async () => {
    setBusy(true);
    setErr(null);
    setRes(null);
    try {
      const fd = new FormData();
      fd.set(
        "meta",
        JSON.stringify({
          gen: gen.id,
          seed,
          statement: `${pr.statement}${pr.tex ? `\n${pr.tex}` : ""}`,
          answer: pr.answerText,
          solution: pr.steps,
          userAnswer: typed.some((t) => t.trim()) ? typed.join(", ") : undefined,
        }),
      );
      for (const f of files) fd.append("photo", await shrink(f), "page.jpg");
      setRes(await api<CheckResult>("/practice/check", { method: "POST", body: fd }));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-6 rounded-2xl border border-dashed border-line-strong p-4">
      <div className="flex items-start gap-3">
        <Camera className="mt-0.5 size-5 shrink-0 text-violet" />
        <div className="min-w-0 flex-1">
          <div className="font-medium text-ink">Решил на бумаге — проверь шаги</div>
          <div className="mt-0.5 text-[13px] leading-snug text-mute">
            Сфоткай решение целиком. ИИ знает верный ответ и эталон, поэтому не решает за тебя, а ищет первый шаг, где ты ошибся.
          </div>
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        {...(phone ? { capture: "environment" as const } : {})}
        className="hidden"
        onChange={(e) => {
          setFiles((f) => [...f, ...Array.from(e.target.files ?? [])].slice(0, 4));
          e.target.value = "";
        }}
      />
      {files.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {previews.map((u, i) => (
            <div key={u} className="relative">
              <img src={u} alt="" className="size-20 rounded-xl border border-line object-cover" />
              <button
                type="button"
                aria-label="Убрать фото"
                onClick={() => setFiles((f) => f.filter((_, j) => j !== i))}
                className="absolute -right-1.5 -top-1.5 flex size-6 items-center justify-center rounded-full border border-line bg-raised text-mute hover:text-ink"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()} icon={<ImagePlus className="size-4" />}>
          {phone ? "Сфоткать" : "Прикрепить фото"}
        </Button>
        {files.length > 0 && (
          <Button variant="primary" size="sm" onClick={send} loading={busy} icon={<Sparkles className="size-4" />}>
            Проверить решение
          </Button>
        )}
      </div>
      {busy && (
        <div className="mt-3 flex items-center gap-2 text-[13px] text-mute">
          <Spinner className="size-4" /> Читаю почерк и сверяю шаги…
        </div>
      )}
      {err && <div className="mt-3"><ErrorNote>{err}</ErrorNote></div>}
      {res && <CheckView r={res} />}
    </div>
  );
}

function CheckView({ r }: { r: CheckResult }) {
  if (!r.legible) {
    return <div className="anim-fade mt-4 rounded-xl bg-amber/10 p-3 text-[14px] text-amber">Не получилось прочитать: {r.why || "сфоткай ровнее и при хорошем свете."}</div>;
  }
  return (
    <div className="anim-fade mt-4 grid gap-3">
      <div className={cx("flex items-center gap-2 text-[15px] font-semibold", r.correct ? "text-ok" : "text-bad")}>
        {r.correct ? <Check className="size-4" /> : <X className="size-4" />}
        {r.correct ? "Ответ верный" : "Ответ не сходится"}
        {r.read_answer && <span className="font-normal text-mute">· прочитал: {r.read_answer}</span>}
      </div>
      {r.steps.length > 0 && (
        <ol className="grid gap-1.5">
          {r.steps.map((s, i) => (
            <li key={i} className={cx("rounded-xl border px-3 py-2 text-[14px]", s.ok ? "border-line text-dim" : "border-bad/40 bg-bad/[0.06] text-ink")}>
              <div className="flex gap-2">
                <span className={cx("mt-0.5 shrink-0", s.ok ? "text-ok" : "text-bad")}>{s.ok ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>
                <MathText text={s.text} className="min-w-0 overflow-x-auto font-mono text-[13px]" />
              </div>
              {s.note && <div className="mt-1 pl-5.5 text-[13px] text-mute">{s.note}</div>}
            </li>
          ))}
        </ol>
      )}
      {(r.steps.find((s) => !s.ok)?.text || r.first_error) && (
        <div className="rounded-xl bg-bad/[0.07] p-3 text-[14.5px] leading-relaxed text-dim">
          <div className="mb-1 font-semibold text-bad">Где ошибка</div>
          <MathText text={r.steps.find((s) => !s.ok)?.text || r.first_error} className="font-mono text-[13.5px] text-ink" />
          {r.why && <div className="mt-1.5"><MathText text={r.why} /></div>}
        </div>
      )}
      {r.hint && (
        <div className="rounded-xl bg-accent/[0.06] p-3 text-[14.5px] leading-relaxed text-dim">
          <div className="mb-1 font-semibold text-accent">Как исправить</div>
          <MathText text={r.hint} />
        </div>
      )}
      {r.praise && <div className="text-[13.5px] text-mute">👍 <MathText text={r.praise} /></div>}
    </div>
  );
}
