import { chatJson } from "./ai";

// Проверка решения с бумаги. Правильный ответ и эталонное решение мы знаем детерминированно
// (задачу сгенерировал фронт по seed), поэтому модель не решает задачу сама —
// она только читает почерк и сравнивает шаги с эталоном.

export interface PhotoCheck {
  correct: boolean; // итоговый ответ на фото совпадает с эталоном
  read_answer: string; // какой ответ модель прочла на фото
  steps: { text: string; ok: boolean; note: string }[]; // шаги, как они записаны на бумаге
  first_error: string; // где впервые ошибся ("" если ошибок нет)
  why: string; // почему это ошибка, какое правило нарушено
  hint: string; // как исправить, не давая сразу весь ответ
  praise: string; // что сделано хорошо
  legible: boolean; // удалось ли прочитать фото
}

const str = { type: "string" };
const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["correct", "read_answer", "steps", "first_error", "why", "hint", "praise", "legible"],
  properties: {
    correct: { type: "boolean" },
    read_answer: str,
    steps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "ok", "note"],
        properties: { text: str, ok: { type: "boolean" }, note: str },
      },
    },
    first_error: str,
    why: str,
    hint: str,
    praise: str,
    legible: { type: "boolean" },
  },
};

export async function checkPhoto(
  env: Env,
  meta: { statement: string; answer: string; solution: string[]; userAnswer?: string },
  images: string[],
) {
  const r = await chatJson<PhotoCheck>(env, {
    name: "paper_check",
    system:
      "You are a patient math teacher checking a student's handwritten solution from a photo. " +
      "The correct answer and a reference solution are given — trust them, do not re-derive the problem. " +
      "Your job: transcribe the student's steps as written, compare each step with correct mathematics (the student may use a different but valid method — that is fine), " +
      "and find the FIRST step where the work goes wrong. Never invent steps that are not on the photo. " +
      "Write every text field in Russian; formulas in plain text or LaTeX without $ delimiters.",
    user: [
      `Problem: ${meta.statement}`,
      `Correct final answer: ${meta.answer}`,
      `Reference solution:\n${meta.solution.map((s, i) => `${i + 1}. ${s}`).join("\n")}`,
      meta.userAnswer ? `The student also typed this final answer: ${meta.userAnswer}` : "",
      "Fill: legible (false if you cannot read the work — then explain in `why`), steps (the student's steps in order, ok=false on wrong ones, note = short comment), " +
        "read_answer (final answer as written), correct (final answer equals the correct one), first_error (quote exactly the text of the first step with ok=false, empty if all steps are ok), " +
        "why (which rule was broken and why it is wrong, 1–3 sentences), hint (how to fix it without just giving the answer), praise (one concrete thing done well).",
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: SCHEMA,
    images,
    maxTokens: 3000,
  });
  r.steps ??= [];
  return r;
}
