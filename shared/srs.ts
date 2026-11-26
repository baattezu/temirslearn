// Интервальные повторения: общий код фронта и Worker.
//
// У каждого урока есть «шаг» (reps) — сколько раз подряд ты его вспомнил.
// Шаг задаёт интервал до следующего повторения; режим задаёт лестницу интервалов.
// Свежесть падает экспоненциально (кривая забывания): в момент «пора повторить» она 75%,
// дальше уходит в жёлтый, потом в серый.

export type SrsMode = "standard" | "exam" | "light";

export const SRS_MODES: { id: SrsMode; label: string; short: string; ladder: number[]; about: string }[] = [
  {
    id: "standard",
    label: "Стандарт",
    short: "Стандарт",
    ladder: [1, 3, 7, 16, 35, 90, 180],
    about: "1 → 3 → 7 → 16 → 35 → 90 дней. Классическая лестница: знание закрепляется надолго.",
  },
  {
    id: "exam",
    label: "Перед собесом",
    short: "Собес",
    ladder: [1, 2, 4, 7, 12, 20, 30],
    about: "1 → 2 → 4 → 7 → 12 дней. Чаще и плотнее, когда интервью через пару недель.",
  },
  {
    id: "light",
    label: "Лёгкий",
    short: "Лёгкий",
    ladder: [2, 7, 21, 60, 150],
    about: "2 → 7 → 21 → 60 дней. Когда учишь много нового и на повторы мало времени.",
  },
];

export type ReviewGrade = "first" | "good" | "hard" | "again";

export interface ReviewState {
  reps: number; // текущий шаг, ≥ 1
  total: number; // всего прохождений
  last: number; // ms
  lapses: number;
}

const DAY = 86_400_000;
/** Свежесть в момент «пора повторить». */
export const DUE_AT = 0.75;
const K = 1 / Math.log(1 / DUE_AT); // ≈ 3.48

export function ladderOf(mode: SrsMode) {
  return (SRS_MODES.find((m) => m.id === mode) ?? SRS_MODES[0]).ladder;
}

export function intervalDays(reps: number, mode: SrsMode) {
  const l = ladderOf(mode);
  return l[Math.min(Math.max(reps, 1) - 1, l.length - 1)];
}

export function nextState(prev: ReviewState | undefined, grade: ReviewGrade, now: number): ReviewState {
  if (!prev || grade === "first") {
    return prev ? { ...prev, total: prev.total + 1, last: now } : { reps: 1, total: 1, last: now, lapses: 0 };
  }
  if (grade === "good") return { ...prev, reps: prev.reps + 1, total: prev.total + 1, last: now };
  if (grade === "hard") return { ...prev, total: prev.total + 1, last: now };
  return { reps: 1, total: prev.total + 1, last: now, lapses: prev.lapses + 1 };
}

/** 0..1 — насколько тема ещё «держится» в голове. */
export function freshness(s: ReviewState, mode: SrsMode, now = Date.now()) {
  const elapsed = Math.max(0, now - s.last) / DAY;
  return Math.exp(-elapsed / (intervalDays(s.reps, mode) * K));
}

export function dueAt(s: ReviewState, mode: SrsMode) {
  return s.last + intervalDays(s.reps, mode) * DAY;
}

export type Heat = "fresh" | "due" | "faded";
export function heatOf(f: number): Heat {
  return f >= DUE_AT - 1e-9 ? "fresh" : f >= 0.45 ? "due" : "faded";
}
