// Банк вопросов трека: вопрос → готовый ответ. Файл questions/<track>.ts, default export QA[].
// lesson — slug урока, к которому вопрос относится (вопросы показываются в начале урока,
// в повторении и подмешиваются в устный зачёт). level: 1 — разминка, 2 — собес, 3 — с подвохом.

export interface QA {
  lesson: string;
  q: string;
  a: string; // markdown
  level?: 1 | 2 | 3;
}

const mods = import.meta.glob<{ default: QA[] }>("./questions/*.ts");

export const hasBank = (trackId: string) => `./questions/${trackId}.ts` in mods;

const cache = new Map<string, Promise<QA[]>>();
export function loadBank(trackId: string): Promise<QA[]> {
  const load = mods[`./questions/${trackId}.ts`];
  if (!load) return Promise.resolve([]);
  if (!cache.has(trackId)) cache.set(trackId, load().then((m) => m.default));
  return cache.get(trackId)!;
}

export async function lessonQuestions(lessonId: string) {
  const [track, slug] = lessonId.split("/");
  return (await loadBank(track)).filter((q) => q.lesson === slug);
}
