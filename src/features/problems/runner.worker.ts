/// <reference lib="webworker" />
// Судья в отдельном потоке: Python через Pyodide (CDN), JavaScript — нативно.
// Бесконечный цикл здесь не вешает вкладку: главный поток просто убивает воркер по таймауту.

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.8/full/";

const HARNESS = String.raw`
import json, sys, io, time, traceback

def __fmt_error(e):
    frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "solution.py"]
    where = f" (строка {frames[-1].lineno})" if frames else ""
    return f"{type(e).__name__}: {e}{where}"

def __default(o):
    if isinstance(o, (set, frozenset, tuple)):
        return list(o)
    return repr(o)

def __run(code, fn_name, tests_json):
    ns = {"__name__": "solution"}
    try:
        exec(compile(code, "solution.py", "exec"), ns)
    except SyntaxError as e:
        return json.dumps({"fatal": f"SyntaxError: {e.msg} (строка {e.lineno})"})
    except Exception as e:
        return json.dumps({"fatal": __fmt_error(e)})
    fn = ns.get(fn_name)
    if fn is None and "Solution" in ns:
        fn = getattr(ns["Solution"](), fn_name, None)
    if fn is None:
        return json.dumps({"fatal": f"Не найдена функция {fn_name}"})
    out = []
    for args in json.loads(tests_json):
        buf = io.StringIO()
        old = sys.stdout
        sys.stdout = buf
        t = time.perf_counter()
        try:
            res, err = fn(*args), None
        except RecursionError:
            res, err = None, "RecursionError: слишком глубокая рекурсия — перепиши итеративно"
        except Exception as e:
            res, err = None, __fmt_error(e)
        finally:
            sys.stdout = old
        ms = (time.perf_counter() - t) * 1000
        out.append({"output": res, "error": err, "stdout": buf.getvalue()[:2000], "ms": ms})
    return json.dumps(out, default=__default)
`;

interface Pyodide {
  runPython: (code: string) => unknown;
  globals: { get: (name: string) => (...args: unknown[]) => unknown };
}

let py: Pyodide | null = null;

async function ensurePython() {
  if (py) return py;
  const mod = await import(/* @vite-ignore */ `${PYODIDE}pyodide.mjs`);
  py = (await mod.loadPyodide({ indexURL: PYODIDE })) as Pyodide;
  py.runPython(HARNESS);
  return py;
}

function runJs(code: string, fn: string, tests: unknown[][]) {
  const logs: string[] = [];
  const fake = { log: (...a: unknown[]) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")) };
  let f: (...a: unknown[]) => unknown;
  try {
    f = new Function(
      "console",
      `"use strict";\n${code}\n;return typeof ${fn} !== "undefined" ? ${fn} : (typeof Solution !== "undefined" ? ((s) => s.${fn}.bind(s))(new Solution()) : undefined);`,
    )(fake);
  } catch (e) {
    return { fatal: String(e) };
  }
  if (typeof f !== "function") return { fatal: `Не найдена функция ${fn}` };
  return tests.map((args) => {
    logs.length = 0;
    const t = performance.now();
    let output: unknown = null;
    let error: string | null = null;
    try {
      output = f(...structuredClone(args));
    } catch (e) {
      error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    return { output: output === undefined ? null : output, error, stdout: logs.join("\n").slice(0, 2000), ms: performance.now() - t };
  });
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: "warm" } | { type: "run"; id: number; lang: string; code: string; fn: string; tests: string };
  try {
    if (msg.type === "warm") {
      await ensurePython();
      self.postMessage({ type: "ready" });
      return;
    }
    if (msg.lang === "python") {
      const p = await ensurePython();
      const res = p.globals.get("__run")(msg.code, msg.fn, msg.tests) as string;
      self.postMessage({ type: "result", id: msg.id, payload: JSON.parse(res) });
    } else {
      self.postMessage({ type: "result", id: msg.id, payload: runJs(msg.code, msg.fn, JSON.parse(msg.tests)) });
    }
  } catch (err) {
    self.postMessage({ type: "result", id: (msg as { id?: number }).id ?? 0, payload: { fatal: String(err) } });
  }
};
