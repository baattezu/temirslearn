import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { ReviewGrade, ReviewState, SrsMode } from "../../shared/srs";
import { api } from "../lib/api";

export type Status = "todo" | "doing" | "done";
type ProgressMap = Record<string, { status: Status; at: number }>;
type SubmissionMap = Record<string, { attempts: number; solved: boolean; lastAt: number }>;
export type ReviewMap = Record<string, ReviewState>;
export type PracticeMap = Record<string, { attempts: number; solved: number; lastAt: number }>;
export type Settings = {
  srsMode?: SrsMode;
  assistant?: { seen?: string; muted?: boolean; hidden?: boolean };
  lessonFont?: "s" | "m" | "l";
  preQuestions?: boolean;
  reduceMotion?: boolean;
  dailyGoal?: number;
};
type InterviewListItem = { id: string; score: number | null; topic: string | null; finished_at: number | null; created_at: number };

interface Data {
  progress: ProgressMap;
  submissions: SubmissionMap;
  reviews: ReviewMap;
  practice: PracticeMap;
  /** последний балл зачёта по теме, 0..100 */
  topicScores: Record<string, number>;
  mode: SrsMode;
  settings: Settings;
  settingsLoaded: boolean;
  me: { user: string; ai: string } | null;
  setStatus: (lessonId: string, status: Status) => Promise<void>;
  review: (lessonId: string, grade: ReviewGrade) => Promise<void>;
  setSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => Promise<void>;
  refreshSubmissions: () => Promise<void>;
  refreshPractice: () => Promise<void>;
  refreshTopics: () => Promise<void>;
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ me, children }: { me: { user: string; ai: string }; children: ReactNode }) {
  const [progress, setProgress] = useState<ProgressMap>({});
  const [submissions, setSubmissions] = useState<SubmissionMap>({});
  const [reviews, setReviews] = useState<ReviewMap>({});
  const [practice, setPractice] = useState<PracticeMap>({});
  const [settings, setSettings] = useState<Settings>({});
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [interviews, setInterviews] = useState<InterviewListItem[]>([]);

  const refreshSubmissions = useCallback(async () => {
    setSubmissions(await api<SubmissionMap>("/submissions"));
  }, []);
  const refreshPractice = useCallback(async () => {
    setPractice(await api<PracticeMap>("/practice"));
  }, []);
  const refreshTopics = useCallback(async () => {
    setInterviews(await api<InterviewListItem[]>("/interviews"));
  }, []);

  useEffect(() => {
    api<ProgressMap>("/progress").then(setProgress).catch(() => {});
    api<ReviewMap>("/reviews").then(setReviews).catch(() => {});
    api<Settings>("/settings")
      .then((s) => {
        setSettings(s);
        setSettingsLoaded(true);
      })
      .catch(() => {});
    refreshSubmissions().catch(() => {});
    refreshPractice().catch(() => {});
    refreshTopics().catch(() => {});
  }, [refreshSubmissions, refreshPractice, refreshTopics]);

  const setStatus = useCallback(async (lessonId: string, status: Status) => {
    setProgress((p) => ({ ...p, [lessonId]: { status, at: Date.now() } }));
    if (status === "done")
      setReviews((r) => (r[lessonId] ? r : { ...r, [lessonId]: { reps: 1, total: 1, last: Date.now(), lapses: 0 } }));
    await api(`/progress/${encodeURIComponent(lessonId)}`, { method: "PUT", json: { status } });
  }, []);

  const review = useCallback(async (lessonId: string, grade: ReviewGrade) => {
    const st = await api<ReviewState>(`/reviews/${encodeURIComponent(lessonId)}`, { method: "POST", json: { grade } });
    setReviews((r) => ({ ...r, [lessonId]: st }));
  }, []);

  const setSetting = useCallback(async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((s) => ({ ...s, [key]: value }));
    await api(`/settings/${key}`, { method: "PUT", json: value });
  }, []);

  const topicScores = useMemo(() => {
    const out: Record<string, number> = {};
    // список отсортирован от новых к старым — берём последний законченный зачёт
    for (const i of interviews) {
      if (!i.topic || i.score === null) continue;
      const id = (JSON.parse(i.topic) as { id: string }).id;
      if (!(id in out)) out[id] = i.score;
    }
    return out;
  }, [interviews]);

  const value: Data = useMemo(() => ({
    progress,
    submissions,
    reviews,
    practice,
    topicScores,
    mode: settings.srsMode ?? "standard",
    settings,
    settingsLoaded,
    me,
    setStatus,
    review,
    setSetting,
    refreshSubmissions,
    refreshPractice,
    refreshTopics,
  }), [progress, submissions, reviews, practice, topicScores, settings, settingsLoaded, me, setStatus, review, setSetting, refreshSubmissions, refreshPractice, refreshTopics]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("DataProvider missing");
  return v;
}
