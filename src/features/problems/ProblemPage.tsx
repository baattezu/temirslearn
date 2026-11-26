import { BookOpen, CheckCircle2, Play, RotateCcw, Send, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { lessonById } from "../../content/catalog";
import { api } from "../../lib/api";
import { ago, plural } from "../../lib/format";
import { useApi, useIsPhone, useLocalStorage } from "../../lib/hooks";
import { problemById, type Lang, type Problem } from "../../problems";
import { Button } from "../../ui/Button";
import { CodeEditor } from "../../ui/CodeEditor";
import { Markdown } from "../../ui/Markdown";
import { Segmented } from "../../ui/Segmented";
import { Badge, Spinner } from "../../ui/misc";
import { cx } from "../../ui/cx";
import { DIFF } from "./ProblemsPage";
import { runTests, warmPython, type RunOutcome, type TestResult } from "./runner";

const LANGS: { value: Lang; label: string }[] = [
  { value: "python", label: "Python" },
  { value: "javascript", label: "JavaScript" },
];

export function ProblemPage() {
  const { problemId = "" } = useParams();
  const problem = problemById(problemId);
  if (!problem) return <Navigate to="/problems" replace />;
  return <Workspace key={problem.id} problem={problem} />;
}

function Workspace({ problem }: { problem: Problem }) {
  const phone = useIsPhone();
  const { refreshSubmissions, submissions } = useData();
  const [lang, setLang] = useLocalStorage<Lang>("tl.lang", "python");
  const [codes, setCodes] = useLocalStorage<Partial<Record<Lang, string>>>(`tl.code.${problem.id}`, {});
  const code = codes[lang] ?? problem.starter[lang];
  const [running, setRunning] = useState<"run" | "submit" | null>(null);
  const [outcome, setOutcome] = useState<(RunOutcome & { all: boolean }) | null>(null);
  const [tab, setTab] = useState<"task" | "code" | "result">("task");
  const [leftTab, setLeftTab] = useState<"task" | "history">("task");
  const lesson = problem.lesson ? lessonById(problem.lesson) : undefined;

  useEffect(() => {
    if (lang === "python") void warmPython();
  }, [lang]);

  const run = async (all: boolean) => {
    setRunning(all ? "submit" : "run");
    if (phone) setTab("result");
    try {
      const res = await runTests(problem, lang, code, all);
      setOutcome({ ...res, all });
      if (all) {
        const passed = res.kind === "ok" ? res.passed : 0;
        await api("/submissions", { method: "POST", json: { problem_id: problem.id, lang, code, passed, total: problem.tests.length } });
        await refreshSubmissions();
      }
    } finally {
      setRunning(null);
    }
  };

  const statement = (
    <div>
      {!phone && (
        <Segmented
          size="sm"
          value={leftTab}
          onChange={setLeftTab}
          className="mb-4"
          options={[
            { value: "task", label: "Условие" },
            { value: "history", label: `Попытки${submissions[problem.id] ? ` · ${submissions[problem.id].attempts}` : ""}` },
          ]}
        />
      )}
      {leftTab === "task" || phone ? (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge tone={DIFF[problem.difficulty].tone}>{problem.difficulty}</Badge>
            {problem.tags.map((t) => (
              <Badge key={t}>{t}</Badge>
            ))}
            {submissions[problem.id]?.solved && (
              <Badge tone="accent">
                <CheckCircle2 className="size-3" /> решено
              </Badge>
            )}
          </div>
          <Markdown className="text-[15px]">{problem.statement}</Markdown>
          {lesson?.ready && (
            <Link to={`/l/${lesson.id}`} className="mt-5 flex items-center gap-2 text-[13.5px] text-blue hover:underline">
              <BookOpen className="size-4" /> Урок: {lesson.title}
            </Link>
          )}
          {phone && <History problem={problem} onLoad={(c, l) => { setLang(l); setCodes((p) => ({ ...p, [l]: c })); setTab("code"); }} />}
        </>
      ) : (
        <History problem={problem} onLoad={(c, l) => { setLang(l); setCodes((p) => ({ ...p, [l]: c })); }} />
      )}
    </div>
  );

  const toolbar = (
    <div className="flex items-center gap-2">
      <Segmented size="sm" value={lang} onChange={setLang} options={LANGS} />
      <Button
        variant="ghost"
        size="sm"
        icon={<RotateCcw className="size-3.5" />}
        onClick={() => setCodes((p) => ({ ...p, [lang]: problem.starter[lang] }))}
        title="Вернуть шаблон"
      >
        {!phone && "Сброс"}
      </Button>
    </div>
  );

  const actions = (
    <div className="flex gap-2">
      <Button onClick={() => run(false)} loading={running === "run"} disabled={!!running} icon={<Play className="size-4" />} block={phone}>
        Запустить
      </Button>
      <Button variant="primary" onClick={() => run(true)} loading={running === "submit"} disabled={!!running} icon={<Send className="size-4" />} block={phone}>
        Отправить
      </Button>
    </div>
  );

  const editor = (
    <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-line bg-surface">
      <CodeEditor lang={lang} value={code} onChange={(v) => setCodes((p) => ({ ...p, [lang]: v }))} className="h-full" />
    </div>
  );

  const result = <Results outcome={outcome} running={!!running} lang={lang} params={problem.params} />;

  if (phone) {
    return (
      <div className="flex h-dvh flex-col">
        <PageHeader back="/problems" title={problem.title} />
        <div className="px-4 pt-3">
          <Segmented
            block
            value={tab}
            onChange={setTab}
            options={[
              { value: "task", label: "Условие" },
              { value: "code", label: "Код" },
              { value: "result", label: outcome?.kind === "ok" ? `Результат ${outcome.passed}/${outcome.total}` : "Результат" },
            ]}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {tab === "task" && statement}
          {tab === "code" && (
            <div className="flex h-full flex-col gap-3">
              {toolbar}
              {editor}
            </div>
          )}
          {tab === "result" && result}
        </div>
        <div className="border-t border-line bg-bg px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">{actions}</div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <PageHeader back="/problems" eyebrow={<Link to="/problems" className="hover:text-ink">Задачи</Link>} title={problem.title} />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(320px,0.85fr)_1.15fr] gap-5 px-10 pb-6 pt-3">
        <div className="min-h-0 overflow-y-auto pr-2">{statement}</div>
        <div className="flex min-h-0 flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            {toolbar}
            {actions}
          </div>
          {editor}
          <div className="h-[38%] min-h-[180px] overflow-y-auto rounded-xl border border-line bg-surface p-4">{result}</div>
        </div>
      </div>
    </div>
  );
}

const short = (v: unknown) => {
  const s = JSON.stringify(v);
  return s && s.length > 160 ? `${s.slice(0, 160)}… (${s.length} симв.)` : s;
};

function Results({ outcome, running, lang, params }: { outcome: (RunOutcome & { all: boolean }) | null; running: boolean; lang: Lang; params: string[] }) {
  if (running)
    return (
      <div className="flex items-center gap-2.5 text-[14px] text-mute">
        <Spinner className="size-4" /> {lang === "python" ? "Python загружается при первом запуске, дальше быстро…" : "Выполняю…"}
      </div>
    );
  if (!outcome) return <div className="text-[14px] text-mute">«Запустить» — открытые примеры. «Отправить» — все тесты, включая большие и крайние случаи.</div>;
  if (outcome.kind === "timeout")
    return <Verdict bad title="Time Limit Exceeded" sub={`Дольше ${outcome.seconds} с — бесконечный цикл или слишком медленная асимптотика.`} />;
  if (outcome.kind === "fatal") return (
    <div>
      <Verdict bad title="Ошибка" />
      <pre className="mt-3 whitespace-pre-wrap rounded-lg bg-bg p-3 font-mono text-[12.5px] text-bad">{outcome.message}</pre>
    </div>
  );

  const ok = outcome.passed === outcome.total;
  const firstFail = outcome.results.find((r) => !r.pass);
  const maxMs = Math.max(...outcome.results.map((r) => r.ms));
  return (
    <div>
      <Verdict
        bad={!ok}
        title={ok ? (outcome.all ? "Accepted" : "Примеры пройдены") : firstFail?.error ? "Runtime Error" : "Wrong Answer"}
        sub={`${outcome.passed}/${outcome.total} ${plural(outcome.total, "тест", "теста", "тестов")} · самый долгий ${maxMs.toFixed(1)} мс`}
      />
      <div className="mt-4 grid gap-2">
        {outcome.results.map((r) => (
          <TestRow key={r.index} r={r} params={params} defaultOpen={r === firstFail} />
        ))}
      </div>
    </div>
  );
}

function Verdict({ bad, title, sub }: { bad?: boolean; title: string; sub?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      {bad ? <XCircle className="mt-0.5 size-5 shrink-0 text-bad" /> : <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ok" />}
      <div>
        <div className={cx("text-[16px] font-semibold", bad ? "text-bad" : "text-ok")}>{title}</div>
        {sub && <div className="text-[13px] text-mute">{sub}</div>}
      </div>
    </div>
  );
}

function TestRow({ r, params, defaultOpen }: { r: TestResult; params: string[]; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-lg border border-line bg-bg">
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px]">
        <span className={cx("size-2 rounded-full", r.pass ? "bg-ok" : "bg-bad")} />
        <span className="text-dim">Тест {r.index + 1}</span>
        <span className="ml-auto font-mono text-[11.5px] text-mute">{r.ms.toFixed(1)} мс</span>
      </button>
      {open && (
        <div className="grid gap-2 border-t border-line px-3 py-2.5 font-mono text-[12px]">
          {params.map((p, i) => (
            <KV key={p} k={p} v={short(r.args[i])} />
          ))}
          <KV k="ожидается" v={short(r.expected)} />
          <KV k="получено" v={r.error ?? short(r.output)} bad={!r.pass} />
          {r.stdout && <KV k="stdout" v={r.stdout} />}
        </div>
      )}
    </div>
  );
}

function KV({ k, v, bad }: { k: string; v: string | undefined; bad?: boolean }) {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-2">
      <span className="text-mute">{k}</span>
      <span className={cx("whitespace-pre-wrap break-all", bad ? "text-bad" : "text-ink")}>{v}</span>
    </div>
  );
}

function History({ problem, onLoad }: { problem: Problem; onLoad: (code: string, lang: Lang) => void }) {
  const { submissions } = useData();
  const { data, reload } = useApi<{ id: number; lang: Lang; code: string; passed: number; total: number; created_at: number }[]>(
    `/submissions/${problem.id}`,
  );
  const attempts = submissions[problem.id]?.attempts;
  useEffect(() => {
    void reload();
  }, [attempts, reload]);
  if (!data?.length) return <div className="mt-6 text-[13px] text-mute">Попыток пока нет.</div>;
  return (
    <div className="mt-6">
      <div className="mb-2 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">Попытки</div>
      <div className="grid gap-1.5">
        {data.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => onLoad(s.code, s.lang)}
            className="flex items-center gap-3 rounded-lg border border-line px-3 py-2 text-left text-[13px] hover:border-line-strong"
          >
            <span className={cx("size-2 rounded-full", s.passed === s.total ? "bg-ok" : "bg-bad")} />
            <span className="text-ink">{s.passed === s.total ? "Accepted" : `${s.passed}/${s.total}`}</span>
            <span className="text-mute">{s.lang === "python" ? "Python" : "JS"}</span>
            <span className="ml-auto text-mute">{ago(s.created_at)}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
