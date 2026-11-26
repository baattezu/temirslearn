import type { RoleId } from "../../shared/interview";
import { lessonById, type Lesson } from "./catalog";

// Роадмапы профессий. Профессия = этапы, этап = сегменты, сегмент = уроки из разных треков.
// Сегменты общие: «Сеть» одна и та же у бэкендера, DevOps и фронтендера — пройденный урок
// засчитывается везде, где встречается.

export interface Segment {
  id: string;
  title: string;
  blurb: string;
  lessons: string[];
  problems?: string[];
}

export const SEGMENTS: Record<string, Segment> = Object.fromEntries(
  (
    [
      ["dsa-core", "Алгоритмы: база", "Сложность, память, хеши, окна, бинпоиск", ["dsa/complexity", "dsa/memory", "dsa/hashing", "dsa/two-pointers", "dsa/binary-search"], ["two-sum", "longest-substring", "binary-search", "search-insert-position"]],
      ["dsa-structures", "Структуры и графы", "Деревья, кучи, BFS/DFS, DP", ["dsa/trees", "dsa/heaps", "dsa/graphs-bfs-dfs", "dsa/dp", "dsa/stack-queue", "dsa/sorting"], ["top-k-frequent", "number-of-islands", "climbing-stairs", "valid-parentheses"]],
      ["dsa-extra", "Алгоритмы: продвинутое", "Trie, Union-Find, перебор", ["dsa/trie-uf", "dsa/backtracking"], ["merge-intervals", "koko-bananas", "product-except-self"]],
      ["hardware", "Железо", "Кэши, CPU, виртуальная память, потоки", ["computer/memory-hierarchy", "computer/cpu-pipeline", "computer/virtual-memory", "computer/processes-threads"]],
      ["gpu", "GPU", "Почему матрицы считают на видеокартах", ["computer/gpu"]],
      ["network", "Сеть", "DNS, TCP, TLS, HTTP", ["network/url-to-page", "network/dns", "network/tcp", "network/tls", "network/http2-3"]],
      ["linux", "Linux", "Процессы, файлы, сокеты", ["linux/processes", "linux/page-cache", "linux/sockets"]],
      ["observability", "Наблюдаемость", "Метрики, логи, трейсы, SLO", ["linux/observability"]],
      ["pg-storage", "Postgres: хранение", "Страницы, буферы, WAL, B-tree, планировщик", ["databases/heap-pages", "databases/buffer-pool", "databases/btree", "databases/index-vs-seqscan"]],
      ["pg-tx", "Postgres: транзакции", "MVCC, изоляция, блокировки", ["databases/mvcc", "databases/isolation", "databases/locks"]],
      ["pg-ops", "Postgres: эксплуатация", "EXPLAIN, репликация", ["databases/explain", "databases/replication"]],
      ["jvm", "JVM", "Память, GC, модель памяти", ["java/jvm-memory", "java/gc", "java/jmm"]],
      ["spring", "Spring", "Прокси, транзакции", ["java/spring-tx"]],
      ["python", "Python изнутри", "Объектная модель, GIL, asyncio", ["python/object-model", "python/gil-asyncio"]],
      ["c", "C и память", "Указатели, стек и куча, UB", ["c/pointers", "c/stack-heap", "c/ub"]],
      ["cpp", "C++", "RAII, move, STL", ["cpp/raii", "cpp/move", "cpp/stl"]],
      ["git", "Git", "Объекты и DAG", ["tools/git-internals"]],
      ["containers", "Контейнеры", "Docker и Kubernetes изнутри", ["tools/docker", "tools/kubernetes"]],
      ["system-design", "System Design", "Подход, кэши, очереди, шардирование", ["system-design/approach", "system-design/caching", "system-design/queues", "system-design/sharding"]],
      ["browser", "Браузер", "Рендеринг, event loop, V8", ["browser/rendering", "browser/event-loop", "browser/v8"]],
      ["react", "React и TS", "Рендер, состояние, типы, скорость", ["web/react-render", "web/react-state", "web/ts-types", "web/web-perf"]],
      ["discrete", "Дискретная математика", "Логика, индукция, комбинаторика, графы", ["discrete/logic", "discrete/induction", "discrete/sets", "discrete/combinatorics", "discrete/graphs"]],
      ["linalg", "Линейная алгебра", "Векторы, матрицы, собственные числа, SVD", ["linalg/vectors", "linalg/matrix-as-transform", "linalg/determinant", "linalg/eigen", "linalg/svd"]],
      ["ml-core", "Обучение моделей", "Вероятность, градиенты, backprop", ["ml/probability", "ml/gradient-descent", "ml/backprop"]],
      ["transformers", "Трансформеры и инференс", "Attention, KV-кэш, батчинг", ["ml/attention", "ml/llm-inference"]],
      ["ai-eng", "LLM в продакшене", "Контекст, RAG, агенты, evals", ["ai-eng/llm-api", "ai-eng/rag", "ai-eng/agents", "ai-eng/evals"]],
      ["embedded", "Embedded", "Регистры, прерывания, RTOS, шины", ["embedded/mmio", "embedded/interrupts", "embedded/rtos", "embedded/peripherals"]],
    ] as [string, string, string, string[], string[]?][]
  ).map(([id, title, blurb, lessons, problems]) => [id, { id, title, blurb, lessons, problems }]),
);

export interface Stage {
  title: string;
  segments: string[];
}
export interface Profession {
  id: string;
  title: string;
  blurb: string;
  color: string;
  role: RoleId;
  stages: Stage[];
}

export const PROFESSIONS: Profession[] = [
  {
    id: "backend-java",
    title: "Backend · Java/Kotlin",
    blurb: "Мой основной профиль: JVM, Postgres, сеть, system design.",
    color: "var(--color-accent)",
    role: "backend-java",
    stages: [
      { title: "Фундамент", segments: ["dsa-core", "hardware", "network"] },
      { title: "Данные", segments: ["pg-storage", "pg-tx", "pg-ops"] },
      { title: "Платформа", segments: ["jvm", "spring", "linux", "containers", "git"] },
      { title: "Архитектура и собес", segments: ["system-design", "dsa-structures", "dsa-extra", "observability"] },
    ],
  },
  {
    id: "backend-python",
    title: "Backend · Python",
    blurb: "FastAPI-стек: рантайм Python, Postgres, очереди.",
    color: "var(--color-teal)",
    role: "backend-python",
    stages: [
      { title: "Фундамент", segments: ["dsa-core", "hardware", "network"] },
      { title: "Данные", segments: ["pg-storage", "pg-tx"] },
      { title: "Платформа", segments: ["python", "linux", "containers", "git"] },
      { title: "Архитектура и собес", segments: ["system-design", "dsa-structures", "dsa-extra", "observability"] },
    ],
  },
  {
    id: "devops",
    title: "DevOps / SRE",
    blurb: "Linux, сеть, контейнеры, наблюдаемость и надёжность.",
    color: "var(--color-amber)",
    role: "devops",
    stages: [
      { title: "Фундамент", segments: ["hardware", "linux", "network"] },
      { title: "Платформа", segments: ["containers", "git", "observability"] },
      { title: "Данные и надёжность", segments: ["pg-storage", "pg-ops", "system-design"] },
      { title: "Собес", segments: ["dsa-core"] },
    ],
  },
  {
    id: "ai-swe",
    title: "AI Software Engineer",
    blurb: "LLM-продукты: контекст, RAG, агенты, evals — на крепком бэкенде.",
    color: "var(--color-violet)",
    role: "ai-swe",
    stages: [
      { title: "Фундамент", segments: ["dsa-core", "network", "python"] },
      { title: "LLM", segments: ["ai-eng", "transformers"] },
      { title: "Бэкенд вокруг модели", segments: ["pg-storage", "system-design", "observability"] },
      { title: "Глубже", segments: ["linalg", "dsa-structures"] },
    ],
  },
  {
    id: "ai-research",
    title: "AI Researcher",
    blurb: "Математика, обучение моделей, трансформеры, железо.",
    color: "var(--color-rose)",
    role: "ai-research",
    stages: [
      { title: "Математика", segments: ["linalg", "discrete", "ml-core"] },
      { title: "Модели", segments: ["transformers"] },
      { title: "Железо", segments: ["gpu", "hardware"] },
      { title: "Инженерия", segments: ["python", "dsa-core"] },
    ],
  },
  {
    id: "embedded",
    title: "Embedded",
    blurb: "C без страховки, прерывания, RTOS, периферия.",
    color: "var(--color-blue)",
    role: "embedded",
    stages: [
      { title: "Язык и память", segments: ["c", "cpp", "hardware"] },
      { title: "Железо", segments: ["embedded"] },
      { title: "Собес", segments: ["dsa-core", "discrete"] },
    ],
  },
  {
    id: "frontend",
    title: "Frontend · React/TS",
    blurb: "Браузер изнутри, React, сеть и скорость страницы.",
    color: "#e79bff",
    role: "frontend",
    stages: [
      { title: "Фундамент", segments: ["dsa-core", "network", "browser"] },
      { title: "Фреймворк", segments: ["react", "git"] },
      { title: "Архитектура", segments: ["system-design"] },
    ],
  },
];

export const professionById = (id: string) => PROFESSIONS.find((p) => p.id === id);
export const segmentLessons = (s: Segment) => s.lessons.map(lessonById).filter((l): l is Lesson => !!l);
export const professionLessons = (p: Profession) => [...new Set(p.stages.flatMap((st) => st.segments.flatMap((id) => SEGMENTS[id].lessons)))];

/** В каких профессиях встречается сегмент. */
export const segmentUsage = (segId: string) => PROFESSIONS.filter((p) => p.stages.some((st) => st.segments.includes(segId)));
