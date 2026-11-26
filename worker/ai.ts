// ИИ: OpenRouter, если задан ключ, иначе Workers AI. Транскрипция — всегда Whisper на Workers AI.

const WORKERS_LLM = "@cf/openai/gpt-oss-120b";
const WORKERS_ASR = "@cf/openai/whisper-large-v3-turbo";
const DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-5.5";
const WORKERS_VISION = "@cf/meta/llama-4-scout-17b-16e-instruct";
const DEFAULT_OPENROUTER_VISION = "google/gemini-2.5-flash";

function userContent(call: JsonCall) {
  if (!call.images?.length) return call.user;
  return [{ type: "text", text: call.user }, ...call.images.map((url) => ({ type: "image_url", image_url: { url } }))];
}

export interface JsonCall {
  name: string;
  system: string;
  user: string;
  /** data:-URL картинок — для проверки решений по фото */
  images?: string[];
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export function aiProvider(env: Env) {
  return env.OPENROUTER_API_KEY ? `openrouter:${env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL}` : `workers-ai:${WORKERS_LLM}`;
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("LLM вернула не JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

function contentOf(res: unknown): string {
  const r = res as {
    choices?: { message?: { content?: string | null } }[];
    response?: unknown;
  };
  const content = r.choices?.[0]?.message?.content ?? r.response;
  if (typeof content === "string") return content;
  if (content && typeof content === "object") return JSON.stringify(content);
  throw new Error("Пустой ответ модели");
}

async function viaOpenRouter(env: Env, call: JsonCall): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
      "content-type": "application/json",
      "x-title": "temirslearn",
    },
    body: JSON.stringify({
      model: call.images?.length
        ? env.OPENROUTER_VISION_MODEL || DEFAULT_OPENROUTER_VISION
        : env.OPENROUTER_MODEL || DEFAULT_OPENROUTER_MODEL,
      messages: [
        { role: "system", content: call.system },
        { role: "user", content: userContent(call) },
      ],
      response_format: { type: "json_schema", json_schema: { name: call.name, strict: true, schema: call.schema } },
      max_tokens: call.maxTokens ?? 4000,
    }),
  });
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return contentOf(await res.json());
}

async function viaWorkersAI(env: Env, call: JsonCall): Promise<string> {
  const model = call.images?.length ? WORKERS_VISION : WORKERS_LLM;
  const res = await env.AI.run(model as Parameters<Ai["run"]>[0], {
    messages: [
      { role: "system", content: call.system },
      { role: "user", content: userContent(call) },
    ],
    response_format: { type: "json_schema", json_schema: { name: call.name, strict: true, schema: call.schema } },
    max_tokens: call.maxTokens ?? 4000,
  } as never);
  return contentOf(res);
}

export async function chatJson<T>(env: Env, call: JsonCall): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const text = env.OPENROUTER_API_KEY ? await viaOpenRouter(env, call) : await viaWorkersAI(env, call);
      return extractJson(text) as T;
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError;
}

export function toBase64(buf: ArrayBuffer) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export async function transcribe(env: Env, audio: ArrayBuffer, lang: "ru" | "en", hint: string) {
  const res = (await env.AI.run(WORKERS_ASR as Parameters<Ai["run"]>[0], {
    audio: toBase64(audio),
    language: lang,
    vad_filter: true,
    condition_on_previous_text: false,
    initial_prompt: hint,
  } as never)) as { text?: string };
  return (res.text ?? "").trim();
}
