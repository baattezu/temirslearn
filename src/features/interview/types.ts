import type { Grade, Lang, Level, Question, RoleId, Summary } from "../../../shared/interview";

export interface InterviewListItem {
  id: string;
  role: RoleId;
  level: Level;
  lang: Lang;
  score: number | null;
  created_at: number;
  finished_at: number | null;
  total: number;
  answered: number;
}

export interface Answer {
  idx: number;
  transcript: string;
  grade: Grade;
  score: number;
}

export interface Interview {
  id: string;
  role: RoleId;
  level: Level;
  lang: Lang;
  questions: Question[];
  summary: Summary | null;
  score: number | null;
  created_at: number;
  finished_at: number | null;
  answers: Answer[];
}
