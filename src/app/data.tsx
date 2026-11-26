import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";

export type Status = "todo" | "doing" | "done";
type ProgressMap = Record<string, { status: Status; at: number }>;
type SubmissionMap = Record<string, { attempts: number; solved: boolean; lastAt: number }>;

interface Data {
  progress: ProgressMap;
  submissions: SubmissionMap;
  me: { user: string; ai: string } | null;
  setStatus: (lessonId: string, status: Status) => Promise<void>;
  refreshSubmissions: () => Promise<void>;
}

const Ctx = createContext<Data | null>(null);

export function DataProvider({ me, children }: { me: { user: string; ai: string }; children: ReactNode }) {
  const [progress, setProgress] = useState<ProgressMap>({});
  const [submissions, setSubmissions] = useState<SubmissionMap>({});

  const refreshSubmissions = useCallback(async () => {
    setSubmissions(await api<SubmissionMap>("/submissions"));
  }, []);

  useEffect(() => {
    api<ProgressMap>("/progress").then(setProgress).catch(() => {});
    refreshSubmissions().catch(() => {});
  }, [refreshSubmissions]);

  const setStatus = useCallback(async (lessonId: string, status: Status) => {
    setProgress((p) => ({ ...p, [lessonId]: { status, at: Date.now() } }));
    await api(`/progress/${encodeURIComponent(lessonId)}`, { method: "PUT", json: { status } });
  }, []);

  return <Ctx.Provider value={{ progress, submissions, me, setStatus, refreshSubmissions }}>{children}</Ctx.Provider>;
}

export function useData() {
  const v = useContext(Ctx);
  if (!v) throw new Error("DataProvider missing");
  return v;
}
