import type { Compare, Lang, Problem } from "../../problems";

export interface TestResult {
  index: number;
  args: unknown[];
  expected: unknown;
  output: unknown;
  error: string | null;
  stdout: string;
  ms: number;
  pass: boolean;
}

export type RunOutcome =
  | { kind: "ok"; results: TestResult[]; passed: number; total: number }
  | { kind: "fatal"; message: string }
  | { kind: "timeout"; seconds: number };

const LIMIT_S: Record<Lang, number> = { python: 8, javascript: 4 };

let worker: Worker | null = null;
let ready: Promise<void> | null = null;
let seq = 0;

function spawn() {
  worker = new Worker(new URL("./runner.worker.ts", import.meta.url), { type: "module" });
  ready = null;
  return worker;
}

/** Загружает Pyodide заранее, чтобы первый запуск не ждал ~3 секунды. */
export function warmPython() {
  const w = worker ?? spawn();
  if (!ready) {
    ready = new Promise<void>((resolve) => {
      const on = (e: MessageEvent) => {
        if (e.data?.type === "ready") {
          w.removeEventListener("message", on);
          resolve();
        }
      };
      w.addEventListener("message", on);
      w.postMessage({ type: "warm" });
    });
  }
  return ready;
}

function canon(v: unknown, mode: Compare): string {
  if (mode === "exact" || !Array.isArray(v)) return JSON.stringify(v);
  const items = v.map((x) => (mode === "unordered-deep" && Array.isArray(x) ? canon(x, "unordered") : JSON.stringify(x)));
  return JSON.stringify(items.sort());
}

export async function runTests(problem: Problem, lang: Lang, code: string, all: boolean): Promise<RunOutcome> {
  const tests = all ? problem.tests : problem.tests.slice(0, problem.sample);
  if (lang === "python") await warmPython();
  const w = worker ?? spawn();
  const id = ++seq;

  const payload = await new Promise<unknown>((resolve) => {
    const timer = setTimeout(() => {
      w.removeEventListener("message", on);
      w.terminate();
      worker = null;
      ready = null;
      resolve({ timeout: true });
    }, LIMIT_S[lang] * 1000);
    const on = (e: MessageEvent) => {
      if (e.data?.type === "result" && e.data.id === id) {
        clearTimeout(timer);
        w.removeEventListener("message", on);
        resolve(e.data.payload);
      }
    };
    w.addEventListener("message", on);
    w.postMessage({ type: "run", id, lang, code, fn: problem.fn, tests: JSON.stringify(tests.map((t) => t.args)) });
  });

  if ((payload as { timeout?: boolean }).timeout) return { kind: "timeout", seconds: LIMIT_S[lang] };
  if ((payload as { fatal?: string }).fatal) return { kind: "fatal", message: (payload as { fatal: string }).fatal };

  const raw = payload as { output: unknown; error: string | null; stdout: string; ms: number }[];
  const mode = problem.compare ?? "exact";
  const results = raw.map((r, i) => ({
    index: i,
    args: tests[i].args,
    expected: tests[i].expected,
    ...r,
    pass: !r.error && canon(r.output, mode) === canon(tests[i].expected, mode),
  }));
  return { kind: "ok", results, passed: results.filter((r) => r.pass).length, total: results.length };
}
