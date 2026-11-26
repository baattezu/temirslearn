// Тренажёр «на бумаге». Генератор по seed выдаёт задачу, точный ответ и пошаговое решение.
// Ответ проверяется детерминированно; фото решения ИИ только сверяет с эталоном.
// Формулы — LaTeX (рендерит KaTeX), текст — обычная строка; $…$ внутри текста = формула.

export interface Field {
  label: string; // LaTeX-подпись поля: x, \lambda_1, a_{11}
  value: number;
}

export interface Problem {
  statement: string; // текст с $…$
  tex?: string; // главная формула задачи, крупно
  fields: Field[];
  /** порядок значений не важен (корни, собственные числа) */
  unordered?: boolean;
  /** сетка полей: столбцов (для матриц) */
  cols?: number;
  /** допуск: по умолчанию 1e-6, для вероятностей больше */
  tol?: number;
  steps: string[]; // решение по шагам, текст с $…$ и $$…$$
  answerText: string; // ответ одной строкой для ИИ-проверки
}

export interface Gen {
  id: string;
  lesson: string; // урок, к которому относится (для индекса «Применяю»)
  title: string;
  level: 1 | 2 | 3;
  /** «как на лекции»: метод по шагам, общий для всех задач этого типа */
  method: string[];
  make: (seed: number) => Problem;
}

// ── утилиты ──────────────────────────────────────────────

function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}
const int = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const nz = (r: () => number, lo: number, hi: number) => {
  let v = 0;
  while (v === 0) v = int(r, lo, hi);
  return v;
};
const pick = <T,>(r: () => number, xs: T[]) => xs[Math.floor(r() * xs.length)];

/** Число в LaTeX со скобками для отрицательных — чтобы 3·(−2), а не 3·−2. */
const p = (n: number) => (n < 0 ? `(${n})` : `${n}`);
const sgn = (n: number) => (n < 0 ? `- ${-n}` : `+ ${n}`);
const mat = (m: number[][]) => `\\begin{pmatrix}${m.map((row) => row.join(" & ")).join(" \\\\ ")}\\end{pmatrix}`;
const det = (m: number[][]) => `\\begin{vmatrix}${m.map((row) => row.join(" & ")).join(" \\\\ ")}\\end{vmatrix}`;
const vec = (v: number[]) => mat(v.map((x) => [x]));

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
/** Дробь a/b в LaTeX, сокращённая. */
function frac(a: number, b: number) {
  if (b < 0) [a, b] = [-a, -b];
  const g = gcd(a, b) || 1;
  a /= g;
  b /= g;
  if (b === 1) return `${a}`;
  return `${a < 0 ? "-" : ""}\\tfrac{${Math.abs(a)}}{${b}}`;
}
function fracText(a: number, b: number) {
  if (b < 0) [a, b] = [-a, -b];
  const g = gcd(a, b) || 1;
  return b / g === 1 ? `${a / g}` : `${a / g}/${b / g}`;
}
function C(n: number, k: number) {
  if (k < 0 || k > n) return 0;
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}
const fact = (n: number): number => (n <= 1 ? 1 : n * fact(n - 1));

// ── линейная алгебра ─────────────────────────────────────

const vecComb: Gen = {
  id: "la-comb",
  lesson: "linalg/vectors",
  title: "Линейная комбинация",
  level: 1,
  method: [
    "Линейная комбинация $a\\mathbf u + b\\mathbf v$ — это «растянь $\\mathbf u$ в $a$ раз, $\\mathbf v$ в $b$ раз и сложи».",
    "Умножение на число действует на каждую координату: $a\\begin{pmatrix}u_1\\\\u_2\\end{pmatrix} = \\begin{pmatrix}a u_1\\\\a u_2\\end{pmatrix}$.",
    "Сложение тоже покоординатное: складываешь верх с верхом, низ с низом.",
    "Типичная ошибка — знак: $-2 \\cdot (-3) = +6$. Пиши скобки вокруг отрицательных чисел.",
  ],
  make(seed) {
    const r = rng(seed);
    const n = seed % 3 === 0 ? 3 : 2;
    const u = Array.from({ length: n }, () => int(r, -5, 5));
    const v = Array.from({ length: n }, () => int(r, -5, 5));
    const a = nz(r, -4, 4);
    const b = nz(r, -4, 4);
    const au = u.map((x) => a * x);
    const bv = v.map((x) => b * x);
    const res = au.map((x, i) => x + bv[i]);
    return {
      statement: "Найди вектор $\\mathbf w = a\\mathbf u + b\\mathbf v$.",
      tex: `a = ${a},\\; b = ${b},\\quad \\mathbf u = ${vec(u)},\\; \\mathbf v = ${vec(v)}`,
      fields: res.map((value, i) => ({ label: `w_${i + 1}`, value })),
      steps: [
        `Растягиваем $\\mathbf u$: $${a}\\cdot${vec(u)} = ${vec(au)}$`,
        `Растягиваем $\\mathbf v$: $${b}\\cdot${vec(v)} = ${vec(bv)}$`,
        `Складываем покоординатно: $${res.map((x, i) => `${p(au[i])} + ${p(bv[i])} = ${x}`).join(",\\; ")}$`,
        `Ответ: $\\mathbf w = ${vec(res)}$`,
      ],
      answerText: `w = (${res.join(", ")})`,
    };
  },
};

const matVec: Gen = {
  id: "la-matvec",
  lesson: "linalg/matrix-as-transform",
  title: "Матрица × вектор",
  level: 1,
  method: [
    "Два взгляда на $A\\mathbf x$, ответ один и тот же.",
    "**По строкам** (как считают руками): $i$-я координата результата — скалярное произведение $i$-й строки $A$ на $\\mathbf x$.",
    "**По столбцам** (как понимают): $A\\mathbf x = x_1\\cdot(\\text{столбец }1) + x_2\\cdot(\\text{столбец }2)$ — столбцы показывают, куда уходят базисные векторы.",
    "Проверка размеров: матрица $m\\times n$ умножается только на вектор длины $n$ и даёт вектор длины $m$.",
  ],
  make(seed) {
    const r = rng(seed);
    const A = [
      [int(r, -4, 5), int(r, -4, 5)],
      [int(r, -4, 5), int(r, -4, 5)],
    ];
    const x = [nz(r, -4, 4), nz(r, -4, 4)];
    const y = A.map((row) => row[0] * x[0] + row[1] * x[1]);
    return {
      statement: "Вычисли $A\\mathbf x$.",
      tex: `A = ${mat(A)},\\quad \\mathbf x = ${vec(x)}`,
      fields: y.map((value, i) => ({ label: `y_${i + 1}`, value })),
      steps: [
        `Первая строка на вектор: $${p(A[0][0])}\\cdot${p(x[0])} + ${p(A[0][1])}\\cdot${p(x[1])} = ${y[0]}$`,
        `Вторая строка на вектор: $${p(A[1][0])}\\cdot${p(x[0])} + ${p(A[1][1])}\\cdot${p(x[1])} = ${y[1]}$`,
        `Проверка через столбцы: $${p(x[0])}${vec([A[0][0], A[1][0]])} + ${p(x[1])}${vec([A[0][1], A[1][1]])} = ${vec(y)}$`,
        `Ответ: $A\\mathbf x = ${vec(y)}$`,
      ],
      answerText: `(${y.join(", ")})`,
    };
  },
};

const matMul: Gen = {
  id: "la-matmul",
  lesson: "linalg/matrix-as-transform",
  title: "Произведение матриц",
  level: 2,
  method: [
    "Элемент $(AB)_{ij}$ = строка $i$ матрицы $A$ · столбец $j$ матрицы $B$.",
    "Удобно водить двумя пальцами: левый идёт по строке $A$ слева направо, правый — по столбцу $B$ сверху вниз; перемножаешь пары и складываешь.",
    "Смысл: $AB$ — это «сначала $B$, потом $A$». Поэтому $AB \\ne BA$ в общем случае.",
    "Считай по одному элементу и записывай промежуточные суммы — так ошибку видно сразу.",
  ],
  make(seed) {
    const r = rng(seed);
    const A = [
      [int(r, -3, 4), int(r, -3, 4)],
      [int(r, -3, 4), int(r, -3, 4)],
    ];
    const B = [
      [int(r, -3, 4), int(r, -3, 4)],
      [int(r, -3, 4), int(r, -3, 4)],
    ];
    const P = [0, 1].map((i) => [0, 1].map((j) => A[i][0] * B[0][j] + A[i][1] * B[1][j]));
    const cell = (i: number, j: number) =>
      `(AB)_{${i + 1}${j + 1}} = ${p(A[i][0])}\\cdot${p(B[0][j])} + ${p(A[i][1])}\\cdot${p(B[1][j])} = ${P[i][j]}`;
    return {
      statement: "Найди произведение $AB$.",
      tex: `A = ${mat(A)},\\quad B = ${mat(B)}`,
      fields: P.flat().map((value, k) => ({ label: `c_{${Math.floor(k / 2) + 1}${(k % 2) + 1}}`, value })),
      cols: 2,
      steps: [
        `$${cell(0, 0)}$ — строка 1 на столбец 1`,
        `$${cell(0, 1)}$ — строка 1 на столбец 2`,
        `$${cell(1, 0)}$`,
        `$${cell(1, 1)}$`,
        `Ответ: $AB = ${mat(P)}$`,
      ],
      answerText: mat(P),
    };
  },
};

const det2: Gen = {
  id: "la-det2",
  lesson: "linalg/determinant",
  title: "Определитель 2×2",
  level: 1,
  method: [
    "$\\det\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix} = ad - bc$: главная диагональ минус побочная.",
    "Смысл: во сколько раз преобразование меняет площадь. Знак «−» значит, что плоскость перевернулась.",
    "$\\det = 0$ — столбцы лежат на одной прямой, плоскость сплющилась в линию, обратной матрицы нет.",
    "Самая частая ошибка — вычесть с неправильным знаком, когда $b$ или $c$ отрицательные. Пиши $bc$ в скобках.",
  ],
  make(seed) {
    const r = rng(seed);
    const [a, b, c, d] = [int(r, -6, 7), int(r, -6, 7), int(r, -6, 7), int(r, -6, 7)];
    const v = a * d - b * c;
    return {
      statement: "Вычисли определитель.",
      tex: det([
        [a, b],
        [c, d],
      ]),
      fields: [{ label: "\\det", value: v }],
      steps: [
        `Главная диагональ: $${p(a)}\\cdot${p(d)} = ${a * d}$`,
        `Побочная диагональ: $${p(b)}\\cdot${p(c)} = ${b * c}$`,
        `Вычитаем: $${a * d} - ${p(b * c)} = ${v}$`,
        v === 0
          ? "Определитель 0: столбцы коллинеарны, площадь схлопнулась в ноль."
          : `Площадь любой фигуры меняется в $${Math.abs(v)}$ раз${v < 0 ? ", и ориентация переворачивается" : ""}.`,
      ],
      answerText: `${v}`,
    };
  },
};

const det3: Gen = {
  id: "la-det3",
  lesson: "linalg/determinant",
  title: "Определитель 3×3",
  level: 2,
  method: [
    "Раскладываем по первой строке: $\\det A = a_{11}M_{11} - a_{12}M_{12} + a_{13}M_{13}$.",
    "$M_{1j}$ — минор: определитель 2×2, который остаётся, если вычеркнуть строку 1 и столбец $j$.",
    "Знаки чередуются как шахматная доска: $+\\;-\\;+$. Забытый минус в середине — ошибка №1.",
    "Если в строке или столбце есть нули — раскладывай по нему: меньше считать.",
  ],
  make(seed) {
    const r = rng(seed);
    const A = [0, 1, 2].map(() => [0, 1, 2].map(() => int(r, -3, 4)));
    const minor = (j: number) => {
      const cols = [0, 1, 2].filter((c) => c !== j);
      const m = [1, 2].map((i) => cols.map((c) => A[i][c]));
      return { m, v: m[0][0] * m[1][1] - m[0][1] * m[1][0] };
    };
    const M = [0, 1, 2].map(minor);
    const v = A[0][0] * M[0].v - A[0][1] * M[1].v + A[0][2] * M[2].v;
    return {
      statement: "Вычисли определитель разложением по первой строке.",
      tex: det(A),
      fields: [{ label: "\\det", value: v }],
      steps: [
        ...[0, 1, 2].map(
          (j) =>
            `$M_{1${j + 1}} = ${det(M[j].m)} = ${p(M[j].m[0][0])}\\cdot${p(M[j].m[1][1])} - ${p(M[j].m[0][1])}\\cdot${p(M[j].m[1][0])} = ${M[j].v}$`,
        ),
        `Собираем со знаками $+\\,-\\,+$: $${p(A[0][0])}\\cdot${p(M[0].v)} - ${p(A[0][1])}\\cdot${p(M[1].v)} + ${p(A[0][2])}\\cdot${p(M[2].v)} = ${v}$`,
      ],
      answerText: `${v}`,
    };
  },
};

const system2: Gen = {
  id: "la-system",
  lesson: "linalg/determinant",
  title: "Система 2×2 (Крамер)",
  level: 2,
  method: [
    "Система $A\\mathbf x = \\mathbf b$ — вопрос «какой вектор $\\mathbf x$ преобразование $A$ переводит в $\\mathbf b$».",
    "Правило Крамера: $x = \\dfrac{\\det A_x}{\\det A}$, $y = \\dfrac{\\det A_y}{\\det A}$, где $A_x$ — это $A$, у которой первый столбец заменён на $\\mathbf b$, $A_y$ — второй.",
    "Если $\\det A = 0$ — решений либо нет, либо бесконечно много.",
    "Проверка обязательна: подставь $x, y$ в оба уравнения.",
  ],
  make(seed) {
    const r = rng(seed);
    let A: number[][];
    let D: number;
    do {
      A = [
        [nz(r, -5, 5), int(r, -5, 5)],
        [int(r, -5, 5), nz(r, -5, 5)],
      ];
      D = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    } while (D === 0);
    const x = int(r, -5, 5);
    const y = int(r, -5, 5);
    const b = [A[0][0] * x + A[0][1] * y, A[1][0] * x + A[1][1] * y];
    const Dx = b[0] * A[1][1] - A[0][1] * b[1];
    const Dy = A[0][0] * b[1] - b[0] * A[1][0];
    const eq = (row: number[], rhs: number) => `${row[0]}x ${sgn(row[1])}y = ${rhs}`.replace(/\b1x/, "x").replace(/\+ 1y/, "+ y").replace(/- 1y/, "- y");
    return {
      statement: "Реши систему.",
      tex: `\\begin{cases} ${eq(A[0], b[0])} \\\\ ${eq(A[1], b[1])} \\end{cases}`,
      fields: [
        { label: "x", value: x },
        { label: "y", value: y },
      ],
      steps: [
        `$\\det A = ${det(A)} = ${D}$ — не ноль, решение единственное.`,
        `$\\det A_x = ${det([
          [b[0], A[0][1]],
          [b[1], A[1][1]],
        ])} = ${Dx}$`,
        `$\\det A_y = ${det([
          [A[0][0], b[0]],
          [A[1][0], b[1]],
        ])} = ${Dy}$`,
        `$x = ${Dx}/${p(D)} = ${x}$, $\\; y = ${Dy}/${p(D)} = ${y}$`,
        `Проверка: $${p(A[0][0])}\\cdot${p(x)} + ${p(A[0][1])}\\cdot${p(y)} = ${b[0]}$ ✓, $\\;${p(A[1][0])}\\cdot${p(x)} + ${p(A[1][1])}\\cdot${p(y)} = ${b[1]}$ ✓`,
      ],
      answerText: `x = ${x}, y = ${y}`,
    };
  },
};

const inverse2: Gen = {
  id: "la-inverse",
  lesson: "linalg/determinant",
  title: "Обратная матрица 2×2",
  level: 2,
  method: [
    "$\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}^{-1} = \\dfrac{1}{ad-bc}\\begin{pmatrix}d&-b\\\\-c&a\\end{pmatrix}$.",
    "Запоминается так: диагональ меняем местами, побочной меняем знак, всё делим на определитель.",
    "Если $\\det = 0$, обратной нет: сплющенную плоскость не «разплющить».",
    "Проверка: $AA^{-1} = I$. Перемножь хотя бы первую строку на первый столбец.",
  ],
  make(seed) {
    const r = rng(seed);
    let a: number, b: number, c: number, d: number, D: number;
    do {
      [a, b, c, d] = [int(r, -5, 6), int(r, -5, 6), int(r, -5, 6), int(r, -5, 6)];
      D = a * d - b * c;
    } while (D === 0 || Math.abs(D) > 12);
    const inv = [
      [d, -b],
      [-c, a],
    ];
    const texInv = `\\begin{pmatrix}${inv.map((row) => row.map((x) => frac(x, D)).join(" & ")).join(" \\\\ ")}\\end{pmatrix}`;
    return {
      statement: "Найди $A^{-1}$. Дроби вводи как `3/4`.",
      tex: `A = ${mat([
        [a, b],
        [c, d],
      ])}`,
      fields: inv.flat().map((x, k) => ({ label: `a^{-1}_{${Math.floor(k / 2) + 1}${(k % 2) + 1}}`, value: x / D })),
      cols: 2,
      steps: [
        `$\\det A = ${p(a)}\\cdot${p(d)} - ${p(b)}\\cdot${p(c)} = ${D}$`,
        `Меняем местами диагональ и знаки побочной: $${mat(inv)}$`,
        `Делим на $${D}$: $A^{-1} = ${texInv}$`,
      ],
      answerText: `[[${inv[0].map((x) => fracText(x, D)).join(", ")}], [${inv[1].map((x) => fracText(x, D)).join(", ")}]]`,
    };
  },
};

const eig2: Gen = {
  id: "la-eigen",
  lesson: "linalg/eigen",
  title: "Собственные значения 2×2",
  level: 3,
  method: [
    "Ищем $\\lambda$, при которых $A - \\lambda I$ сплющивает плоскость: $\\det(A - \\lambda I) = 0$.",
    "Для 2×2 это квадратное уравнение: $\\lambda^2 - (\\operatorname{tr}A)\\,\\lambda + \\det A = 0$, где $\\operatorname{tr}A = a + d$.",
    "Корни через дискриминант или по Виету: $\\lambda_1 + \\lambda_2 = \\operatorname{tr}A$, $\\lambda_1\\lambda_2 = \\det A$.",
    "Проверка без вычислений: сумма собственных значений равна следу, произведение — определителю.",
  ],
  make(seed) {
    const r = rng(seed);
    // A = P·diag(l1,l2)·P⁻¹ с det P = 1 → целые собственные значения и целая A
    const l1 = int(r, -4, 5);
    let l2 = int(r, -4, 5);
    if (l2 === l1) l2 = l1 + 1;
    let k = int(r, -1, 1);
    const m = int(r, -1, 1);
    if (k === 0 && m === 0) k = 1;
    const P = [
      [1, k],
      [m, k * m + 1],
    ]; // det = 1
    const Pi = [
      [k * m + 1, -k],
      [-m, 1],
    ];
    const D = [
      [l1, 0],
      [0, l2],
    ];
    const mul = (X: number[][], Y: number[][]) => [0, 1].map((i) => [0, 1].map((j) => X[i][0] * Y[0][j] + X[i][1] * Y[1][j]));
    const A = mul(mul(P, D), Pi);
    const tr = A[0][0] + A[1][1];
    const dt = A[0][0] * A[1][1] - A[0][1] * A[1][0];
    const disc = tr * tr - 4 * dt;
    return {
      statement: "Найди собственные значения $A$ (в любом порядке).",
      tex: `A = ${mat(A)}`,
      fields: [
        { label: "\\lambda_1", value: l1 },
        { label: "\\lambda_2", value: l2 },
      ],
      unordered: true,
      steps: [
        `$\\operatorname{tr}A = ${p(A[0][0])} + ${p(A[1][1])} = ${tr}$, $\\;\\det A = ${p(A[0][0])}\\cdot${p(A[1][1])} - ${p(A[0][1])}\\cdot${p(A[1][0])} = ${dt}$`,
        `Характеристическое уравнение: $\\lambda^2 ${sgn(-tr)}\\lambda ${sgn(dt)} = 0$`,
        `Дискриминант: $${p(tr)}^2 - 4\\cdot${p(dt)} = ${disc}$, $\\sqrt{${disc}} = ${Math.sqrt(disc)}$`,
        `$\\lambda = \\dfrac{${tr} \\pm ${Math.sqrt(disc)}}{2}$ → $\\lambda_1 = ${Math.max(l1, l2)}$, $\\lambda_2 = ${Math.min(l1, l2)}$`,
        `Проверка: $${Math.max(l1, l2)} + ${p(Math.min(l1, l2))} = ${tr} = \\operatorname{tr}A$ ✓, $${Math.max(l1, l2)}\\cdot${p(Math.min(l1, l2))} = ${dt} = \\det A$ ✓`,
      ],
      answerText: `λ = ${l1}, ${l2}`,
    };
  },
};

// ── дискретная математика ────────────────────────────────

const combo: Gen = {
  id: "dm-comb",
  lesson: "discrete/combinatorics",
  title: "Сочетания и размещения",
  level: 1,
  method: [
    "Сначала два вопроса: **важен ли порядок?** и **можно ли повторять?** От ответов зависит формула.",
    "Порядок важен, без повторов — размещения: $A_n^k = \\dfrac{n!}{(n-k)!}$ (места пронумерованы: президент, зам, секретарь).",
    "Порядок не важен — сочетания: $C_n^k = \\dfrac{n!}{k!\\,(n-k)!}$ (просто «команда из $k$ человек»).",
    "Связь: $A_n^k = C_n^k \\cdot k!$ — выбрали команду, потом рассадили её $k!$ способами.",
    "Считай через сокращение: $C_{10}^{3} = \\dfrac{10\\cdot9\\cdot8}{3\\cdot2\\cdot1}$, не надо считать $10!$ целиком.",
  ],
  make(seed) {
    const r = rng(seed);
    const n = int(r, 5, 12);
    const k = int(r, 2, Math.min(4, n - 1));
    const ordered = r() < 0.45;
    const ctx = pick(r, [
      { who: "студентов", ord: "президента, вице-президента" + (k > 2 ? " и ещё " + (k - 2) + " должност" + (k - 2 === 1 ? "ь" : "и") : ""), un: `команду из ${k} человек` },
      { who: "книг", ord: `${k} книги и расставить их на полке по порядку`, un: `${k} книги с собой в отпуск` },
      { who: "задач", ord: `${k} задачи и решить их в определённом порядке`, un: `${k} задачи для контрольной` },
    ]);
    const val = ordered ? C(n, k) * fact(k) : C(n, k);
    const top = Array.from({ length: k }, (_, i) => n - i).join("\\cdot");
    const bot = Array.from({ length: k }, (_, i) => k - i).join("\\cdot");
    return {
      statement: `Есть ${n} ${ctx.who}. Сколькими способами можно выбрать ${ordered ? ctx.ord : ctx.un}?`,
      fields: [{ label: "N", value: val }],
      steps: ordered
        ? [
            `Порядок важен (места разные), повторов нет → размещения $A_{${n}}^{${k}}$.`,
            `$A_{${n}}^{${k}} = ${top} = ${val}$ — на первое место ${n} вариантов, на второе ${n - 1}, …`,
          ]
        : [
            `Порядок не важен (просто набор), повторов нет → сочетания $C_{${n}}^{${k}}$.`,
            `$C_{${n}}^{${k}} = \\dfrac{${top}}{${bot}} = \\dfrac{${C(n, k) * fact(k)}}{${fact(k)}} = ${val}$`,
            `Почему делим на $${k}! = ${fact(k)}$: одна и та же команда посчиталась бы во всех своих перестановках.`,
          ],
      answerText: `${val}`,
    };
  },
};

const inclExcl: Gen = {
  id: "dm-incl",
  lesson: "discrete/sets",
  title: "Включения-исключения",
  level: 2,
  method: [
    "$|A \\cup B| = |A| + |B| - |A \\cap B|$: пересечение посчитали дважды — один раз вычитаем.",
    "Сколько чисел от 1 до $N$ делятся на $a$: $\\lfloor N/a \\rfloor$.",
    "Делятся и на $a$, и на $b$ — значит делятся на $\\operatorname{НОК}(a, b)$, а не на $a\\cdot b$, если у них есть общий делитель.",
    "«Не делится ни на одно» = $N - |A \\cup B|$ — дополнение.",
  ],
  make(seed) {
    const r = rng(seed);
    const N = pick(r, [100, 120, 150, 200, 300, 500, 1000]);
    const a = pick(r, [2, 3, 4, 5, 6, 7]);
    let b = pick(r, [3, 4, 5, 6, 7, 9, 10]);
    if (b === a) b = a + 1;
    const lcm = (a * b) / gcd(a, b);
    const A = Math.floor(N / a);
    const B = Math.floor(N / b);
    const AB = Math.floor(N / lcm);
    const union = A + B - AB;
    const none = r() < 0.5;
    const ans = none ? N - union : union;
    return {
      statement: none
        ? `Сколько чисел от 1 до ${N} **не делятся ни на ${a}, ни на ${b}**?`
        : `Сколько чисел от 1 до ${N} делятся **на ${a} или на ${b}**?`,
      fields: [{ label: "N", value: ans }],
      steps: [
        `Делятся на ${a}: $\\lfloor ${N}/${a} \\rfloor = ${A}$; на ${b}: $\\lfloor ${N}/${b} \\rfloor = ${B}$`,
        `На оба сразу = на $\\operatorname{НОК}(${a}, ${b}) = ${lcm}$: $\\lfloor ${N}/${lcm} \\rfloor = ${AB}$`,
        `$|A\\cup B| = ${A} + ${B} - ${AB} = ${union}$`,
        ...(none ? [`Ни на одно: $${N} - ${union} = ${ans}$`] : []),
      ],
      answerText: `${ans}`,
    };
  },
};

const sums: Gen = {
  id: "dm-sum",
  lesson: "discrete/induction",
  title: "Суммы и прогрессии",
  level: 1,
  method: [
    "Арифметическая прогрессия: $S = \\dfrac{(\\text{первый} + \\text{последний})\\cdot n}{2}$ — трюк юного Гаусса: сложи ряд с ним же задом наперёд.",
    "Количество членов: $n = \\dfrac{\\text{последний} - \\text{первый}}{\\text{шаг}} + 1$. «+1» забывают чаще всего.",
    "Геометрическая: $1 + q + q^2 + \\dots + q^{k} = \\dfrac{q^{k+1}-1}{q-1}$. Для $q=2$: $2^{k+1} - 1$ — поэтому в полном двоичном дереве узлов на один меньше, чем в следующем уровне.",
    "Обе формулы доказываются индукцией — это и есть урок про индукцию.",
  ],
  make(seed) {
    const r = rng(seed);
    if (r() < 0.6) {
      const a = int(r, 1, 20);
      const d = int(r, 1, 7);
      const n = int(r, 8, 40);
      const last = a + (n - 1) * d;
      const S = ((a + last) * n) / 2;
      return {
        statement: `Найди сумму $${a} + ${a + d} + ${a + 2 * d} + \\dots + ${last}$.`,
        fields: [{ label: "S", value: S }],
        steps: [
          `Шаг $d = ${d}$, членов $n = \\dfrac{${last} - ${a}}{${d}} + 1 = ${n}$`,
          `$S = \\dfrac{(${a} + ${last})\\cdot ${n}}{2} = \\dfrac{${a + last}\\cdot${n}}{2} = ${S}$`,
        ],
        answerText: `${S}`,
      };
    }
    const q = pick(r, [2, 3]);
    const k = q === 2 ? int(r, 5, 12) : int(r, 3, 7);
    const S = (q ** (k + 1) - 1) / (q - 1);
    return {
      statement: `Найди сумму $1 + ${q} + ${q}^2 + \\dots + ${q}^{${k}}$.`,
      fields: [{ label: "S", value: S }],
      steps: [
        `Геометрическая прогрессия, $q = ${q}$, последняя степень $${k}$ → $${k + 1}$ членов.`,
        `$S = \\dfrac{${q}^{${k + 1}} - 1}{${q} - 1} = \\dfrac{${q ** (k + 1)} - 1}{${q - 1}} = ${S}$`,
      ],
      answerText: `${S}`,
    };
  },
};

const handshake: Gen = {
  id: "dm-graph",
  lesson: "discrete/graphs",
  title: "Степени и рёбра графа",
  level: 1,
  method: [
    "Лемма о рукопожатиях: $\\sum \\deg(v) = 2|E|$ — каждое ребро добавляет по единице двум концам.",
    "Отсюда: число вершин нечётной степени всегда чётно.",
    "Полный граф $K_n$: каждая вершина соединена с $n-1$ другими, рёбер $\\dfrac{n(n-1)}{2} = C_n^2$.",
    "Дерево на $n$ вершинах: ровно $n-1$ ребро. Добавишь одно — появится цикл.",
  ],
  make(seed) {
    const r = rng(seed);
    const kind = Math.floor(r() * 3);
    if (kind === 0) {
      let degs: number[];
      do degs = Array.from({ length: int(r, 5, 8) }, () => int(r, 1, 5));
      while (degs.reduce((a, b) => a + b, 0) % 2);
      const sum = degs.reduce((a, b) => a + b, 0);
      return {
        statement: `Степени вершин графа: ${degs.join(", ")}. Сколько в нём рёбер?`,
        fields: [{ label: "|E|", value: sum / 2 }],
        steps: [`Сумма степеней: $${degs.join(" + ")} = ${sum}$`, `По лемме о рукопожатиях $|E| = ${sum}/2 = ${sum / 2}$`],
        answerText: `${sum / 2}`,
      };
    }
    if (kind === 1) {
      const n = int(r, 5, 25);
      return {
        statement: `Сколько рёбер в полном графе на ${n} вершинах?`,
        fields: [{ label: "|E|", value: (n * (n - 1)) / 2 }],
        steps: [`Каждая из ${n} вершин соединена с ${n - 1} другими: $${n}\\cdot${n - 1} = ${n * (n - 1)}$`, `Каждое ребро посчитано дважды: $${n * (n - 1)}/2 = ${(n * (n - 1)) / 2}$`],
        answerText: `${(n * (n - 1)) / 2}`,
      };
    }
    const n = int(r, 6, 40);
    const extra = int(r, 0, 3);
    return {
      statement: extra
        ? `Связный граф на ${n} вершинах содержит ровно ${extra} независимых цикл${extra === 1 ? "" : "а"} (его остовное дерево + ${extra} ребр${extra === 1 ? "о" : "а"}). Сколько у него рёбер?`
        : `Сколько рёбер в дереве на ${n} вершинах?`,
      fields: [{ label: "|E|", value: n - 1 + extra }],
      steps: [`У дерева на $${n}$ вершинах $${n} - 1 = ${n - 1}$ рёбер.`, ...(extra ? [`Каждое лишнее ребро добавляет один цикл: $${n - 1} + ${extra} = ${n - 1 + extra}$`] : [])],
      answerText: `${n - 1 + extra}`,
    };
  },
};

const truth: Gen = {
  id: "dm-truth",
  lesson: "discrete/logic",
  title: "Таблица истинности",
  level: 2,
  method: [
    "Выпиши все наборы переменных: для $n$ переменных их $2^n$. Порядок как в двоичном счёте: 000, 001, …, 111.",
    "Считай формулу по частям, каждой подформуле — свой столбец. Так ошибка не размазывается.",
    "Импликация $p \\to q$ ложна **только** при $p = 1, q = 0$. Из лжи следует что угодно.",
    "$\\neg(p \\wedge q) = \\neg p \\vee \\neg q$ и $\\neg(p \\vee q) = \\neg p \\wedge \\neg q$ — законы де Моргана, ими удобно упрощать до таблицы.",
  ],
  make(seed) {
    const r = rng(seed);
    const forms: { tex: string; f: (p: boolean, q: boolean, s: boolean) => boolean; parts: string }[] = [
      { tex: "(p \\to q) \\wedge (q \\to r)", f: (p, q, s) => (!p || q) && (!q || s), parts: "$p\\to q$, $q \\to r$, их конъюнкция" },
      { tex: "(p \\vee q) \\to r", f: (p, q, s) => !(p || q) || s, parts: "$p \\vee q$, затем импликация в $r$" },
      { tex: "\\neg(p \\wedge q) \\vee r", f: (p, q, s) => !(p && q) || s, parts: "$p\\wedge q$, отрицание, дизъюнкция с $r$" },
      { tex: "(p \\wedge \\neg q) \\vee (q \\wedge r)", f: (p, q, s) => (p && !q) || (q && s), parts: "$p\\wedge\\neg q$, $q \\wedge r$, их дизъюнкция" },
      { tex: "(p \\to r) \\wedge (q \\to r)", f: (p, q, s) => (!p || s) && (!q || s), parts: "две импликации и конъюнкция" },
      { tex: "p \\oplus q \\oplus r", f: (p, q, s) => (p !== q) !== s, parts: "$p\\oplus q$, потом $\\oplus r$" },
    ];
    const F = pick(r, forms);
    const rows: string[] = [];
    let cnt = 0;
    for (let i = 0; i < 8; i++) {
      const [p, q, s] = [!!(i & 4), !!(i & 2), !!(i & 1)];
      const v = F.f(p, q, s);
      if (v) cnt++;
      rows.push(`${+p}${+q}${+s}→${+v}`);
    }
    return {
      statement: "На скольких из 8 наборов $(p, q, r)$ формула истинна?",
      tex: F.tex,
      fields: [{ label: "N", value: cnt }],
      steps: [
        `Наборов $2^3 = 8$. Считаем по частям: ${F.parts}.`,
        `Таблица ($pqr$ → значение): \`${rows.slice(0, 4).join("  ")}\``,
        `\`${rows.slice(4).join("  ")}\``,
        `Истинных строк: $${cnt}$`,
      ],
      answerText: `${cnt}`,
    };
  },
};

// ── вероятность ──────────────────────────────────────────

const bayes: Gen = {
  id: "pr-bayes",
  lesson: "ml/probability",
  title: "Формула Байеса",
  level: 2,
  method: [
    "Не формулой, а «в людях»: возьми 10 000 человек и посчитай, сколько из них в каждой клетке.",
    "Больны: $N\\cdot p$. Из них тест положительный у доли «чувствительность».",
    "Здоровы: $N(1-p)$. Из них ложно-положительный — доля $1 - \\text{специфичность}$.",
    "$P(\\text{болен} \\mid +) = \\dfrac{\\text{истинно+}}{\\text{истинно+} + \\text{ложно+}}$. При редкой болезни ложных срабатываний больше, чем больных, — это и есть «парадокс».",
  ],
  make(seed) {
    const r = rng(seed);
    const prev = pick(r, [0.001, 0.005, 0.01, 0.02, 0.05, 0.1]);
    const sens = pick(r, [0.9, 0.95, 0.99]);
    const spec = pick(r, [0.9, 0.95, 0.98, 0.99]);
    const N = 100000;
    const sick = N * prev;
    const tp = sick * sens;
    const fp = (N - sick) * (1 - spec);
    const post = tp / (tp + fp);
    const pct = Math.round(post * 1000) / 10;
    const f = (x: number) => (Number.isInteger(x) ? `${x}` : x.toFixed(1));
    return {
      statement: `Болезнью болеет ${+(prev * 100).toFixed(1)}% людей. Тест находит болезнь у ${Math.round(sens * 100)}% больных и даёт ложную тревогу у ${Math.round((1 - spec) * 100)}% здоровых. Тест положительный. Какова вероятность (в %), что человек болен? Округли до десятых.`,
      fields: [{ label: "P,\\ \\%", value: pct }],
      tol: 0.15,
      steps: [
        `Возьмём $100\\,000$ человек. Больных: $${f(sick)}$, здоровых: $${f(N - sick)}$.`,
        `Истинно положительных: $${f(sick)}\\cdot${sens} = ${f(tp)}$`,
        `Ложно положительных: $${f(N - sick)}\\cdot${Math.round((1 - spec) * 100) / 100} = ${f(fp)}$`,
        `$P = \\dfrac{${f(tp)}}{${f(tp)} + ${f(fp)}} \\approx ${post.toFixed(4)} = ${pct}\\%$`,
      ],
      answerText: `${pct}%`,
    };
  },
};

const expectation: Gen = {
  id: "pr-expect",
  lesson: "ml/probability",
  title: "Матожидание",
  level: 1,
  method: [
    "$\\mathbb E[X] = \\sum x_i\\,p_i$ — среднее значение, взвешенное вероятностями.",
    "Линейность: $\\mathbb E[X + Y] = \\mathbb E[X] + \\mathbb E[Y]$ — **всегда**, даже для зависимых величин. Это главный трюк.",
    "Для честного кубика $\\mathbb E = 3.5$; для суммы $k$ кубиков — $3.5k$, без перебора всех исходов.",
    "Игра выгодна, если $\\mathbb E[\\text{выигрыш}] > 0$.",
  ],
  make(seed) {
    const r = rng(seed);
    if (r() < 0.5) {
      const k = int(r, 2, 6);
      const bonus = int(r, 0, 10);
      const val = 3.5 * k + bonus;
      return {
        statement: `Бросают ${k} честных кубиков и к сумме прибавляют ${bonus}. Найди матожидание результата.`,
        fields: [{ label: "\\mathbb E", value: val }],
        steps: [`Матожидание одного кубика: $\\dfrac{1+2+\\dots+6}{6} = 3.5$`, `По линейности: $${k}\\cdot 3.5 + ${bonus} = ${val}$`],
        answerText: `${val}`,
      };
    }
    const win = int(r, 2, 20) * 10;
    const pw = pick(r, [0.1, 0.2, 0.25, 0.3, 0.4]);
    const cost = int(r, 1, 8) * 10;
    const val = Math.round((win * pw - cost) * 100) / 100;
    return {
      statement: `Билет стоит ${cost} ₸. С вероятностью ${pw} выигрываешь ${win} ₸, иначе ничего. Матожидание чистого выигрыша?`,
      fields: [{ label: "\\mathbb E", value: val }],
      tol: 0.01,
      steps: [`$\\mathbb E[\\text{приз}] = ${win}\\cdot${pw} = ${win * pw}$`, `Минус цена билета: $${win * pw} - ${cost} = ${val}$ — игра ${val > 0 ? "выгодна" : val < 0 ? "невыгодна" : "честная"}.`],
      answerText: `${val}`,
    };
  },
};

export const GENS: Gen[] = [vecComb, matVec, matMul, det2, det3, system2, inverse2, eig2, truth, sums, inclExcl, combo, handshake, expectation, bayes];
export const genById = (id: string) => GENS.find((g) => g.id === id);

/** Разбор ответа: целые, десятичные (точка или запятая) и дроби 3/4. */
export function parseNum(raw: string): number | null {
  const s = raw.trim().replace(",", ".").replace(/\s+/g, "").replace("−", "-");
  if (!s) return null;
  const m = s.match(/^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/);
  if (m) {
    const d = Number(m[2]);
    return d === 0 ? null : Number(m[1]) / d;
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function checkAnswer(pr: Problem, inputs: string[]) {
  const tol = pr.tol ?? 1e-6;
  const vals = inputs.map(parseNum);
  if (vals.some((v) => v === null)) return { ok: false, perField: vals.map(() => false), complete: false };
  const want = pr.fields.map((f) => f.value);
  if (pr.unordered) {
    const a = [...(vals as number[])].sort((x, y) => x - y);
    const b = [...want].sort((x, y) => x - y);
    const ok = a.every((v, i) => Math.abs(v - b[i]) <= tol);
    const perField = (vals as number[]).map((v) => want.some((w) => Math.abs(v - w) <= tol));
    return { ok, perField, complete: true };
  }
  const perField = (vals as number[]).map((v, i) => Math.abs(v - want[i]) <= tol);
  return { ok: perField.every(Boolean), perField, complete: true };
}
