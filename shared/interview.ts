// Общие для фронта и Worker справочники интервью.

export type RoleId =
  | "backend-java"
  | "backend-python"
  | "devops"
  | "ai-swe"
  | "ai-research"
  | "embedded"
  | "frontend"
  | "system-design"
  | "dsa"
  | "behavioral";

export const ROLES: { id: RoleId; label: string; focus: string }[] = [
  {
    id: "backend-java",
    label: "Backend · Java/Kotlin",
    focus:
      "JVM (memory model, GC, class loading), Java concurrency, Spring Boot internals (DI, transactions, proxies), PostgreSQL (indexes, MVCC, isolation levels, query plans), Kafka, REST API design, testing, observability",
  },
  {
    id: "backend-python",
    label: "Backend · Python",
    focus:
      "Python runtime (GIL, asyncio event loop), FastAPI, SQLAlchemy async, PostgreSQL, Redis, Celery/queues, API design, testing, performance profiling",
  },
  {
    id: "devops",
    label: "DevOps / SRE",
    focus:
      "Linux internals, networking (TCP, DNS, TLS, load balancing), Docker (namespaces, cgroups, layers), Kubernetes (scheduling, networking, probes, rollouts), CI/CD, Terraform, observability (metrics, logs, traces, SLO), incident response",
  },
  {
    id: "ai-swe",
    label: "AI Software Engineer",
    focus:
      "LLM APIs, prompt and context design, RAG (chunking, embeddings, retrieval, reranking), tool use and agents, evals and regression testing, latency/cost trade-offs, streaming, guardrails, production failure modes",
  },
  {
    id: "ai-research",
    label: "AI Researcher",
    focus:
      "linear algebra, probability, optimization (SGD, Adam, schedules), transformers (attention, positional encodings, KV cache), training and scaling laws, fine-tuning (LoRA, RLHF/DPO), evaluation methodology, reading papers critically",
  },
  {
    id: "embedded",
    label: "Embedded",
    focus:
      "C (pointers, memory layout, volatile, undefined behaviour), interrupts, RTOS (tasks, priorities, priority inversion), peripherals (UART, SPI, I2C, DMA), memory-mapped IO, power, debugging on hardware",
  },
  {
    id: "frontend",
    label: "Frontend · React/TS",
    focus:
      "browser rendering pipeline, event loop, React rendering and state, TypeScript types, performance (Core Web Vitals), network and caching, accessibility, build tooling",
  },
  {
    id: "system-design",
    label: "System Design",
    focus:
      "designing real systems end to end: requirements, capacity estimates, data model, API, storage choice, caching, queues, consistency, scaling, failure modes, trade-offs",
  },
  {
    id: "dsa",
    label: "Алгоритмы устно",
    focus:
      "explaining an approach to an algorithmic problem out loud: brute force first, then optimisation, data structures used, time and space complexity, edge cases",
  },
  {
    id: "behavioral",
    label: "Behavioral",
    focus:
      "STAR stories: ownership, conflict, failure, ambiguous requirements, mentoring, prioritisation, working remotely across time zones",
  },
];

export type Level = "junior" | "middle" | "senior";
export const LEVELS: { id: Level; label: string }[] = [
  { id: "junior", label: "Junior" },
  { id: "middle", label: "Middle" },
  { id: "senior", label: "Senior" },
];

export type Lang = "ru" | "en";
export const LANGS: { id: Lang; label: string }[] = [
  { id: "en", label: "English" },
  { id: "ru", label: "Русский" },
];

export interface Question {
  q: string;
  topic: string;
  expects: string[]; // что должен покрыть сильный ответ — показывается после оценки
}

export interface Grade {
  score: number; // 0..10
  verdict: "strong" | "ok" | "weak" | "miss";
  covered: string[];
  missed: string[];
  wrong: string[];
  delivery: string;
  better_answer: string;
  followup: string;
}

export interface Summary {
  score: number; // 0..100
  decision: "hire" | "lean_hire" | "lean_no" | "no";
  headline: string;
  strengths: string[];
  gaps: string[];
  study_plan: string[];
}
