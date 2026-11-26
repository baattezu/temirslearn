/// <reference lib="webworker" />
// Судья в отдельном потоке: Python через Pyodide (CDN), JavaScript — нативно, SQL — SQLite (sql.js, WASM).
// Бесконечный цикл здесь не вешает вкладку: главный поток просто убивает воркер по таймауту.
//
// Виды задач:
//   function     — вызвать функцию с аргументами (списки и деревья конвертируются из массивов)
//   design       — класс и последовательность операций, как в LeetCode: ["LRUCache","put","get"], [[2],[1,1],[1]]
//   sql          — на каждый тест свежая база: схема и данные, потом запрос пользователя
//   concurrency  — JS: async-методы класса вызываются «из разных потоков» со случайными задержками

import initSqlJs, { type SqlJsStatic } from "sql.js";
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url";

const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v314.0.8/full/";

const HARNESS = String.raw`
import json, sys, io, time, traceback
from collections import deque
from typing import List, Optional, Dict, Set, Tuple

class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
    def __repr__(self):
        return f"ListNode({self.val})"

class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
    def __repr__(self):
        return f"TreeNode({self.val})"

def __to_list(arr):
    head = cur = ListNode()
    for v in arr:
        cur.next = ListNode(v)
        cur = cur.next
    return head.next

def __from_list(node):
    out, seen = [], 0
    while node is not None and seen < 100000:
        out.append(node.val)
        node = node.next
        seen += 1
    return out

def __to_tree(arr):
    if not arr or arr[0] is None:
        return None
    root = TreeNode(arr[0])
    q, i = deque([root]), 1
    while q and i < len(arr):
        n = q.popleft()
        if i < len(arr) and arr[i] is not None:
            n.left = TreeNode(arr[i]); q.append(n.left)
        i += 1
        if i < len(arr) and arr[i] is not None:
            n.right = TreeNode(arr[i]); q.append(n.right)
        i += 1
    return root

def __from_tree(root):
    out, q = [], deque([root])
    while q:
        n = q.popleft()
        if n is None:
            out.append(None)
        else:
            out.append(n.val); q.append(n.left); q.append(n.right)
    while out and out[-1] is None:
        out.pop()
    return out

def __unlink(node, seen=None):
    # CPython освобождает цепочку узлов рекурсивно — на 50 000 узлов стек WASM кончается.
    # Разрываем связи циклом, пока ссылки ещё у нас.
    guard = 0
    while isinstance(node, ListNode) and guard < 1000000:
        nxt = node.next
        node.next = None
        node = nxt
        guard += 1

def __fmt_error(e):
    frames = [f for f in traceback.extract_tb(e.__traceback__) if f.filename == "solution.py"]
    where = f" (строка {frames[-1].lineno})" if frames else ""
    return f"{type(e).__name__}: {e}{where}"

def __default(o):
    if isinstance(o, (set, frozenset, tuple)):
        return list(o)
    if isinstance(o, ListNode):
        return __from_list(o)
    if isinstance(o, TreeNode):
        return __from_tree(o)
    return repr(o)

def __run(code, fn_name, tests_json, meta_json):
    meta = json.loads(meta_json)
    ns = {"__name__": "solution", "ListNode": ListNode, "TreeNode": TreeNode, "List": List, "Optional": Optional,
          "Dict": Dict, "Set": Set, "Tuple": Tuple}
    try:
        exec(compile(code, "solution.py", "exec"), ns)
    except SyntaxError as e:
        return json.dumps({"fatal": f"SyntaxError: {e.msg} (строка {e.lineno})"})
    except Exception as e:
        return json.dumps({"fatal": __fmt_error(e)})
    kind = meta.get("kind", "function")
    if kind == "design":
        cls = ns.get(fn_name)
        if cls is None:
            return json.dumps({"fatal": f"Не найден класс {fn_name}"})
    else:
        fn = ns.get(fn_name)
        if fn is None and "Solution" in ns:
            fn = getattr(ns["Solution"](), fn_name, None)
        if fn is None:
            return json.dumps({"fatal": f"Не найдена функция {fn_name}"})
    io_ = meta.get("io") or {}
    out = []
    for args in json.loads(tests_json):
        buf = io.StringIO()
        old = sys.stdout
        sys.stdout = buf
        t = time.perf_counter()
        try:
            if kind == "design":
                ops, argv = args
                obj = cls(*argv[0])
                res = [None]
                for op, a in zip(ops[1:], argv[1:]):
                    res.append(getattr(obj, op)(*a))
            else:
                args = list(args)
                keep = []
                for i in io_.get("list", []):
                    args[i] = __to_list(args[i])
                    keep.append(args[i])
                for i in io_.get("lists", []):
                    args[i] = [__to_list(x) for x in args[i]]
                    keep.extend(args[i])
                for i in io_.get("tree", []):
                    args[i] = __to_tree(args[i])
                res = fn(*args)
                if io_.get("ret") == "list":
                    raw = res
                    res = __from_list(res)
                    __unlink(raw)
                elif io_.get("ret") == "tree":
                    res = __from_tree(res)
                elif io_.get("ret") == "arg0":
                    res = args[0]
                for n in keep:
                    __unlink(n)
            err = None
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

// ── JavaScript ───────────────────────────────────────────

const JS_PRELUDE = `
class ListNode { constructor(val = 0, next = null) { this.val = val; this.next = next; } }
class TreeNode { constructor(val = 0, left = null, right = null) { this.val = val; this.left = left; this.right = right; } }
`;

type Meta = { kind?: "function" | "design" | "sql" | "concurrency"; io?: { list?: number[]; lists?: number[]; tree?: number[]; ret?: "list" | "tree" | "arg0" }; scenario?: string; check?: string };

interface JsNode {
  val: unknown;
  next?: JsNode | null;
  left?: JsNode | null;
  right?: JsNode | null;
}

function makeHelpers(scope: { ListNode: new (v: unknown, n?: unknown) => JsNode; TreeNode: new (v: unknown) => JsNode }) {
  const toList = (arr: unknown[]) => {
    const head = new scope.ListNode(0);
    let cur = head;
    for (const v of arr) {
      cur.next = new scope.ListNode(v);
      cur = cur.next;
    }
    return head.next ?? null;
  };
  const fromList = (n: JsNode | null | undefined) => {
    const out: unknown[] = [];
    let guard = 0;
    while (n && guard++ < 100000) {
      out.push(n.val);
      n = n.next;
    }
    return out;
  };
  const toTree = (arr: unknown[]) => {
    if (!arr.length || arr[0] === null) return null;
    const root = new scope.TreeNode(arr[0]);
    const q = [root];
    let i = 1;
    while (q.length && i < arr.length) {
      const n = q.shift()!;
      if (i < arr.length && arr[i] !== null) q.push((n.left = new scope.TreeNode(arr[i])));
      i++;
      if (i < arr.length && arr[i] !== null) q.push((n.right = new scope.TreeNode(arr[i])));
      i++;
    }
    return root;
  };
  const fromTree = (root: JsNode | null) => {
    const out: unknown[] = [];
    const q: (JsNode | null | undefined)[] = [root];
    while (q.length) {
      const n = q.shift();
      if (!n) out.push(null);
      else {
        out.push(n.val);
        q.push(n.left ?? null, n.right ?? null);
      }
    }
    while (out.length && out[out.length - 1] === null) out.pop();
    return out;
  };
  return { toList, fromList, toTree, fromTree };
}

function loadJs(code: string, name: string, extra: Record<string, unknown> = {}) {
  const logs: string[] = [];
  const fake = { log: (...a: unknown[]) => logs.push(a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ")) };
  const keys = ["console", ...Object.keys(extra)];
  const scope = new Function(
    ...keys,
    `"use strict";\n${JS_PRELUDE}\n${code}\n;return { ListNode, TreeNode, target: typeof ${name} !== "undefined" ? ${name} : (typeof Solution !== "undefined" ? ((s) => s.${name} && s.${name}.bind(s))(new Solution()) : undefined) };`,
  )(fake, ...Object.values(extra));
  return { scope, logs };
}

function runJs(code: string, fn: string, tests: unknown[][], meta: Meta) {
  let loaded: ReturnType<typeof loadJs>;
  try {
    loaded = loadJs(code, fn);
  } catch (e) {
    return { fatal: String(e) };
  }
  const { scope, logs } = loaded;
  const target = scope.target as ((...a: unknown[]) => unknown) | (new (...a: unknown[]) => Record<string, (...a: unknown[]) => unknown>) | undefined;
  if (typeof target !== "function") return { fatal: `Не найден${meta.kind === "design" ? " класс" : "а функция"} ${fn}` };
  const h = makeHelpers(scope);
  const io = meta.io ?? {};
  return tests.map((raw) => {
    logs.length = 0;
    const t = performance.now();
    let output: unknown = null;
    let error: string | null = null;
    try {
      const args = structuredClone(raw);
      if (meta.kind === "design") {
        const [ops, argv] = args as [string[], unknown[][]];
        const Cls = target as new (...a: unknown[]) => Record<string, (...a: unknown[]) => unknown>;
        const obj = new Cls(...argv[0]);
        const res: unknown[] = [null];
        for (let i = 1; i < ops.length; i++) {
          const r = obj[ops[i]](...argv[i]);
          res.push(r === undefined ? null : r);
        }
        output = res;
      } else {
        for (const i of io.list ?? []) args[i] = h.toList(args[i] as unknown[]);
        for (const i of io.lists ?? []) args[i] = (args[i] as unknown[][]).map((x) => h.toList(x));
        for (const i of io.tree ?? []) args[i] = h.toTree(args[i] as unknown[]);
        let r = (target as (...a: unknown[]) => unknown)(...args);
        if (io.ret === "list") r = h.fromList(r as JsNode);
        else if (io.ret === "tree") r = h.fromTree(r as JsNode);
        else if (io.ret === "arg0") r = args[0];
        output = r === undefined ? null : r;
      }
    } catch (e) {
      error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    return { output, error, stdout: logs.join("\n").slice(0, 2000), ms: performance.now() - t };
  });
}

// ── Многопоточность: async-модель потоков ────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Примитивы синхронизации — как в java.util.concurrent, но на промисах. */
class Semaphore {
  private q: (() => void)[] = [];
  constructor(private permits = 0) {}
  async acquire() {
    if (this.permits > 0) {
      this.permits--;
      return;
    }
    await new Promise<void>((r) => this.q.push(r));
  }
  release() {
    const next = this.q.shift();
    if (next) next();
    else this.permits++;
  }
}
class Mutex {
  private s = new Semaphore(1);
  lock() {
    return this.s.acquire();
  }
  unlock() {
    this.s.release();
  }
}
class CountDownLatch {
  private waiters: (() => void)[] = [];
  constructor(private count: number) {}
  countDown() {
    if (this.count > 0 && --this.count === 0) this.waiters.splice(0).forEach((w) => w());
  }
  async await() {
    if (this.count === 0) return;
    await new Promise<void>((r) => this.waiters.push(r));
  }
}
class Condition {
  private waiters: (() => void)[] = [];
  wait() {
    return new Promise<void>((r) => this.waiters.push(r));
  }
  signal() {
    this.waiters.shift()?.();
  }
  signalAll() {
    this.waiters.splice(0).forEach((w) => w());
  }
}

async function runConcurrency(code: string, cls: string, tests: unknown[][], meta: Meta) {
  let loaded: ReturnType<typeof loadJs>;
  try {
    loaded = loadJs(code, cls, { Semaphore, Mutex, CountDownLatch, Condition, sleep });
  } catch (e) {
    return { fatal: String(e) };
  }
  const Cls = loaded.scope.target;
  if (typeof Cls !== "function") return { fatal: `Не найден класс ${cls}` };
  const scenario = new Function("return " + meta.scenario)() as (C: unknown, arg: unknown, out: unknown[], sleep: (ms: number) => Promise<void>, rnd: () => number) => Promise<void>;
  const check = new Function("return " + meta.check)() as (out: unknown[], arg: unknown) => true | string;
  const results = [];
  for (const [arg] of tests) {
    const out: unknown[] = [];
    const t = performance.now();
    let error: string | null = null;
    let verdict: true | string = true;
    try {
      const finished = await Promise.race([
        scenario(Cls, structuredClone(arg), out, (ms) => sleep(ms), Math.random).then(() => "done"),
        sleep(2500).then(() => "timeout"),
      ]);
      if (finished === "timeout") error = "Deadlock или вечное ожидание: сценарий не завершился за 2.5 с";
      else verdict = check(out, arg);
    } catch (e) {
      error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    results.push({
      output: out.length > 60 ? [...out.slice(0, 60), "…"] : out,
      error: error ?? (verdict === true ? null : null),
      stdout: verdict === true ? "" : `Проверка: ${verdict}`,
      ms: performance.now() - t,
      checked: !error && verdict === true,
    });
  }
  return results;
}

// ── SQL ──────────────────────────────────────────────────

let SQL: SqlJsStatic | null = null;
async function ensureSql() {
  if (!SQL) SQL = await initSqlJs({ locateFile: () => sqlWasmUrl });
  return SQL;
}

async function runSql(code: string, tests: unknown[][]) {
  const S = await ensureSql();
  return tests.map(([setup]) => {
    const db = new S.Database();
    const t = performance.now();
    try {
      db.exec(String(setup));
      const res = db.exec(code);
      const last = res[res.length - 1];
      const rows = last ? last.values.map((r) => r.map((v) => (typeof v === "number" && !Number.isInteger(v) ? Math.round(v * 1e5) / 1e5 : v))) : [];
      return { output: { columns: last?.columns ?? [], rows }, error: null, stdout: "", ms: performance.now() - t };
    } catch (e) {
      return { output: null, error: e instanceof Error ? e.message : String(e), stdout: "", ms: performance.now() - t };
    } finally {
      db.close();
    }
  });
}

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as
    | { type: "warm"; lang?: string }
    | { type: "run"; id: number; lang: string; code: string; fn: string; tests: string; meta: string };
  try {
    if (msg.type === "warm") {
      if (msg.lang === "sql") await ensureSql();
      else await ensurePython();
      self.postMessage({ type: "ready" });
      return;
    }
    const meta = JSON.parse(msg.meta || "{}") as Meta;
    const tests = JSON.parse(msg.tests) as unknown[][];
    let payload: unknown;
    if (msg.lang === "sql") payload = await runSql(msg.code, tests);
    else if (meta.kind === "concurrency") payload = await runConcurrency(msg.code, msg.fn, tests, meta);
    else if (msg.lang === "python") {
      const p = await ensurePython();
      payload = JSON.parse(p.globals.get("__run")(msg.code, msg.fn, msg.tests, msg.meta || "{}") as string);
    } else payload = runJs(msg.code, msg.fn, tests, meta);
    self.postMessage({ type: "result", id: msg.id, payload });
  } catch (err) {
    self.postMessage({ type: "result", id: (msg as { id?: number }).id ?? 0, payload: { fatal: String(err) } });
  }
};
