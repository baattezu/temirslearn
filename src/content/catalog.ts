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
  /** раздел внутри трека — для фильтра (Java: Язык, JVM, Kotlin, Spring, ORM…) */
  topic?: string;
  load?: () => Promise<{ default: ComponentType }>;
}

export interface Track {
  id: string;
  title: string;
  group: string; // id группы из GROUPS
  blurb: string;
  color: string; // css var
  lessons: Lesson[];
}

type Plan = [slug: string, title: string, summary: string, minutes?: number, topic?: string];

const modules = import.meta.glob<{ default: ComponentType }>("./lessons/**/*.mdx");

function track(id: string, group: string, title: string, blurb: string, color: string, plan: Plan[]): Track {
  return {
    id,
    group,
    title,
    blurb,
    color,
    lessons: plan.map(([slug, t, summary, minutes = 15, topic]) => {
      const load = modules[`./lessons/${id}/${slug}.mdx`];
      return { id: `${id}/${slug}`, track: id, slug, title: t, summary, minutes, ready: !!load, load, topic };
    }),
  };
}

const RAW: Track[] = [
  track("discrete", "math", "Дискретная математика", "Логика, множества, комбинаторика, графы — язык, на котором написаны алгоритмы.", "var(--color-violet)", [
    ["intro", "Откуда дискретка", "Буль, Эйлер, Кантор — и почему компьютер говорит на их языке", 15],
    ["logic", "Логика и доказательства", "Импликация, кванторы, доказательство от противного"],
    ["induction", "Индукция и рекурсия", "Почему рекурсия работает и как это доказать"],
    ["sets", "Множества и отношения", "Отношения эквивалентности, порядки, функции"],
    ["combinatorics", "Комбинаторика", "Размещения, сочетания, принцип Дирихле"],
    ["graphs", "Графы", "Пути, связность, деревья, двудольность"],
  ]),
  track("linalg", "math", "Линейная алгебра", "Векторы и матрицы как геометрия — фундамент ML и графики.", "var(--color-violet)", [
    ["intro", "Зачем программисту линал", "От систем уравнений Гаусса до видеокарт и нейросетей", 15],
    ["vectors", "Векторы и базис", "Линейные комбинации, span, независимость"],
    ["matrix-as-transform", "Матрица — это преобразование", "Столбцы матрицы = куда уходят базисные векторы", 20],
    ["determinant", "Определитель", "Во сколько раз меняется площадь и почему 0 — это беда"],
    ["eigen", "Собственные векторы", "Направления, которые преобразование не поворачивает"],
    ["svd", "SVD и PCA", "Любая матрица = поворот · растяжение · поворот"],
  ]),
  track("c", "langs", "C", "Память без страховки: указатели, стек, куча, UB.", "var(--color-blue)", [
    ["passport", "Паспорт C", "Unix, Bell Labs и язык, на котором написано всё остальное", 20],

    ["pointers", "Указатели и массивы", "Адресная арифметика и decay"],
    ["stack-heap", "Стек и куча", "Кадр функции, malloc изнутри"],
    ["ub", "Undefined behaviour", "Почему компилятор «ломает» твой код"],
  ]),
  track("cpp", "langs", "C++", "RAII, move-семантика, шаблоны, STL под капотом.", "var(--color-blue)", [
    ["passport", "Паспорт C++", "Страуструп, «C с классами» и zero-cost abstractions", 20],
    ["raii", "RAII и владение", "Деструкторы как управление ресурсами"],
    ["move", "Move-семантика", "lvalue/rvalue, копирование против перемещения"],
    ["stl", "STL контейнеры изнутри", "vector, unordered_map, map — сложность и память"],
  ]),
  track("java", "langs", "Java, Kotlin, Spring", "Всё JVM-бэкенда в одном месте: язык, JVM и GC, многопоточность, Kotlin, Spring и ORM.", "var(--color-blue)", [
    ["passport", "Паспорт Java", "Откуда взялась, философия, где живёт и где её нет", 20, "Язык"],
    ["syntax", "Синтаксис за вечер", "Типы, классы, коллекции, исключения, лямбды — тур с примерами", 30, "Язык"],
    ["kotlin", "Kotlin для Java-разработчика", "Null-безопасность, data-классы, корутины — и почему Android и Spring его любят", 25, "Kotlin"],
    ["jvm-memory", "Память JVM", "Heap, stack, metaspace, escape analysis", 15, "JVM"],
    ["gc", "Сборщики мусора", "G1, ZGC, паузы и поколения", 15, "JVM"],
    ["jmm", "Java Memory Model", "happens-before, volatile, публикация объектов", 15, "Многопоточность"],
    ["concurrency", "java.util.concurrent", "Пулы потоков, локи, атомики, CompletableFuture — что брать и когда", 25, "Многопоточность"],
    ["virtual-threads", "Виртуальные потоки", "Loom: миллион потоков, carrier-потоки и pinning", 20, "Многопоточность"],
    ["spring-core", "Spring изнутри", "IoC-контейнер, жизненный цикл бина, прокси и AOP", 25, "Spring"],
    ["spring-boot", "Spring Boot", "Автоконфигурация, стартеры, профили, Actuator", 20, "Spring"],
    ["spring-tx", "Транзакции в Spring", "Прокси, propagation, почему @Transactional не сработал", 15, "Spring"],
    ["jpa", "JPA и Hibernate", "Persistence context, состояния сущности, dirty checking, flush", 25, "ORM"],
    ["n-plus-one", "N+1 и загрузка связей", "Lazy и eager, fetch join, entity graph, batch size", 20, "ORM"],
  ]),
  track("python", "langs", "Python", "Объектная модель, GIL, asyncio.", "var(--color-blue)", [
    ["passport", "Паспорт Python", "Гвидо, Zen of Python, где Python — король и где он не нужен", 20],
    ["syntax", "Синтаксис за вечер", "То же, что в Java, но в стиле Python", 25],

    ["object-model", "Объектная модель", "Всё — объект: dict, дескрипторы, MRO"],
    ["gil-asyncio", "GIL и asyncio", "Когда потоки, когда процессы, когда event loop"],
  ]),
  track("dsa", "algo", "Алгоритмы и структуры данных", "Как структуры лежат в памяти и какие паттерны решают задачи. Свой LeetCode — во вкладке «Задачи».", "var(--color-accent)", [
    ["intro", "Откуда алгоритмы", "Евклид, аль-Хорезми, Кнут — и почему это спрашивают на собесах", 15],
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
  track("computer", "hw", "Как работает компьютер", "CPU, память, кэши, GPU — откуда берётся скорость.", "var(--color-amber)", [
    ["intro", "От реле к транзистору", "Как вычисления переехали из шестерёнок в кремний", 20],
    ["memory-hierarchy", "Иерархия памяти и задержки", "Числа, которые должен знать каждый инженер", 15],
    ["cpu-pipeline", "Как CPU исполняет код", "Конвейер, предсказание ветвлений, out-of-order"],
    ["virtual-memory", "Виртуальная память", "Страницы, TLB, page fault"],
    ["processes-threads", "Процессы и потоки", "Контекст, переключение, планировщик"],
    ["gpu", "GPU против CPU", "SIMT, warps, почему матрицы считают на видеокартах"],
  ]),
  track("network", "net", "Сеть", "От URL до байтов: DNS, TCP, TLS, HTTP.", "var(--color-teal)", [
    ["intro", "Как появился интернет", "ARPANET, TCP/IP, WWW — сеть, которая пережила всё", 20],
    ["url-to-page", "Что происходит, когда открываешь URL", "Считаем каждый round-trip до первого байта", 20],
    ["tcp", "TCP подробно", "Окна, ретрансмиты, congestion control"],
    ["tls", "TLS 1.3", "Рукопожатие, сертификаты, 0-RTT"],
    ["http2-3", "HTTP/2 и HTTP/3", "Мультиплексирование и QUIC"],
    ["dns", "DNS", "Рекурсивный резолвер, TTL, кэширование"],
  ]),
  track("browser", "net", "Как работает браузер", "Chrome изнутри: процессы, рендеринг, event loop, V8.", "var(--color-teal)", [
    ["intro", "Браузерные войны", "Mosaic, Netscape, IE, Chrome — как браузер стал ОС", 15],
    ["rendering", "Конвейер рендеринга", "DOM → style → layout → paint → composite"],
    ["event-loop", "Event loop", "Таски, микротаски, кадры"],
    ["v8", "V8", "Hidden classes, inline caches, JIT"],
  ]),
  track("databases", "data", "Базы данных", "PostgreSQL изнутри: от байтов на странице до уровней изоляции.", "var(--color-rose)", [
    ["intro", "История баз данных", "От перфокарт и Кодда до Postgres и NoSQL", 20],
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
  track("tools", "infra", "Git, Docker, Kubernetes", "Инструменты, которые используешь каждый день, — изнутри.", "var(--color-rose)", [
    ["intro", "Откуда эти инструменты", "Линус и Git, chroot → Docker, Borg → Kubernetes", 15],
    ["git-internals", "Git изнутри", "Объекты, деревья, коммиты как DAG"],
    ["docker", "Docker изнутри", "namespaces, cgroups, слои образов"],
    ["kubernetes", "Kubernetes", "Control plane, планировщик, сеть подов"],
  ]),
  track("linux", "hw", "Linux", "Процессы, файлы, сеть и наблюдаемость — то, на чём живёт любой сервис.", "var(--color-amber)", [
    ["intro", "Философия Unix", "Bell Labs, «всё — файл», маленькие программы и пайпы", 15],
    ["processes", "Процессы, сигналы, файловые дескрипторы", "fork/exec, зомби, ulimit, что такое fd"],
    ["page-cache", "Файлы и page cache", "read/write, fsync, mmap, почему free показывает мало"],
    ["sockets", "Сеть в Linux", "Сокеты, backlog, epoll, iptables/nftables"],
    ["observability", "Метрики, логи, трейсы", "RED/USE, перцентили, SLO и алерты"],
  ]),
  track("web", "net", "Фронтенд: React и TS", "Как React рендерит, типы TS и скорость страницы.", "var(--color-blue)", [
    ["intro", "Как фронтенд стал инженерией", "От jQuery до React и TypeScript", 15],
    ["react-render", "Как React рендерит", "Рендер, коммит, reconciliation, ключи"],
    ["react-state", "Состояние и эффекты", "Когда useEffect не нужен, гонки, кэш запросов"],
    ["ts-types", "Типы TypeScript", "Сужение, дженерики, условные типы"],
    ["web-perf", "Core Web Vitals", "LCP, INP, CLS и что на них влияет"],
  ]),
  track("ml", "ml", "ML и трансформеры", "От градиентного спуска до внимания и KV-кэша.", "var(--color-violet)", [
    ["intro", "История ML", "Перцептрон, две зимы ИИ, AlexNet, трансформеры", 20],
    ["probability", "Вероятность для ML", "Распределения, матожидание, правдоподобие"],
    ["gradient-descent", "Градиентный спуск", "Шаг, моментум, Adam, расписания"],
    ["backprop", "Backpropagation", "Цепное правило на графе вычислений"],
    ["attention", "Attention и трансформер", "Q, K, V, softmax, многоголовость"],
    ["llm-inference", "Инференс LLM", "KV-кэш, батчинг, квантизация, токены/с"],
  ]),
  track("ai-eng", "ml", "AI-инженерия", "LLM в проде: контекст, RAG, агенты, evals.", "var(--color-teal)", [
    ["intro", "Что такое AI-инженерия", "Чем отличается от ML и от обычного бэкенда", 15],
    ["llm-api", "LLM API и контекст", "Токены, стриминг, кэширование промпта, цена"],
    ["rag", "RAG", "Чанки, эмбеддинги, поиск, реранкинг"],
    ["agents", "Агенты и tool use", "Цикл инструментов, планирование, сбои"],
    ["evals", "Evals", "Как измерять качество и ловить регрессии"],
  ]),
  track("embedded", "hw", "Embedded", "Железо без ОС: прерывания, RTOS, периферия.", "var(--color-blue)", [
    ["intro", "Мир embedded", "Где живут микроконтроллеры и почему там нет Java", 15],
    ["mmio", "Память и регистры", "Memory-mapped IO, volatile, барьеры"],
    ["interrupts", "Прерывания", "ISR, приоритеты, что можно делать внутри"],
    ["rtos", "RTOS", "Задачи, планировщик, инверсия приоритетов"],
    ["peripherals", "UART, SPI, I2C, DMA", "Шины и как с ними разговаривать"],
  ]),
  track("system-design", "arch", "System Design", "Как вести секцию: требования → оценки → схема → узкие места.", "var(--color-rose)", [
    ["intro", "Откуда System Design", "Как один сервер превратился в распределённую систему", 15],
    ["approach", "Как вести секцию", "Фреймворк на 45 минут"],
    ["caching", "Кэширование", "Стратегии, инвалидация, stampede"],
    ["queues", "Очереди и стриминг", "Kafka, гарантии доставки, идемпотентность"],
    ["sharding", "Шардирование и репликация", "Ключ шардирования, консистентность"],
    ["rate-limiting", "Rate limiting", "Фиксированное окно, скользящий лог, ведро токенов — и где ставить лимитер", 20],
    ["consensus", "Консенсус и Raft", "Как узлы договариваются о лидере и не теряют записи", 25],
    ["redis", "Redis изнутри", "Один поток, структуры данных, персистентность, вытеснение", 20],
    ["case-url-shortener", "Разбор: сокращатель ссылок", "Секция целиком — от требований до узких мест", 30],
  ]),
  // ── Введение ──
  track("intro", "intro", "Введение в IT", "С чего всё началось: как люди пришли к программированию, откуда языки и сеть, кто чем занимается и как учиться.", "var(--color-accent)", [
    ["history", "Как мы пришли к программированию", "Жаккард, Бэббидж, Ада, Тьюринг, ENIAC — двести лет до первой программы", 25],
    ["languages", "Почему языков так много", "Машинный код → Fortran → C → Java → Python: каждый язык чинил чью-то боль", 25],
    ["professions", "Карта профессий", "Кто чем занят, где пересекаются и что общего у всех", 15],
    ["how-to-learn", "Как учиться в IT", "Что говорит наука о памяти и как этим пользоваться здесь", 15],
  ]),

  // ── Ремесло ──
  track("clean-code", "craft", "Чистый код", "Код читают в десять раз чаще, чем пишут. Имена, функции, ошибки, запахи — на Java.", "var(--color-accent)", [
    ["intro", "Зачем чистый код", "Стоимость чтения, энтропия и «правило бойскаута»", 15],
    ["naming", "Имена", "Имя как документация: намерение, уровень абстракции, словарь домена", 20],
    ["functions", "Функции", "Одна задача, один уровень абстракции, без флагов и сюрпризов", 20],
    ["errors", "Ошибки и null", "Исключения против кодов, Optional, fail fast", 20],
    ["smells", "Запахи и рефакторинг", "Длинный метод, божественный класс, стрельба дробью — и как лечить", 25],
  ]),
  track("oop", "craft", "ООП", "Что Алан Кэй имел в виду на самом деле и как это работает в JVM.", "var(--color-accent)", [
    ["intro", "Откуда ООП", "Simula, Smalltalk, сообщения — и как ООП стало мейнстримом", 20],
    ["encapsulation", "Инкапсуляция и инварианты", "Объект защищает свои правила, а не просто прячет поля", 20],
    ["polymorphism", "Полиморфизм изнутри", "Виртуальные вызовы, vtable, позднее связывание", 20],
    ["composition", "Наследование против композиции", "Хрупкий базовый класс и почему «предпочитай композицию»", 20],
  ]),
  track("fp", "craft", "Функциональное программирование", "Чистые функции, неизменяемость, функции как значения — и как это живёт в Java.", "var(--color-accent)", [
    ["intro", "Откуда ФП", "Чёрч, λ-исчисление, Lisp, Haskell — и почему ФП вернулось", 20],
    ["purity", "Чистота и неизменяемость", "Побочные эффекты, ссылочная прозрачность, record", 20],
    ["higher-order", "Функции высшего порядка и стримы", "map/filter/reduce, ленивость, Stream API изнутри", 20],
    ["types", "Optional, Result, ADT", "Ошибка как значение, sealed-иерархии, pattern matching", 20],
  ]),
  track("solid", "craft", "SOLID", "Пять принципов, которые спрашивают на каждом собесе, — с примерами, где они ломаются.", "var(--color-accent)", [
    ["srp-ocp", "SRP и OCP", "Одна причина меняться; расширять, не меняя", 20],
    ["lsp", "Принцип Лисков", "Квадрат — не прямоугольник, и почему", 20],
    ["isp-dip", "ISP и DIP", "Узкие интерфейсы и зависимость от абстракций, DI в Spring", 20],
  ]),
  track("patterns", "craft", "Паттерны GoF", "23 паттерна «банды четырёх» — какие живы, какие стали фичами языка и где они в JDK и Spring.", "var(--color-accent)", [
    ["intro", "Зачем паттерны", "Кристофер Александер, GoF 1994 — словарь, а не рецепты", 15],
    ["creational", "Порождающие", "Factory, Builder, Singleton — и почему Singleton не любят", 20],
    ["structural", "Структурные", "Adapter, Decorator, Proxy, Facade", 20],
    ["behavioral", "Поведенческие", "Strategy, Observer, Template Method, Command, State", 25],
  ]),

  track("testing", "craft", "Тестирование", "Пирамида тестов, двойники, TDD и интеграционные тесты с настоящей базой — на Java.", "var(--color-accent)", [
    ["intro", "Зачем и что тестировать", "Пирамида, стоимость ошибки, хорошие и плохие тесты", 20],
    ["unit", "Юнит-тесты и двойники", "Arrange-Act-Assert, stub, mock, fake — и когда моки вредят", 25],
    ["tdd", "TDD", "Красный → зелёный → рефакторинг, и где TDD не нужен", 20],
    ["integration", "Интеграционные тесты", "Testcontainers, Spring Boot Test, контрактные тесты", 25],
  ]),

  // ── Предметные области ──
  track("fintech", "domains", "Финтех", "Деньги в коде: точность, двойная запись, платежи, идемпотентность, сверка. Примеры на Java.", "var(--color-amber)", [
    ["intro", "Как устроены деньги", "Банки, карты, клиринг — кто кому что должен", 20],
    ["money", "Деньги в коде", "Почему не double, BigDecimal, минорные единицы, округление", 20],
    ["ledger", "Двойная запись", "Леджер, проводки, баланс как сумма — бухгалтерия 1494 года в БД", 25],
    ["payments", "Жизнь платежа", "Авторизация, холд, capture, клиринг, расчёт, чарджбэк", 25],
    ["idempotency", "Идемпотентность", "Ключи идемпотентности, повторы, exactly-once на практике", 20],
    ["reconciliation", "Сверка", "Почему деньги расходятся и как это ловят", 20],
  ]),
];

/**
 * Группы — от «почему» к «как»: сначала история и математика, потом железо, алгоритмы
 * и ремесло, и только потом языки как форма. У трека одна «домашняя» группа; связи между
 * смежными треками показывают роадмапы и блок «опирается на / пригодится в».
 */
export const GROUPS: { id: string; title: string; tracks: string[] }[] = [
  { id: "intro", title: "Введение", tracks: ["intro"] },
  { id: "math", title: "Математика", tracks: ["discrete", "linalg"] },
  { id: "hw", title: "Железо и ОС", tracks: ["computer", "linux", "embedded"] },
  { id: "algo", title: "Алгоритмы", tracks: ["dsa"] },
  { id: "craft", title: "Ремесло", tracks: ["clean-code", "oop", "fp", "solid", "patterns", "testing"] },
  { id: "langs", title: "Языки", tracks: ["c", "cpp", "java", "python"] },
  { id: "net", title: "Сеть и веб", tracks: ["network", "browser", "web"] },
  { id: "data", title: "Данные", tracks: ["databases"] },
  { id: "infra", title: "Инфраструктура", tracks: ["tools"] },
  { id: "arch", title: "Архитектура", tracks: ["system-design"] },
  { id: "ml", title: "ML и AI", tracks: ["ml", "ai-eng"] },
  { id: "domains", title: "Предметные области", tracks: ["fintech"] },
];

export const TRACKS: Track[] = GROUPS.flatMap((g) =>
  g.tracks.map((id) => {
    const t = RAW.find((x) => x.id === id);
    if (!t) throw new Error(`track ${id} missing`);
    return t;
  }),
);
if (TRACKS.length !== RAW.length) throw new Error("каждый трек должен быть в группе");
export const groupById = (id: string) => GROUPS.find((g) => g.id === id);

/** Связи между смежными треками: на что опирается и где пригодится. */
export const RELATED: Record<string, { needs: string[]; feeds: string[] }> = {
  intro: { needs: [], feeds: ["computer", "discrete", "dsa"] },
  discrete: { needs: ["intro"], feeds: ["dsa", "linalg"] },
  linalg: { needs: ["discrete"], feeds: ["ml"] },
  computer: { needs: ["intro"], feeds: ["linux", "c", "dsa", "embedded"] },
  linux: { needs: ["computer"], feeds: ["tools", "network", "databases"] },
  embedded: { needs: ["c", "computer"], feeds: [] },
  dsa: { needs: ["discrete", "computer"], feeds: ["databases", "system-design"] },
  "clean-code": { needs: ["java"], feeds: ["oop", "solid"] },
  oop: { needs: ["java"], feeds: ["solid", "patterns"] },
  fp: { needs: ["java"], feeds: ["patterns"] },
  solid: { needs: ["oop"], feeds: ["patterns"] },
  patterns: { needs: ["oop", "solid"], feeds: ["system-design"] },
  testing: { needs: ["clean-code", "java"], feeds: ["solid"] },
  c: { needs: ["computer"], feeds: ["cpp", "embedded", "linux"] },
  cpp: { needs: ["c"], feeds: [] },
  java: { needs: ["computer"], feeds: ["clean-code", "oop", "databases", "fintech"] },
  python: { needs: ["computer"], feeds: ["ml", "ai-eng"] },
  network: { needs: ["linux"], feeds: ["browser", "system-design"] },
  browser: { needs: ["network"], feeds: ["web"] },
  web: { needs: ["browser"], feeds: [] },
  databases: { needs: ["dsa", "linux"], feeds: ["system-design", "fintech"] },
  tools: { needs: ["linux"], feeds: ["system-design"] },
  "system-design": { needs: ["network", "databases"], feeds: ["fintech"] },
  ml: { needs: ["linalg", "python"], feeds: ["ai-eng"] },
  "ai-eng": { needs: ["ml"], feeds: [] },
  fintech: { needs: ["databases", "java"], feeds: [] },
};

export const LESSONS = TRACKS.flatMap((t) => t.lessons);
export const lessonById = (id: string) => LESSONS.find((l) => l.id === id);
export const trackById = (id: string) => TRACKS.find((t) => t.id === id);
