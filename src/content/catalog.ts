import type { ComponentType } from "react";

// Каталог: треки → уроки. Урок «готов», если рядом лежит lessons/<track>/<slug>.mdx.
// Новый урок = новый .mdx + строка здесь. Порядок в массиве — порядок в треке.

export interface Lesson {
  id: string; // `${track}/${slug}`
  track: string;
  slug: string;
  title: string;
  summary: string;
  minutes: number;
  ready: boolean;
  load?: () => Promise<{ default: ComponentType }>;
}

export interface Track {
  id: string;
  title: string;
  group: string;
  blurb: string;
  color: string; // css var
  lessons: Lesson[];
}

type Plan = [slug: string, title: string, summary: string, minutes?: number];

const modules = import.meta.glob<{ default: ComponentType }>("./lessons/**/*.mdx");

function track(id: string, group: string, title: string, blurb: string, color: string, plan: Plan[]): Track {
  return {
    id,
    group,
    title,
    blurb,
    color,
    lessons: plan.map(([slug, t, summary, minutes = 15]) => {
      const load = modules[`./lessons/${id}/${slug}.mdx`];
      return { id: `${id}/${slug}`, track: id, slug, title: t, summary, minutes, ready: !!load, load };
    }),
  };
}

export const TRACKS: Track[] = [
  track("discrete", "Математика", "Дискретная математика", "Логика, множества, комбинаторика, графы — язык, на котором написаны алгоритмы.", "var(--color-violet)", [
    ["logic", "Логика и доказательства", "Импликация, кванторы, доказательство от противного"],
    ["induction", "Индукция и рекурсия", "Почему рекурсия работает и как это доказать"],
    ["sets", "Множества и отношения", "Отношения эквивалентности, порядки, функции"],
    ["combinatorics", "Комбинаторика", "Размещения, сочетания, принцип Дирихле"],
    ["graphs", "Графы", "Пути, связность, деревья, двудольность"],
  ]),
  track("linalg", "Математика", "Линейная алгебра", "Векторы и матрицы как геометрия — фундамент ML и графики.", "var(--color-violet)", [
    ["vectors", "Векторы и базис", "Линейные комбинации, span, независимость"],
    ["matrix-as-transform", "Матрица — это преобразование", "Столбцы матрицы = куда уходят базисные векторы", 20],
    ["determinant", "Определитель", "Во сколько раз меняется площадь и почему 0 — это беда"],
    ["eigen", "Собственные векторы", "Направления, которые преобразование не поворачивает"],
    ["svd", "SVD и PCA", "Любая матрица = поворот · растяжение · поворот"],
  ]),
  track("c", "Языки", "C", "Память без страховки: указатели, стек, куча, UB.", "var(--color-blue)", [
    ["pointers", "Указатели и массивы", "Адресная арифметика и decay"],
    ["stack-heap", "Стек и куча", "Кадр функции, malloc изнутри"],
    ["ub", "Undefined behaviour", "Почему компилятор «ломает» твой код"],
  ]),
  track("cpp", "Языки", "C++", "RAII, move-семантика, шаблоны, STL под капотом.", "var(--color-blue)", [
    ["raii", "RAII и владение", "Деструкторы как управление ресурсами"],
    ["move", "Move-семантика", "lvalue/rvalue, копирование против перемещения"],
    ["stl", "STL контейнеры изнутри", "vector, unordered_map, map — сложность и память"],
  ]),
  track("java", "Языки", "Java и JVM", "То, что спрашивают на бэкенд-собесах: память, GC, конкурентность.", "var(--color-blue)", [
    ["jvm-memory", "Память JVM", "Heap, stack, metaspace, escape analysis"],
    ["gc", "Сборщики мусора", "G1, ZGC, паузы и поколения"],
    ["jmm", "Java Memory Model", "happens-before, volatile, публикация объектов"],
    ["spring-tx", "Транзакции в Spring", "Прокси, propagation, почему @Transactional не сработал"],
  ]),
  track("python", "Языки", "Python", "Объектная модель, GIL, asyncio.", "var(--color-blue)", [
    ["object-model", "Объектная модель", "Всё — объект: dict, дескрипторы, MRO"],
    ["gil-asyncio", "GIL и asyncio", "Когда потоки, когда процессы, когда event loop"],
  ]),
  track("dsa", "Алгоритмы", "Алгоритмы и структуры данных", "Как структуры лежат в памяти и какие паттерны решают задачи. Свой LeetCode — во вкладке «Задачи».", "var(--color-accent)", [
    ["complexity", "Сложность", "Что реально влезет в секунду при данном n", 15],
    ["memory", "Массивы, списки и кэш", "Кэш-линии, промахи, амортизированный рост", 20],
    ["hashing", "Хеш-таблицы", "Цепочки, открытая адресация, resize, hashCode", 20],
    ["two-pointers", "Два указателя и окно", "Как убрать вложенный цикл", 15],
    ["binary-search", "Бинарный поиск без off-by-one", "Инвариант, lower_bound и поиск по ответу", 20],
    ["trees", "Деревья", "BST, AVL, обходы, рекурсия на деревьях", 20],
    ["heaps", "Кучи и top-k", "Дерево в массиве, sift-up/down, heapify за O(n)", 20],
    ["graphs-bfs-dfs", "Графы: BFS и DFS", "Очередь против стека, Дейкстра, шаблоны задач", 20],
    ["dp", "Динамическое программирование", "Состояние, переход, порядок вычисления", 25],
    ["stack-queue", "Стек, очередь, монотонный стек", "Скобки, next greater element, кольцевой буфер"],
    ["sorting", "Сортировки", "Quicksort, mergesort, стабильность, TimSort"],
    ["trie-uf", "Trie и Union-Find", "Префиксы и компоненты связности"],
    ["backtracking", "Перебор с возвратом", "Подмножества, перестановки, отсечения"],
  ]),
  track("computer", "Под капотом", "Как работает компьютер", "CPU, память, кэши, GPU — откуда берётся скорость.", "var(--color-amber)", [
    ["memory-hierarchy", "Иерархия памяти и задержки", "Числа, которые должен знать каждый инженер", 15],
    ["cpu-pipeline", "Как CPU исполняет код", "Конвейер, предсказание ветвлений, out-of-order"],
    ["virtual-memory", "Виртуальная память", "Страницы, TLB, page fault"],
    ["processes-threads", "Процессы и потоки", "Контекст, переключение, планировщик"],
    ["gpu", "GPU против CPU", "SIMT, warps, почему матрицы считают на видеокартах"],
  ]),
  track("network", "Под капотом", "Сеть", "От URL до байтов: DNS, TCP, TLS, HTTP.", "var(--color-teal)", [
    ["url-to-page", "Что происходит, когда открываешь URL", "Считаем каждый round-trip до первого байта", 20],
    ["tcp", "TCP подробно", "Окна, ретрансмиты, congestion control"],
    ["tls", "TLS 1.3", "Рукопожатие, сертификаты, 0-RTT"],
    ["http2-3", "HTTP/2 и HTTP/3", "Мультиплексирование и QUIC"],
    ["dns", "DNS", "Рекурсивный резолвер, TTL, кэширование"],
  ]),
  track("browser", "Под капотом", "Как работает браузер", "Chrome изнутри: процессы, рендеринг, event loop, V8.", "var(--color-teal)", [
    ["rendering", "Конвейер рендеринга", "DOM → style → layout → paint → composite"],
    ["event-loop", "Event loop", "Таски, микротаски, кадры"],
    ["v8", "V8", "Hidden classes, inline caches, JIT"],
  ]),
  track("databases", "Бэкенд", "Базы данных", "PostgreSQL изнутри: от байтов на странице до уровней изоляции.", "var(--color-rose)", [
    ["heap-pages", "Страницы и кортежи", "Как строки лежат в 8 КБ: line pointers, заголовок, HOT, VACUUM", 25],
    ["buffer-pool", "shared_buffers и WAL", "Clock-sweep, грязные страницы, что переживёт сбой", 25],
    ["btree", "B-tree изнутри", "Расщепления, fanout, порядок колонок в составном индексе", 25],
    ["index-vs-seqscan", "Когда Postgres берёт индекс", "Модель стоимости планировщика на ползунках", 20],
    ["mvcc", "MVCC", "xmin/xmax, снимки, горизонт и wraparound", 25],
    ["isolation", "Уровни изоляции", "Lost update, write skew, SSI и повтор транзакций", 25],
    ["explain", "Читаем EXPLAIN ANALYZE", "Узлы плана, оценки против факта, buffers"],
    ["locks", "Блокировки и deadlock'и", "Уровни блокировок, очередь, lock_timeout"],
    ["replication", "Репликация", "Потоковая, логическая, лаг и слоты"],
  ]),
  track("tools", "Бэкенд", "Git, Docker, Kubernetes", "Инструменты, которые используешь каждый день, — изнутри.", "var(--color-rose)", [
    ["git-internals", "Git изнутри", "Объекты, деревья, коммиты как DAG"],
    ["docker", "Docker изнутри", "namespaces, cgroups, слои образов"],
    ["kubernetes", "Kubernetes", "Control plane, планировщик, сеть подов"],
  ]),
  track("linux", "Под капотом", "Linux", "Процессы, файлы, сеть и наблюдаемость — то, на чём живёт любой сервис.", "var(--color-amber)", [
    ["processes", "Процессы, сигналы, файловые дескрипторы", "fork/exec, зомби, ulimit, что такое fd"],
    ["page-cache", "Файлы и page cache", "read/write, fsync, mmap, почему free показывает мало"],
    ["sockets", "Сеть в Linux", "Сокеты, backlog, epoll, iptables/nftables"],
    ["observability", "Метрики, логи, трейсы", "RED/USE, перцентили, SLO и алерты"],
  ]),
  track("web", "Языки", "Фронтенд: React и TS", "Как React рендерит, типы TS и скорость страницы.", "var(--color-blue)", [
    ["react-render", "Как React рендерит", "Рендер, коммит, reconciliation, ключи"],
    ["react-state", "Состояние и эффекты", "Когда useEffect не нужен, гонки, кэш запросов"],
    ["ts-types", "Типы TypeScript", "Сужение, дженерики, условные типы"],
    ["web-perf", "Core Web Vitals", "LCP, INP, CLS и что на них влияет"],
  ]),
  track("ml", "Математика", "ML и трансформеры", "От градиентного спуска до внимания и KV-кэша.", "var(--color-violet)", [
    ["probability", "Вероятность для ML", "Распределения, матожидание, правдоподобие"],
    ["gradient-descent", "Градиентный спуск", "Шаг, моментум, Adam, расписания"],
    ["backprop", "Backpropagation", "Цепное правило на графе вычислений"],
    ["attention", "Attention и трансформер", "Q, K, V, softmax, многоголовость"],
    ["llm-inference", "Инференс LLM", "KV-кэш, батчинг, квантизация, токены/с"],
  ]),
  track("ai-eng", "Бэкенд", "AI-инженерия", "LLM в проде: контекст, RAG, агенты, evals.", "var(--color-teal)", [
    ["llm-api", "LLM API и контекст", "Токены, стриминг, кэширование промпта, цена"],
    ["rag", "RAG", "Чанки, эмбеддинги, поиск, реранкинг"],
    ["agents", "Агенты и tool use", "Цикл инструментов, планирование, сбои"],
    ["evals", "Evals", "Как измерять качество и ловить регрессии"],
  ]),
  track("embedded", "Языки", "Embedded", "Железо без ОС: прерывания, RTOS, периферия.", "var(--color-blue)", [
    ["mmio", "Память и регистры", "Memory-mapped IO, volatile, барьеры"],
    ["interrupts", "Прерывания", "ISR, приоритеты, что можно делать внутри"],
    ["rtos", "RTOS", "Задачи, планировщик, инверсия приоритетов"],
    ["peripherals", "UART, SPI, I2C, DMA", "Шины и как с ними разговаривать"],
  ]),
  track("system-design", "Бэкенд", "System Design", "Как вести секцию: требования → оценки → схема → узкие места.", "var(--color-rose)", [
    ["approach", "Как вести секцию", "Фреймворк на 45 минут"],
    ["caching", "Кэширование", "Стратегии, инвалидация, stampede"],
    ["queues", "Очереди и стриминг", "Kafka, гарантии доставки, идемпотентность"],
    ["sharding", "Шардирование и репликация", "Ключ шардирования, консистентность"],
  ]),
];

export const LESSONS = TRACKS.flatMap((t) => t.lessons);
export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);
export const trackById = (id: string) => TRACKS.find((t) => t.id === id);
