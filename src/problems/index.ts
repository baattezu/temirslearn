// Свой LeetCode: условие, сигнатура, тесты. Судья — в браузере (src/features/problems/runner.ts).
// Первые `sample` тестов видны и запускаются кнопкой «Запустить», все — кнопкой «Отправить».

export type Lang = "python" | "javascript";
export type Compare = "exact" | "unordered" | "unordered-deep";

export interface Test {
  args: unknown[];
  expected: unknown;
}

export interface Problem {
  id: string;
  title: string;
  difficulty: "easy" | "medium" | "hard";
  tags: string[];
  lesson?: string;
  statement: string; // markdown
  fn: string;
  params: string[];
  starter: Record<Lang, string>;
  sample: number;
  tests: Test[];
  compare?: Compare;
}

const py = (fn: string, params: string[], body = "pass") => `def ${fn}(${params.join(", ")}):\n    ${body}\n`;
const js = (fn: string, params: string[]) => `function ${fn}(${params.join(", ")}) {\n  \n}\n`;

function make(p: Omit<Problem, "starter"> & { starter?: Partial<Record<Lang, string>> }): Problem {
  return {
    ...p,
    starter: {
      python: p.starter?.python ?? py(p.fn, p.params),
      javascript: p.starter?.javascript ?? js(p.fn, p.params),
    },
  };
}

// детерминированный генератор для больших тестов
function rng(seed: number) {
  return () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
}

const bigSorted = Array.from({ length: 100_000 }, (_, i) => i * 3 - 50_000);

export const PROBLEMS: Problem[] = [
  make({
    id: "two-sum",
    title: "Two Sum",
    difficulty: "easy",
    tags: ["хеш-таблица", "массив"],
    lesson: "dsa/hashing",
    statement: `Дан массив целых \`nums\` и число \`target\`. Верни индексы двух **разных** элементов, сумма которых равна \`target\`. Решение гарантированно одно, порядок индексов не важен.

**Пример:** \`nums = [2, 7, 11, 15], target = 9\` → \`[0, 1]\`

Наивно — O(n²). Сделай за O(n).`,
    fn: "twoSum",
    params: ["nums", "target"],
    sample: 3,
    compare: "unordered",
    tests: [
      { args: [[2, 7, 11, 15], 9], expected: [0, 1] },
      { args: [[3, 2, 4], 6], expected: [1, 2] },
      { args: [[3, 3], 6], expected: [0, 1] },
      { args: [[-1, -2, -3, -4, -5], -8], expected: [2, 4] },
      { args: [[0, 4, 3, 0], 0], expected: [0, 3] },
      {
        args: [Array.from({ length: 50_000 }, (_, i) => i * 2), 99_998 + 99_996],
        expected: [49_998, 49_999],
      },
    ],
  }),
  make({
    id: "valid-parentheses",
    title: "Valid Parentheses",
    difficulty: "easy",
    tags: ["стек", "строки"],
    statement: `Строка \`s\` состоит из символов \`()[]{}\`. Верни \`true\`, если скобки сбалансированы: каждая открывающая закрыта скобкой того же типа и в правильном порядке.

**Пример:** \`"([]){}"\` → \`true\`, \`"(]"\` → \`false\`, \`"([)]"\` → \`false\``,
    fn: "isValid",
    params: ["s"],
    sample: 3,
    tests: [
      { args: ["([]){}"], expected: true },
      { args: ["(]"], expected: false },
      { args: ["([)]"], expected: false },
      { args: [""], expected: true },
      { args: ["(("], expected: false },
      { args: ["))"], expected: false },
      { args: ["{[()()]}"], expected: true },
      { args: ["(".repeat(50_000) + ")".repeat(50_000)], expected: true },
    ],
  }),
  make({
    id: "binary-search",
    title: "Binary Search",
    difficulty: "easy",
    tags: ["бинарный поиск"],
    lesson: "dsa/binary-search",
    statement: `Дан отсортированный по возрастанию массив **различных** целых \`nums\` и \`target\`. Верни индекс \`target\` или \`-1\`, если его нет. Требуется O(log n).

**Пример:** \`nums = [-1, 0, 3, 5, 9, 12], target = 9\` → \`4\``,
    fn: "search",
    params: ["nums", "target"],
    sample: 2,
    tests: [
      { args: [[-1, 0, 3, 5, 9, 12], 9], expected: 4 },
      { args: [[-1, 0, 3, 5, 9, 12], 2], expected: -1 },
      { args: [[5], 5], expected: 0 },
      { args: [[5], -5], expected: -1 },
      { args: [[1, 2], 2], expected: 1 },
      { args: [[], 1], expected: -1 },
      { args: [bigSorted, 149_995], expected: 66_665 },
      { args: [bigSorted, 149_996], expected: -1 },
    ],
  }),
  make({
    id: "search-insert-position",
    title: "Search Insert Position",
    difficulty: "easy",
    tags: ["бинарный поиск"],
    lesson: "dsa/binary-search",
    statement: `Дан отсортированный массив различных целых \`nums\` и \`target\`. Верни индекс \`target\`, а если его нет — индекс, куда его надо вставить, чтобы массив остался отсортированным. Это ровно lower_bound.

**Пример:** \`nums = [1, 3, 5, 6]\`: \`target = 5\` → \`2\`, \`target = 2\` → \`1\`, \`target = 7\` → \`4\``,
    fn: "searchInsert",
    params: ["nums", "target"],
    sample: 3,
    tests: [
      { args: [[1, 3, 5, 6], 5], expected: 2 },
      { args: [[1, 3, 5, 6], 2], expected: 1 },
      { args: [[1, 3, 5, 6], 7], expected: 4 },
      { args: [[1, 3, 5, 6], 0], expected: 0 },
      { args: [[1], 1], expected: 0 },
      { args: [bigSorted, -50_001], expected: 0 },
      { args: [bigSorted, 249_998], expected: 100_000 },
      { args: [bigSorted, 1], expected: 16_667 },
    ],
  }),
  make({
    id: "climbing-stairs",
    title: "Climbing Stairs",
    difficulty: "easy",
    tags: ["dp"],
    lesson: "dsa/dp",
    statement: `Лестница из \`n\` ступенек, за раз можно подняться на 1 или 2. Сколькими способами можно добраться до верха?

**Пример:** \`n = 3\` → \`3\` (1+1+1, 1+2, 2+1)

Подумай, как ответ для \`n\` выражается через меньшие \`n\`.`,
    fn: "climbStairs",
    params: ["n"],
    sample: 2,
    tests: [
      { args: [2], expected: 2 },
      { args: [3], expected: 3 },
      { args: [1], expected: 1 },
      { args: [10], expected: 89 },
      { args: [45], expected: 1836311903 },
    ],
  }),
  make({
    id: "longest-substring",
    title: "Longest Substring Without Repeating Characters",
    difficulty: "medium",
    tags: ["скользящее окно", "хеш-таблица"],
    lesson: "dsa/two-pointers",
    statement: `Найди длину самой длинной подстроки \`s\` без повторяющихся символов.

**Пример:** \`"abcabcbb"\` → \`3\` (\`"abc"\`), \`"pwwkew"\` → \`3\` (\`"wke"\`)

Подстрока — непрерывный кусок. Нужен O(n).`,
    fn: "lengthOfLongestSubstring",
    params: ["s"],
    sample: 3,
    tests: [
      { args: ["abcabcbb"], expected: 3 },
      { args: ["bbbbb"], expected: 1 },
      { args: ["pwwkew"], expected: 3 },
      { args: [""], expected: 0 },
      { args: [" "], expected: 1 },
      { args: ["abba"], expected: 2 },
      { args: ["dvdf"], expected: 3 },
      { args: ["abcdefghijklmnopqrstuvwxyz".repeat(2000)], expected: 26 },
    ],
  }),
  make({
    id: "merge-intervals",
    title: "Merge Intervals",
    difficulty: "medium",
    tags: ["сортировка", "интервалы"],
    statement: `Дан список отрезков \`[start, end]\`. Объедини все пересекающиеся (в том числе касающиеся концами) и верни результат, отсортированный по началу.

**Пример:** \`[[1,3],[2,6],[8,10],[15,18]]\` → \`[[1,6],[8,10],[15,18]]\``,
    fn: "merge",
    params: ["intervals"],
    sample: 2,
    tests: [
      { args: [[[1, 3], [2, 6], [8, 10], [15, 18]]], expected: [[1, 6], [8, 10], [15, 18]] },
      { args: [[[1, 4], [4, 5]]], expected: [[1, 5]] },
      { args: [[[1, 4], [0, 4]]], expected: [[0, 4]] },
      { args: [[[1, 4], [2, 3]]], expected: [[1, 4]] },
      { args: [[[5, 6]]], expected: [[5, 6]] },
      { args: [[[2, 3], [4, 5], [6, 7], [1, 10]]], expected: [[1, 10]] },
    ],
  }),
  make({
    id: "top-k-frequent",
    title: "Top K Frequent Elements",
    difficulty: "medium",
    tags: ["хеш-таблица", "куча", "bucket sort"],
    lesson: "dsa/heaps",
    statement: `Верни \`k\` самых частых элементов массива \`nums\` в любом порядке. Ответ гарантированно однозначен.

**Пример:** \`nums = [1,1,1,2,2,3], k = 2\` → \`[1, 2]\`

Сортировка всех частот — O(n log n). Можно лучше: куча на k элементов или bucket sort за O(n).`,
    fn: "topKFrequent",
    params: ["nums", "k"],
    sample: 2,
    compare: "unordered",
    tests: [
      { args: [[1, 1, 1, 2, 2, 3], 2], expected: [1, 2] },
      { args: [[1], 1], expected: [1] },
      { args: [[4, 4, -1, -1, -1, 7], 2], expected: [-1, 4] },
      { args: [[5, 3, 5, 3, 5, 9, 9, 9, 9], 1], expected: [9] },
      (() => {
        const r = rng(7);
        const nums: number[] = [];
        for (let v = 0; v < 1000; v++) for (let c = 0; c < (v < 5 ? 200 - v : 1 + Math.floor(r() * 50)); c++) nums.push(v);
        return { args: [nums, 5], expected: [0, 1, 2, 3, 4] };
      })(),
    ],
  }),
  make({
    id: "number-of-islands",
    title: "Number of Islands",
    difficulty: "medium",
    tags: ["графы", "BFS/DFS", "матрица"],
    lesson: "dsa/graphs-bfs-dfs",
    statement: `Дана сетка \`grid\` из строк \`"1"\` (суша) и \`"0"\` (вода). Остров — группа суши, связанная по горизонтали и вертикали. Посчитай острова.

**Пример:**
\`\`\`
[["1","1","0","0"],
 ["1","0","0","1"],
 ["0","0","1","1"]]   → 2
\`\`\``,
    fn: "numIslands",
    params: ["grid"],
    sample: 2,
    tests: [
      {
        args: [[["1", "1", "0", "0"], ["1", "0", "0", "1"], ["0", "0", "1", "1"]]],
        expected: 2,
      },
      {
        args: [[["1", "1", "1", "1", "0"], ["1", "1", "0", "1", "0"], ["1", "1", "0", "0", "0"], ["0", "0", "0", "0", "0"]]],
        expected: 1,
      },
      { args: [[["0"]]], expected: 0 },
      { args: [[["1", "0", "1", "0", "1"]]], expected: 3 },
      { args: [[["1"], ["0"], ["1"]]], expected: 2 },
      { args: [Array.from({ length: 200 }, () => Array.from({ length: 200 }, () => "1"))], expected: 1 },
      {
        args: [Array.from({ length: 100 }, (_, i) => Array.from({ length: 100 }, (_, j) => ((i + j) % 2 === 0 ? "1" : "0")))],
        expected: 5000,
      },
    ],
  }),
  make({
    id: "koko-bananas",
    title: "Koko Eating Bananas",
    difficulty: "medium",
    tags: ["бинарный поиск по ответу"],
    lesson: "dsa/binary-search",
    statement: `Есть кучки бананов \`piles\` и \`h\` часов. За час Коко выбирает одну кучку и съедает из неё \`k\` бананов (или всю кучку, если там меньше). Найди минимальную целую скорость \`k\`, чтобы успеть за \`h\` часов. Гарантируется \`h >= len(piles)\`.

**Пример:** \`piles = [3, 6, 7, 11], h = 8\` → \`4\`

Предикат «успевает со скоростью k» монотонный — ищи порог бинарным поиском.`,
    fn: "minEatingSpeed",
    params: ["piles", "h"],
    sample: 2,
    tests: [
      { args: [[3, 6, 7, 11], 8], expected: 4 },
      { args: [[30, 11, 23, 4, 20], 5], expected: 30 },
      { args: [[30, 11, 23, 4, 20], 6], expected: 23 },
      { args: [[1], 1], expected: 1 },
      { args: [[1_000_000_000], 2], expected: 500_000_000 },
      { args: [[312884470], 312884469], expected: 2 },
    ],
  }),
  make({
    id: "product-except-self",
    title: "Product of Array Except Self",
    difficulty: "medium",
    tags: ["массив", "префиксы"],
    statement: `Для каждого \`i\` верни произведение всех элементов \`nums\`, кроме \`nums[i]\`. **Без деления** и за O(n).

**Пример:** \`[1, 2, 3, 4]\` → \`[24, 12, 8, 6]\`

Подсказка: произведение слева × произведение справа.`,
    fn: "productExceptSelf",
    params: ["nums"],
    sample: 2,
    tests: [
      { args: [[1, 2, 3, 4]], expected: [24, 12, 8, 6] },
      { args: [[-1, 1, 0, -3, 3]], expected: [0, 0, 9, 0, 0] },
      { args: [[2, 3]], expected: [3, 2] },
      { args: [[0, 0]], expected: [0, 0] },
      { args: [[5, 0, 2]], expected: [0, 10, 0] },
    ],
  }),
];

export const problemById = (id: string) => PROBLEMS.find((p) => p.id === id);
