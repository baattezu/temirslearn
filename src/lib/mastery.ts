import { DUE_AT, dueAt, freshness, heatOf, intervalDays, type Heat, type ReviewState, type SrsMode } from "../../shared/srs";
import type { PracticeMap, ReviewMap } from "../app/data";
import { LESSONS, type Lesson } from "../content/catalog";
import { GENS } from "../content/practice";
import { SEGMENTS } from "../content/roadmaps";

// Индекс понимания. Четыре ступени на тему:
//   Знаком    — прошёл урок
//   Понимаю   — вспомнил его через интервал (повторение «помню»)
//   Объясняю  — сдал устный зачёт по теме на 70+
//   Применяю  — решил задачи по теме (LeetCode-задачи сегмента или тренажёр)
// Всё умножается на свежесть: не повторяешь — индекс тает вместе с цветом темы.

export const LEVELS = ["Не начато", "Знаком", "Понимаю", "Объясняю", "Применяю"] as const;

export interface Mastery {
  level: 0 | 1 | 2 | 3 | 4;
  value: number; // 0..1 с учётом свежести
  base: number; // 0..1 без свежести
  fresh: number; // 0..1
  heat: Heat | "none";
  reps: number;
  total: number;
  due: number | null; // ms
  interval: number; // дней
  explained: boolean;
  applied: boolean;
}

interface Ctx {
  reviews: ReviewMap;
  mode: SrsMode;
  topicScores: Record<string, number>;
  submissions: Record<string, { solved: boolean }>;
  practice: PracticeMap;
}

const problemsOf = (lessonId: string) =>
  Object.values(SEGMENTS)
    .filter((s) => s.lessons.includes(lessonId))
    .flatMap((s) => s.problems ?? []);

function appliedFor(lessonId: string, ctx: Ctx) {
  const probs = problemsOf(lessonId);
  if (probs.some((p) => ctx.submissions[p]?.solved)) return true;
  const gens = GENS.filter((g) => g.lesson === lessonId);
  return gens.length > 0 && gens.reduce((a, g) => a + (ctx.practice[g.id]?.solved ?? 0), 0) >= 3;
}

export function masteryOf(lessonId: string, ctx: Ctx, now = Date.now()): Mastery {
  const r: ReviewState | undefined = ctx.reviews[lessonId];
  const explained = (ctx.topicScores[lessonId] ?? 0) >= 70;
  const applied = appliedFor(lessonId, ctx);
  if (!r) {
    return { level: 0, value: 0, base: 0, fresh: 0, heat: "none", reps: 0, total: 0, due: null, interval: 0, explained, applied };
  }
  const fresh = freshness(r, ctx.mode, now);
  const base = Math.min(1, 0.35 + (r.reps >= 2 ? 0.25 : 0) + (r.reps >= 4 ? 0.1 : 0) + (explained ? 0.2 : 0) + (applied ? 0.1 : 0));
  const level = applied ? 4 : explained ? 3 : r.reps >= 2 ? 2 : 1;
  return {
    level,
    base,
    value: base * Math.min(1, fresh / DUE_AT),
    fresh,
    heat: heatOf(fresh),
    reps: r.reps,
    total: r.total,
    due: dueAt(r, ctx.mode),
    interval: intervalDays(r.reps, ctx.mode),
    explained,
    applied,
  };
}

/** Индекс по набору уроков: среднее по всем готовым урокам (непройденные тянут вниз). */
export function indexOf(lessons: Lesson[], ctx: Ctx, now = Date.now()) {
  const ready = lessons.filter((l) => l.ready);
  if (!ready.length) return 0;
  return ready.reduce((a, l) => a + masteryOf(l.id, ctx, now).value, 0) / ready.length;
}

/** Что пора повторить: от самых «потускневших». */
export function dueLessons(ctx: Ctx, now = Date.now()) {
  return LESSONS.filter((l) => l.ready && ctx.reviews[l.id])
    .map((l) => ({ lesson: l, m: masteryOf(l.id, ctx, now) }))
    .filter((x) => x.m.due !== null && x.m.due <= now)
    .sort((a, b) => a.m.fresh - b.m.fresh);
}

/** Цвет темы по свежести: зелёный → жёлтый → серый, плюс прозрачность. */
export function heatColor(m: Mastery) {
  if (m.heat === "none") return "var(--color-line-strong)";
  if (m.heat === "fresh") return "var(--color-ok)";
  if (m.heat === "due") return "var(--color-amber)";
  return "var(--color-mute)";
}
export function heatOpacity(m: Mastery) {
  if (m.heat === "none") return 1;
  return 0.35 + 0.65 * Math.min(1, m.fresh / DUE_AT);
}
