import { ROLES, type Grade, type Lang, type Level, type Question, type RoleId, type Summary } from "../shared/interview";
import { chatJson } from "./ai";

const str = { type: "string" };
const strArr = { type: "array", items: str };

const QUESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["q", "topic", "expects"],
        properties: { q: str, topic: str, expects: strArr },
      },
    },
  },
};

const GRADE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "verdict", "covered", "missed", "wrong", "delivery", "better_answer", "followup"],
  properties: {
    score: { type: "number" },
    verdict: { type: "string", enum: ["strong", "ok", "weak", "miss"] },
    covered: strArr,
    missed: strArr,
    wrong: strArr,
    delivery: str,
    better_answer: str,
    followup: str,
  },
};

const SUMMARY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "decision", "headline", "strengths", "gaps", "study_plan"],
  properties: {
    score: { type: "number" },
    decision: { type: "string", enum: ["hire", "lean_hire", "lean_no", "no"] },
    headline: str,
    strengths: strArr,
    gaps: strArr,
    study_plan: strArr,
  },
};

const langName = (lang: Lang) => (lang === "en" ? "English" : "Russian");
const role = (id: RoleId) => ROLES.find((r) => r.id === id) ?? ROLES[0];

export function asrHint(roleId: RoleId) {
  return `Technical interview answer. Topics: ${role(roleId).focus}.`;
}

export async function generateQuestions(env: Env, roleId: RoleId, level: Level, lang: Lang, count: number, avoid: string[]) {
  const r = role(roleId);
  const out = await chatJson<{ questions: Question[] }>(env, {
    name: "interview_questions",
    system:
      "You are a demanding but fair technical interviewer at a strong product company hiring remote engineers. " +
      "You write questions that real interviewers ask: they probe understanding, trade-offs and production experience, not trivia or definitions. " +
      "Each question must be answerable out loud in 1–3 minutes.",
    user: [
      `Role: ${r.label}. Level: ${level}. Focus areas: ${r.focus}.`,
      `Write exactly ${count} questions in ${langName(lang)}, ordered from warm-up to hard.`,
      "Mix: mostly 'how does X work / what happens when', at least one trade-off question, and one realistic production scenario (debugging, incident or design decision).",
      "Cover different focus areas, do not ask two questions on the same narrow topic.",
      "For each question give `topic` (2–4 words) and `expects`: 3–6 short key points a strong answer at this level covers.",
      avoid.length ? `Do not repeat these recently asked questions:\n- ${avoid.slice(0, 40).join("\n- ")}` : "",
    ]
      .filter(Boolean)
      .join("\n"),
    schema: QUESTIONS_SCHEMA,
  });
  return out.questions.slice(0, count);
}

export async function gradeAnswer(env: Env, roleId: RoleId, level: Level, lang: Lang, q: Question, transcript: string) {
  const g = await chatJson<Grade>(env, {
    name: "answer_grade",
    system:
      "You grade spoken interview answers. The answer is a speech-to-text transcript: ignore recognition glitches, filler words and odd punctuation, judge the substance. " +
      "Be calibrated: 10 = would impress a senior interviewer, 7 = solid pass, 5 = borderline, 3 = major gaps, 0 = no answer or wrong. " +
      "Point out factual errors explicitly. Never invent things the candidate did not say.",
    user: [
      `Role: ${role(roleId).label}, level: ${level}.`,
      `Question: ${q.q}`,
      `Key points expected: ${q.expects.join("; ")}`,
      `Candidate answer (transcript):\n"""${transcript.slice(0, 8000)}"""`,
      `Write all text fields in ${langName(lang)}.`,
      "covered / missed / wrong: short bullet phrases; use an empty array when there is nothing (never write 'none'). missed: only points that genuinely matter for this question at this level, and only facts true for current versions of the technology. delivery: one or two sentences on structure and clarity of the spoken answer. " +
        "better_answer: a concise model answer the candidate could say in about a minute. followup: the follow-up question you would ask next.",
    ].join("\n"),
    schema: GRADE_SCHEMA,
    maxTokens: 3000,
  });
  g.score = Math.max(0, Math.min(10, Math.round(g.score * 10) / 10));
  g.verdict = g.score >= 8 ? "strong" : g.score >= 6 ? "ok" : g.score >= 3 ? "weak" : "miss";
  g.wrong = g.wrong.filter((w) => !/^(none|нет)\b/i.test(w.trim()));
  return g;
}

export async function summarize(
  env: Env,
  roleId: RoleId,
  level: Level,
  lang: Lang,
  items: { q: Question; transcript: string; grade: Grade }[],
) {
  const s = await chatJson<Summary>(env, {
    name: "interview_summary",
    system:
      "You are the interviewer writing the debrief after a technical interview. Be honest and specific, like a hiring committee note.",
    user: [
      `Role: ${role(roleId).label}, level: ${level}. Write in ${langName(lang)}.`,
      ...items.map(
        (it, i) =>
          `Q${i + 1} [${it.q.topic}] ${it.q.q}\nScore ${it.grade.score}/10. Covered: ${it.grade.covered.join("; ")}. Missed: ${it.grade.missed.join("; ")}. Wrong: ${it.grade.wrong.join("; ")}.`,
      ),
      "score: 0–100 overall for this role and level. decision: hire | lean_hire | lean_no | no. headline: one sentence verdict. " +
        "strengths and gaps: 2–5 items each. study_plan: 3–6 concrete topics to study next, most important first.",
    ].join("\n\n"),
    schema: SUMMARY_SCHEMA,
    maxTokens: 2000,
  });
  s.score = Math.max(0, Math.min(100, Math.round(s.score)));
  return s;
}
