import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { LANGS, LEVELS, ROLES, type Grade, type Lang, type Level, type Question, type RoleId } from "../shared/interview";
import { aiProvider, toBase64, transcribe } from "./ai";
import { login, logout, requireAuth } from "./auth";
import { nextState, type ReviewGrade, type ReviewState } from "../shared/srs";
import { checkPhoto } from "./practice";
import { asrHint, generateQuestions, generateTopicQuestions, gradeAnswer, summarize, type Topic } from "./interview";

type App = { Bindings: Env };
const app = new Hono<App>().basePath("/api");

const now = () => Date.now();
// День в часовом поясе Астаны (UTC+5) — для календаря активности
const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

async function bump(db: D1Database, kind: "lesson" | "problem" | "interview" | "note" | "review" | "practice") {
  await db
    .prepare("INSERT INTO activity (day, kind, count) VALUES (?, ?, 1) ON CONFLICT(day, kind) DO UPDATE SET count = count + 1")
    .bind(today(), kind)
    .run();
}

const bad = (msg: string) => new HTTPException(400, { message: msg });

app.onError((err, c) => {
  if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : "Ошибка сервера" }, 500);
});

app.get("/health", (c) => c.json({ ok: true }));
app.post("/auth/login", login);
app.post("/auth/logout", logout);

app.use("*", requireAuth);

app.get("/auth/me", (c) => c.json({ user: c.env.AUTH_USER, ai: aiProvider(c.env) }));

// ── Прогресс ──────────────────────────────────────────────

app.get("/progress", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT lesson_id, status, updated_at FROM progress").all<{
    lesson_id: string;
    status: string;
    updated_at: number;
  }>();
  return c.json(Object.fromEntries(results.map((r) => [r.lesson_id, { status: r.status, at: r.updated_at }])));
});

app.put("/progress/:lessonId", async (c) => {
  const { status } = await c.req.json<{ status: string }>();
  if (!["todo", "doing", "done"].includes(status)) throw bad("status: todo | doing | done");
  const id = c.req.param("lessonId");
  await c.env.DB.prepare(
    "INSERT INTO progress (lesson_id, status, updated_at) VALUES (?, ?, ?) ON CONFLICT(lesson_id) DO UPDATE SET status = excluded.status, updated_at = excluded.updated_at",
  )
    .bind(id, status, now())
    .run();
  if (status === "done") {
    await bump(c.env.DB, "lesson");
    // первое прохождение запускает лестницу повторений
    await c.env.DB.prepare("INSERT INTO reviews (lesson_id, reps, total, last_at, lapses) VALUES (?, 1, 1, ?, 0) ON CONFLICT(lesson_id) DO NOTHING")
      .bind(id, now())
      .run();
  }
  return c.json({ ok: true });
});

// ── Повторения ────────────────────────────────────────────

type ReviewRow = { lesson_id: string; reps: number; total: number; last_at: number; lapses: number };
const toState = (r: ReviewRow): ReviewState => ({ reps: r.reps, total: r.total, last: r.last_at, lapses: r.lapses });

app.get("/reviews", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM reviews").all<ReviewRow>();
  return c.json(Object.fromEntries(results.map((r) => [r.lesson_id, toState(r)])));
});

app.post("/reviews/:lessonId", async (c) => {
  const { grade } = await c.req.json<{ grade: ReviewGrade }>();
  if (!["first", "good", "hard", "again"].includes(grade)) throw bad("grade: first | good | hard | again");
  const id = c.req.param("lessonId");
  const row = await c.env.DB.prepare("SELECT * FROM reviews WHERE lesson_id = ?").bind(id).first<ReviewRow>();
  const st = nextState(row ? toState(row) : undefined, grade, now());
  await c.env.DB.prepare(
    `INSERT INTO reviews (lesson_id, reps, total, last_at, lapses) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(lesson_id) DO UPDATE SET reps = excluded.reps, total = excluded.total, last_at = excluded.last_at, lapses = excluded.lapses`,
  )
    .bind(id, st.reps, st.total, st.last, st.lapses)
    .run();
  await bump(c.env.DB, "review");
  return c.json(st);
});

app.delete("/reviews/:lessonId", async (c) => {
  await c.env.DB.prepare("DELETE FROM reviews WHERE lesson_id = ?").bind(c.req.param("lessonId")).run();
  return c.json({ ok: true });
});

// ── Настройки ─────────────────────────────────────────────

app.get("/settings", async (c) => {
  const { results } = await c.env.DB.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  return c.json(Object.fromEntries(results.map((r) => [r.key, JSON.parse(r.value)])));
});

app.put("/settings/:key", async (c) => {
  const key = c.req.param("key");
  if (!/^[A-Za-z][A-Za-z0-9_.-]{0,40}$/.test(key)) throw bad("bad key");
  const body = await c.req.text();
  if (body.length > 10_000) throw bad("too large");
  JSON.parse(body);
  await c.env.DB.prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, body)
    .run();
  return c.json({ ok: true });
});

// ── Выделения ─────────────────────────────────────────────

const COLORS = ["yellow", "green", "blue", "pink"];

app.get("/highlights", async (c) => {
  const lesson = c.req.query("lesson");
  const stmt = lesson
    ? c.env.DB.prepare("SELECT * FROM highlights WHERE lesson_id = ? ORDER BY created_at").bind(lesson)
    : c.env.DB.prepare("SELECT * FROM highlights ORDER BY lesson_id, created_at LIMIT 2000");
  return c.json((await stmt.all()).results);
});

app.post("/highlights", async (c) => {
  const b = await c.req.json<{ lesson_id: string; color: string; quote: string; prefix?: string; suffix?: string }>();
  if (!b.lesson_id || !b.quote?.trim() || !COLORS.includes(b.color)) throw bad("bad highlight");
  const row = {
    id: crypto.randomUUID(),
    lesson_id: b.lesson_id,
    color: b.color,
    quote: b.quote.slice(0, 5000),
    prefix: (b.prefix ?? "").slice(-64),
    suffix: (b.suffix ?? "").slice(0, 64),
    created_at: now(),
  };
  await c.env.DB.prepare("INSERT INTO highlights (id, lesson_id, color, quote, prefix, suffix, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.lesson_id, row.color, row.quote, row.prefix, row.suffix, row.created_at)
    .run();
  return c.json(row);
});

app.put("/highlights/:id", async (c) => {
  const { color } = await c.req.json<{ color: string }>();
  if (!COLORS.includes(color)) throw bad("bad color");
  await c.env.DB.prepare("UPDATE highlights SET color = ? WHERE id = ?").bind(color, c.req.param("id")).run();
  return c.json({ ok: true });
});

app.delete("/highlights/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM highlights WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ── Тренажёр ──────────────────────────────────────────────

app.get("/practice", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT gen, COUNT(*) AS attempts, SUM(correct = 1) AS solved, MAX(created_at) AS last_at FROM practice GROUP BY gen`,
  ).all<{ gen: string; attempts: number; solved: number; last_at: number }>();
  return c.json(Object.fromEntries(results.map((r) => [r.gen, { attempts: r.attempts, solved: r.solved, lastAt: r.last_at }])));
});

app.post("/practice", async (c) => {
  const b = await c.req.json<{ gen: string; seed: number; correct: number }>();
  if (!b.gen || typeof b.seed !== "number" || ![1, 0, -1].includes(b.correct)) throw bad("bad attempt");
  await c.env.DB.prepare("INSERT INTO practice (gen, seed, correct, created_at) VALUES (?, ?, ?, ?)")
    .bind(b.gen, b.seed, b.correct, now())
    .run();
  if (b.correct === 1) await bump(c.env.DB, "practice");
  return c.json({ ok: true });
});

/** Фото решения с бумаги → ИИ ищет первый неверный шаг. */
app.post("/practice/check", async (c) => {
  const form = await c.req.formData();
  const meta = JSON.parse(String(form.get("meta") ?? "{}")) as {
    gen: string;
    seed: number;
    statement: string;
    answer: string;
    solution: string[];
    userAnswer?: string;
  };
  const files = form.getAll("photo").filter((f): f is File => typeof f !== "string");
  if (!files.length) throw bad("Прикрепи фото решения");
  if (files.length > 4) throw bad("Не больше 4 фото");
  const images: string[] = [];
  for (const f of files) {
    if (f.size > 6 * 1024 * 1024) throw bad("Фото больше 6 МБ");
    images.push(`data:${f.type || "image/jpeg"};base64,${toBase64(await f.arrayBuffer())}`);
  }
  const result = await checkPhoto(c.env, meta, images);
  await c.env.DB.prepare("INSERT INTO practice (gen, seed, correct, ai, created_at) VALUES (?, ?, ?, ?, ?)")
    .bind(meta.gen, meta.seed, result.correct ? 1 : 0, JSON.stringify(result), now())
    .run();
  return c.json(result);
});

// ── Заметки ───────────────────────────────────────────────

type NoteRow = { id: string; lesson_id: string | null; title: string; body: string; created_at: number; updated_at: number };

app.get("/notes", async (c) => {
  const lesson = c.req.query("lesson");
  const q = c.req.query("q")?.trim();
  let stmt;
  if (lesson) stmt = c.env.DB.prepare("SELECT * FROM notes WHERE lesson_id = ? ORDER BY updated_at DESC").bind(lesson);
  else if (q)
    stmt = c.env.DB.prepare("SELECT * FROM notes WHERE title LIKE ?1 OR body LIKE ?1 ORDER BY updated_at DESC LIMIT 200").bind(
      `%${q}%`,
    );
  else stmt = c.env.DB.prepare("SELECT * FROM notes ORDER BY updated_at DESC LIMIT 500");
  return c.json((await stmt.all<NoteRow>()).results);
});

app.get("/notes/:id", async (c) => {
  const row = await c.env.DB.prepare("SELECT * FROM notes WHERE id = ?").bind(c.req.param("id")).first<NoteRow>();
  return row ? c.json(row) : c.json({ error: "not found" }, 404);
});

app.post("/notes", async (c) => {
  const b = await c.req.json<{ lesson_id?: string | null; title?: string; body?: string }>();
  const row: NoteRow = {
    id: crypto.randomUUID(),
    lesson_id: b.lesson_id ?? null,
    title: (b.title ?? "").trim() || "Без названия",
    body: b.body ?? "",
    created_at: now(),
    updated_at: now(),
  };
  await c.env.DB.prepare("INSERT INTO notes (id, lesson_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.lesson_id, row.title, row.body, row.created_at, row.updated_at)
    .run();
  await bump(c.env.DB, "note");
  return c.json(row);
});

app.put("/notes/:id", async (c) => {
  const b = await c.req.json<{ title?: string; body?: string }>();
  await c.env.DB.prepare("UPDATE notes SET title = COALESCE(?, title), body = COALESCE(?, body), updated_at = ? WHERE id = ?")
    .bind(b.title?.trim() || null, b.body ?? null, now(), c.req.param("id"))
    .run();
  return c.json({ ok: true });
});

app.delete("/notes/:id", async (c) => {
  await c.env.DB.prepare("DELETE FROM notes WHERE id = ?").bind(c.req.param("id")).run();
  return c.json({ ok: true });
});

// ── Задачи ────────────────────────────────────────────────

app.get("/submissions", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT problem_id, COUNT(*) AS attempts, MAX(passed = total) AS solved, MAX(created_at) AS last_at
     FROM submissions GROUP BY problem_id`,
  ).all<{ problem_id: string; attempts: number; solved: number; last_at: number }>();
  return c.json(Object.fromEntries(results.map((r) => [r.problem_id, { attempts: r.attempts, solved: !!r.solved, lastAt: r.last_at }])));
});

app.get("/submissions/:problemId", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT id, lang, code, passed, total, created_at FROM submissions WHERE problem_id = ? ORDER BY created_at DESC LIMIT 30",
  )
    .bind(c.req.param("problemId"))
    .all();
  return c.json(results);
});

app.post("/submissions", async (c) => {
  const b = await c.req.json<{ problem_id: string; lang: string; code: string; passed: number; total: number }>();
  if (!b.problem_id || !b.lang || typeof b.passed !== "number" || typeof b.total !== "number") throw bad("bad submission");
  await c.env.DB.prepare("INSERT INTO submissions (problem_id, lang, code, passed, total, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(b.problem_id, b.lang, (b.code ?? "").slice(0, 50_000), b.passed, b.total, now())
    .run();
  await bump(c.env.DB, "problem");
  return c.json({ ok: true });
});

// ── Интервью ──────────────────────────────────────────────

type InterviewRow = {
  id: string;
  role: RoleId;
  level: Level;
  lang: Lang;
  questions: string;
  summary: string | null;
  score: number | null;
  created_at: number;
  finished_at: number | null;
  topic: string | null;
};
const topicOf = (row: InterviewRow) => (row.topic ? (JSON.parse(row.topic) as Topic) : null);
type AnswerRow = { idx: number; transcript: string; grade: string; score: number; created_at: number };

async function loadInterview(db: D1Database, id: string) {
  const row = await db.prepare("SELECT * FROM interviews WHERE id = ?").bind(id).first<InterviewRow>();
  if (!row) throw new HTTPException(404, { message: "Интервью не найдено" });
  return row;
}

app.get("/interviews", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT i.id, i.role, i.level, i.lang, i.score, i.created_at, i.finished_at, i.topic,
            json_array_length(i.questions) AS total,
            (SELECT COUNT(*) FROM interview_answers a WHERE a.interview_id = i.id) AS answered
     FROM interviews i ORDER BY i.created_at DESC LIMIT 100`,
  ).all();
  return c.json(results);
});

app.post("/interviews", async (c) => {
  const b = await c.req.json<{ role: RoleId; level: Level; lang: Lang; count: number; topic?: Topic }>();
  if (b.topic) {
    // зачёт по теме урока
    const t = b.topic;
    if (!t.id || !t.title) throw bad("bad topic");
    const topic: Topic = { id: t.id.slice(0, 120), title: t.title.slice(0, 200), focus: (t.focus ?? "").slice(0, 4000) };
    const lang: Lang = b.lang === "en" ? "en" : "ru";
    const count = Math.max(1, Math.min(5, Math.round(b.count || 3)));
    const questions = await generateTopicQuestions(c.env, topic, lang, count);
    if (!questions.length) throw new Error("Модель не вернула вопросы");
    const id = crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO interviews (id, role, level, lang, questions, created_at, topic) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(id, "dsa", "middle", lang, JSON.stringify(questions), now(), JSON.stringify(topic))
      .run();
    await bump(c.env.DB, "interview");
    return c.json({ id });
  }
  if (!ROLES.some((r) => r.id === b.role)) throw bad("unknown role");
  if (!LEVELS.some((l) => l.id === b.level)) throw bad("unknown level");
  if (!LANGS.some((l) => l.id === b.lang)) throw bad("unknown lang");
  const count = Math.max(1, Math.min(10, Math.round(b.count || 5)));

  const { results: recent } = await c.env.DB.prepare(
    "SELECT questions FROM interviews WHERE role = ? AND topic IS NULL ORDER BY created_at DESC LIMIT 8",
  )
    .bind(b.role)
    .all<{ questions: string }>();
  const avoid = recent.flatMap((r) => (JSON.parse(r.questions) as Question[]).map((q) => q.q));

  const questions = await generateQuestions(c.env, b.role, b.level, b.lang, count, avoid);
  if (!questions.length) throw new Error("Модель не вернула вопросы");
  const id = crypto.randomUUID();
  await c.env.DB.prepare("INSERT INTO interviews (id, role, level, lang, questions, created_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, b.role, b.level, b.lang, JSON.stringify(questions), now())
    .run();
  await bump(c.env.DB, "interview");
  return c.json({ id });
});

app.get("/interviews/:id", async (c) => {
  const row = await loadInterview(c.env.DB, c.req.param("id"));
  const { results } = await c.env.DB.prepare(
    "SELECT idx, transcript, grade, score, created_at FROM interview_answers WHERE interview_id = ? ORDER BY idx",
  )
    .bind(row.id)
    .all<AnswerRow>();
  return c.json({
    ...row,
    topic: topicOf(row),
    questions: JSON.parse(row.questions) as Question[],
    summary: row.summary ? JSON.parse(row.summary) : null,
    answers: results.map((a) => ({ ...a, grade: JSON.parse(a.grade) as Grade })),
  });
});

app.delete("/interviews/:id", async (c) => {
  const id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM interview_answers WHERE interview_id = ?").bind(id),
    c.env.DB.prepare("DELETE FROM interviews WHERE id = ?").bind(id),
  ]);
  return c.json({ ok: true });
});

app.post("/interviews/:id/transcribe", async (c) => {
  const row = await loadInterview(c.env.DB, c.req.param("id"));
  const audio = await c.req.arrayBuffer();
  if (audio.byteLength < 1000) throw bad("Запись пустая");
  if (audio.byteLength > 20 * 1024 * 1024) throw bad("Запись больше 20 МБ — отвечай короче");
  const text = await transcribe(c.env, audio, row.lang, asrHint(row.role, topicOf(row)));
  return c.json({ text });
});

app.post("/interviews/:id/answers/:idx", async (c) => {
  const row = await loadInterview(c.env.DB, c.req.param("id"));
  const idx = Number(c.req.param("idx"));
  const questions = JSON.parse(row.questions) as Question[];
  const q = questions[idx];
  if (!q) throw bad("Нет такого вопроса");
  const { transcript } = await c.req.json<{ transcript: string }>();
  if (!transcript?.trim()) throw bad("Пустой ответ");

  const grade = await gradeAnswer(c.env, row.role, row.level, row.lang, q, transcript.trim(), topicOf(row));
  await c.env.DB.prepare(
    `INSERT INTO interview_answers (interview_id, idx, transcript, grade, score, created_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(interview_id, idx) DO UPDATE SET transcript = excluded.transcript, grade = excluded.grade, score = excluded.score, created_at = excluded.created_at`,
  )
    .bind(row.id, idx, transcript.trim(), JSON.stringify(grade), grade.score, now())
    .run();
  return c.json({ idx, transcript: transcript.trim(), grade, score: grade.score });
});

app.post("/interviews/:id/finish", async (c) => {
  const row = await loadInterview(c.env.DB, c.req.param("id"));
  const questions = JSON.parse(row.questions) as Question[];
  const { results } = await c.env.DB.prepare("SELECT idx, transcript, grade FROM interview_answers WHERE interview_id = ? ORDER BY idx")
    .bind(row.id)
    .all<AnswerRow>();
  if (!results.length) throw bad("Нет ни одного ответа");
  const items = results.map((a) => ({ q: questions[a.idx], transcript: a.transcript, grade: JSON.parse(a.grade) as Grade }));
  const summary = await summarize(c.env, row.role, row.level, row.lang, items, topicOf(row));
  await c.env.DB.prepare("UPDATE interviews SET summary = ?, score = ?, finished_at = ? WHERE id = ?")
    .bind(JSON.stringify(summary), summary.score, now(), row.id)
    .run();
  return c.json(summary);
});

// ── Экспорт всех данных ───────────────────────────────────

app.get("/export", async (c) => {
  const tables = ["progress", "reviews", "notes", "highlights", "submissions", "practice", "interviews", "interview_answers", "settings", "activity"];
  const out: Record<string, unknown[]> = {};
  for (const t of tables) out[t] = (await c.env.DB.prepare(`SELECT * FROM ${t}`).all()).results;
  c.header("content-disposition", `attachment; filename="temirslearn-${today()}.json"`);
  return c.json({ exported_at: new Date().toISOString(), ...out });
});

// ── Главная ───────────────────────────────────────────────

app.get("/activity", async (c) => {
  const { results } = await c.env.DB.prepare(
    "SELECT day, SUM(count) AS count FROM activity WHERE day >= date('now', '-370 days') GROUP BY day ORDER BY day",
  ).all<{ day: string; count: number }>();
  return c.json(results);
});

export default app;
