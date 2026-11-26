import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Slider, Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Legend, Log, Metric, Metrics, StepControls } from "./kit";

// ══ React: кто перерисовывается ═══════════════════════════════

interface RNode {
  id: string;
  label: string;
  kids?: string[];
  memo?: boolean;
  usesCb?: boolean;
}
export function ReactRerender() {
  const [memo, setMemo] = useState(false);
  const [cb, setCb] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [flash, setFlash] = useState<string[]>([]);
  const [log, setLog] = useState<string[]>([]);
  const tree: Record<string, RNode> = {
    app: { id: "app", label: "App · [query, theme]", kids: ["header", "list", "sidebar"] },
    header: { id: "header", label: "Header · theme" },
    list: { id: "list", label: "List · items, onSelect", kids: ["i1", "i2", "i3"], memo: true, usesCb: true },
    i1: { id: "i1", label: "Item", memo: true },
    i2: { id: "i2", label: "Item", memo: true },
    i3: { id: "i3", label: "Item", memo: true },
    sidebar: { id: "sidebar", label: "Sidebar · [open]", kids: ["counter"] },
    counter: { id: "counter", label: "Counter · [n]" },
  };
  const render = (root: string, changedProps: (id: string) => boolean) => {
    const out: string[] = [];
    const go = (id: string, forced: boolean) => {
      const n = tree[id];
      if (!forced && memo && n.memo && !changedProps(id)) return;
      out.push(id);
      n.kids?.forEach((k) => go(k, false));
    };
    go(root, true);
    return out;
  };
  const apply = (ids: string[], msg: string) => {
    setCounts((c) => {
      const n = { ...c };
      ids.forEach((id) => (n[id] = (n[id] ?? 0) + 1));
      return n;
    });
    setFlash(ids);
    setLog((l) => [...l, `${msg}: перерисовано ${ids.length} компонент(ов)`]);
    setTimeout(() => setFlash([]), 700);
  };
  const Node = ({ id, depth }: { id: string; depth: number }) => {
    const n = tree[id];
    const on = flash.includes(id);
    return (
      <div style={{ marginLeft: depth * 18 }}>
        <div className={cx("my-0.5 flex items-center justify-between rounded-lg border px-2.5 py-1.5 transition-colors duration-300", on ? "border-amber bg-amber/15" : "border-line")}>
          <span className="font-mono text-[12px] text-ink">
            {memo && n.memo ? <span className="text-violet">memo </span> : null}
            {n.label}
          </span>
          <span className="font-mono text-[11px] text-mute">рендеров: {counts[id] ?? 0}</span>
        </div>
        {n.kids?.map((k) => (
          <Node key={k} id={k} depth={depth + 1} />
        ))}
      </div>
    );
  };
  return (
    <Frame title="React: что перерисуется после setState" hint="рендер = вызов функции компонента">
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Toggle checked={memo} onChange={setMemo} label="React.memo на List и Item" />
        <Toggle checked={cb} onChange={setCb} label="onSelect через useCallback" />
      </div>
      <div className="mt-3">
        <Node id="app" depth={0} />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Button size="sm" variant="primary" onClick={() => apply(render("app", (id) => (id === "list" ? !cb : false)), "App: setTheme")}>
          App.setTheme
        </Button>
        <Button size="sm" onClick={() => apply(render("counter", () => false), "Counter: setN")}>
          Counter.setN
        </Button>
        <Button size="sm" onClick={() => { setCounts({}); setLog([]); }}>Сбросить счётчики</Button>
      </div>
      <Log className="mt-3" lines={log} max={3} empty="Состояние меняется → перерисовывается компонент-владелец и ВСЕ его потомки, если их не остановить memo." />
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {!memo
          ? "Без memo изменение в App перерисовывает всё дерево — даже компоненты, чьи пропсы не менялись. Обычно это дёшево: рендер — вызов функции и сравнение виртуального DOM, реальный DOM трогается только там, где есть разница."
          : !cb
            ? "memo сравнивает пропсы поверхностно. onSelect = () => … создаётся заново при каждом рендере App — новая ссылка, и memo у List бесполезен."
            : "memo + стабильная ссылка из useCallback: List и Item пропущены. Header перерисован — он читает theme."}
      </p>
    </Frame>
  );
}

// ══ useEffect: гонка запросов ════════════════════════════════

const TYPED = ["r", "re", "rea", "reac", "react"];
const LAT = [420, 900, 260, 640, 300];
export function EffectRace() {
  const [fix, setFix] = useState(false);
  const [t, setT] = useState(0);
  const events = TYPED.map((q, i) => ({ q, sent: i * 150, back: i * 150 + LAT[i] }));
  const arrived = events.filter((e) => e.back <= t).sort((a, b) => a.back - b.back);
  const latestSent = events.filter((e) => e.sent <= t).at(-1);
  const shown = fix ? arrived.filter((e) => e.q === latestSent?.q).at(-1) : arrived.at(-1);
  const input = latestSent?.q ?? "";
  const W = 540;
  const max = 1600;
  const wrong = shown && shown.q !== input;
  return (
    <Frame title="Поиск при вводе: гонка ответов" hint="задержки ответов случайны">
      <Toggle checked={fix} onChange={setFix} label="cleanup: игнорировать/отменять устаревшие запросы" />
      <svg viewBox={`-60 0 ${W + 64} ${TYPED.length * 26 + 22}`} className="mt-3 block w-full">
        {events.map((e, i) => {
          const stale = fix && latestSent && e.sent < latestSent.sent && e.back > latestSent.sent;
          return (
            <g key={i}>
              <text x={-6} y={i * 26 + 16} textAnchor="end" fontSize={11} fill={C.dim} fontFamily="var(--font-mono)">
                &quot;{e.q}&quot;
              </text>
              <line x1={(e.sent / max) * W} x2={(e.back / max) * W} y1={i * 26 + 12} y2={i * 26 + 12} stroke={stale ? C.mute : C.blue} strokeWidth={3} strokeDasharray={stale ? "3 3" : undefined} />
              <circle cx={(e.back / max) * W} cy={i * 26 + 12} r={4} fill={e.back <= t ? (shown === e ? C.accent : C.mute) : C.raised} />
            </g>
          );
        })}
        <line x1={(t / max) * W} x2={(t / max) * W} y1={0} y2={TYPED.length * 26 + 6} stroke={C.amber} />
        <text x={(t / max) * W} y={TYPED.length * 26 + 18} textAnchor="middle" fontSize={10} fill={C.amber} fontFamily="var(--font-mono)">
          {t} мс
        </text>
      </svg>
      <Slider label="Время" value={t} min={0} max={max} step={20} onChange={setT} />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-line bg-bg/40 p-2.5">
          <Caption className="mb-1">В поле ввода</Caption>
          <div className="font-mono text-[15px] text-ink">{input || "—"}</div>
        </div>
        <div className={cx("rounded-xl border p-2.5", wrong ? "border-bad/50 bg-bad/10" : "border-line bg-bg/40")}>
          <Caption className="mb-1">На экране результаты для</Caption>
          <div className={cx("font-mono text-[15px]", wrong ? "text-bad" : "text-ink")}>{shown ? `"${shown.q}"` : "загрузка…"}</div>
        </div>
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {fix
          ? "Эффект возвращает cleanup: при смене запроса предыдущий отменяется (AbortController) или его ответ игнорируется по флагу. На экран попадает только ответ на актуальный запрос."
          : "Каждый ввод запускает fetch в useEffect, ответы приходят в случайном порядке, и setState последнего пришедшего побеждает. Подвигай время к 1300 мс: в поле «react», а на экране — результаты для «re»."}
      </p>
    </Frame>
  );
}

// ══ TypeScript: сужение типов ════════════════════════════════

const TS_LINES: { code: string; type: string }[] = [
  { code: "type Shape =", type: "" },
  { code: "  | { kind: 'circle'; r: number }", type: "" },
  { code: "  | { kind: 'rect'; w: number; h: number }", type: "" },
  { code: "  | { kind: 'tri'; a: number; h: number };", type: "" },
  { code: "function area(s: Shape) {", type: "s: Shape" },
  { code: "  switch (s.kind) {", type: "s.kind: 'circle' | 'rect' | 'tri'" },
  { code: "    case 'circle': return Math.PI * s.r ** 2;", type: "s: { kind: 'circle'; r: number }" },
  { code: "    case 'rect':   return s.w * s.h;", type: "s: { kind: 'rect'; w: number; h: number }" },
  { code: "    case 'tri':    return 0.5 * s.a * s.h;", type: "s: { kind: 'tri'; a: number; h: number }" },
  { code: "    default:", type: "s: never" },
  { code: "      const _exhaustive: never = s;", type: "ок: все варианты разобраны" },
  { code: "      return _exhaustive;", type: "" },
  { code: "  }", type: "" },
  { code: "}", type: "" },
];
export function TsNarrowing() {
  const [added, setAdded] = useState(false);
  const [i, setI] = useState(5);
  const lines = added ? [...TS_LINES.slice(0, 4).map((l, k) => (k === 3 ? { ...l, code: "  | { kind: 'tri'; a: number; h: number }" } : l)), { code: "  | { kind: 'poly'; pts: number[] };", type: "" }, ...TS_LINES.slice(4)] : TS_LINES;
  const err = added && lines[i]?.code.includes("_exhaustive: never");
  const typeAt = (l: { code: string; type: string }) =>
    added && l.code.includes("switch") ? "s.kind: 'circle' | 'rect' | 'tri' | 'poly'" : added && l.code.trim() === "default:" ? "s: { kind: 'poly'; pts: number[] }" : added && l.code.includes("_exhaustive: never") ? "ошибка: 'poly' не присваивается never" : l.type;
  return (
    <Frame title="Сужение типов и проверка полноты" hint="кликай строки">
      <Toggle checked={added} onChange={(v) => { setAdded(v); setI(v ? 11 : 10); }} label="Добавить в Shape вариант 'poly'" />
      <pre className="mt-3 overflow-x-auto rounded-xl border border-line bg-bg/60 py-2 font-mono text-[11.5px] leading-[1.7]">
        {lines.map((l, k) => (
          <button key={k} type="button" onClick={() => setI(k)} className={cx("block w-full whitespace-pre px-3 text-left", k === i ? (err ? "bg-bad/15 text-ink" : "bg-accent/15 text-ink") : typeAt(l) ? "text-dim hover:bg-raised" : "text-mute")}>
            {l.code}
          </button>
        ))}
      </pre>
      <div className={cx("mt-3 rounded-xl border px-3.5 py-2.5 font-mono text-[12.5px]", err ? "border-bad/40 bg-bad/10 text-bad" : "border-line bg-bg/40 text-accent")}>
        {typeAt(lines[i]) || "— выбери строку внутри функции"}
      </div>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Проверка поля-дискриминанта сужает объединение до одного варианта — внутри case доступны только его поля. В default не осталось вариантов, тип — never. Добавишь новый вариант — присваивание в never перестанет компилироваться, и компилятор покажет все switch, которые надо обновить.
      </p>
    </Frame>
  );
}

// ══ Core Web Vitals: водопад загрузки ═════════════════════════

export function WebVitals() {
  const [preload, setPreload] = useState(false);
  const [deferJs, setDeferJs] = useState(false);
  const [critical, setCritical] = useState(false);
  const [dims, setDims] = useState(false);
  const rows = useMemo(() => {
    const html = { name: "HTML", s: 0, e: 300, color: C.blue };
    const css = { name: "app.css (блокирует отрисовку)", s: 300, e: critical ? 300 : 800, color: C.violet };
    const js = { name: `app.js ${deferJs ? "(defer)" : "(блокирует парсер)"}`, s: 300, e: 1100, color: C.amber };
    const parseDone = deferJs ? 450 : 1100 + 150;
    const imgStart = preload ? 320 : Math.max(parseDone, critical ? 300 : 800);
    const img = { name: `hero.jpg${preload ? " (preload)" : ""}`, s: imgStart, e: imgStart + 900, color: C.accent };
    const fcp = Math.max(critical ? 350 : 820, deferJs ? 0 : 1250);
    const lcp = Math.max(fcp, img.e + 50);
    return { list: [html, css, js, img], fcp, lcp };
  }, [preload, deferJs, critical]);
  const cls = dims ? 0.02 : 0.31;
  const max = 3000;
  const W = 540;
  return (
    <Frame title="Загрузка страницы: LCP и CLS" hint="мобильная сеть">
      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        <Toggle checked={critical} onChange={setCritical} label="Критический CSS инлайн" />
        <Toggle checked={deferJs} onChange={setDeferJs} label="<script defer>" />
        <Toggle checked={preload} onChange={setPreload} label="<link rel=preload> для hero" />
        <Toggle checked={dims} onChange={setDims} label="width/height у картинок" />
      </div>
      <svg viewBox={`0 0 ${W} ${rows.list.length * 28 + 34}`} className="mt-4 block w-full">
        {rows.list.map((r, k) => (
          <g key={r.name}>
            <rect x={(r.s / max) * W} y={k * 28 + 4} width={Math.max(2, ((r.e - r.s) / max) * W)} height={18} rx={4} fill={r.color} opacity={0.75} />
            <text x={(r.e / max) * W + 6} y={k * 28 + 17} fontSize={11} fill={C.dim} fontFamily="var(--font-mono)">
              {r.name}
            </text>
          </g>
        ))}
        {[
          ["FCP", rows.fcp, C.blue],
          ["LCP", rows.lcp, rows.lcp > 2500 ? C.bad : C.ok],
        ].map(([l, v, c]) => (
          <g key={l as string}>
            <line x1={((v as number) / max) * W} x2={((v as number) / max) * W} y1={0} y2={rows.list.length * 28 + 8} stroke={c as string} strokeWidth={2} strokeDasharray="4 3" />
            <text x={((v as number) / max) * W} y={rows.list.length * 28 + 24} textAnchor="middle" fontSize={11} fill={c as string} fontFamily="var(--font-mono)">
              {l as string} {((v as number) / 1000).toFixed(2)}s
            </text>
          </g>
        ))}
      </svg>
      <Metrics className="mt-2">
        <Metric label="LCP" value={`${(rows.lcp / 1000).toFixed(2)} с`} tone={rows.lcp <= 2500 ? "ok" : "bad"} />
        <Metric label="FCP" value={`${(rows.fcp / 1000).toFixed(2)} с`} />
        <Metric label="CLS" value={cls.toFixed(2)} tone={cls <= 0.1 ? "ok" : "bad"} />
        <Metric label="цель" value="LCP ≤ 2.5 с, CLS ≤ 0.1" />
      </Metrics>
    </Frame>
  );
}

// ══ Стоимость LLM API ═════════════════════════════════════════

export function TokenCost() {
  const [sys, setSys] = useState(6000);
  const [user, setUser] = useState(400);
  const [out, setOut] = useState(500);
  const [reqK, setReqK] = useState(20);
  const [cache, setCache] = useState(true);
  // примерные цены условной модели среднего класса, $ за 1M токенов
  const P_IN = 3;
  const P_CACHED = 0.3;
  const P_WRITE = 3.75;
  const P_OUT = 15;
  const req = reqK * 1000;
  const inputNoCache = (sys + user) * P_IN;
  const inputCache = sys * P_CACHED + user * P_IN;
  const perReq = ((cache ? inputCache : inputNoCache) + out * P_OUT) / 1e6;
  const day = perReq * req + (cache ? (sys * (P_WRITE - P_CACHED) * 288) / 1e6 : 0); // запись кэша ~раз в 5 минут
  const share = (out * P_OUT) / ((cache ? inputCache : inputNoCache) + out * P_OUT);
  return (
    <Frame title="Сколько стоит LLM-фича" hint="цены условные, $ за 1M токенов: вход 3, из кэша 0.3, выход 15">
      <div className="grid gap-4 sm:grid-cols-2">
        <Slider label="Системный промпт + контекст" value={sys} min={200} max={50000} step={200} onChange={setSys} display={`${sys.toLocaleString("ru")} ток.`} />
        <Slider label="Сообщение пользователя" value={user} min={20} max={4000} step={20} onChange={setUser} display={`${user} ток.`} />
        <Slider label="Ответ модели" value={out} min={20} max={4000} step={20} onChange={setOut} display={`${out} ток.`} />
        <Slider label="Запросов в день" value={reqK} min={1} max={500} onChange={setReqK} display={`${reqK} тыс.`} />
      </div>
      <div className="mt-3">
        <Toggle checked={cache} onChange={setCache} label="Prompt caching для неизменного префикса" />
      </div>
      <Metrics className="mt-4">
        <Metric label="за запрос" value={`$${perReq.toFixed(4)}`} />
        <Metric label="в день" value={`$${day.toFixed(0)}`} tone="accent" />
        <Metric label="в месяц" value={`$${(day * 30).toLocaleString("ru", { maximumFractionDigits: 0 })}`} />
        <Metric label="доля выхода" value={`${Math.round(share * 100)}%`} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Выходные токены в несколько раз дороже входных и генерируются последовательно — они определяют и цену, и задержку. Длинный неизменный префикс (инструкции, документация, примеры) с кэшированием стоит в разы дешевле и ускоряет время до первого токена. Ставь изменяемое в конец промпта, чтобы префикс совпадал.
      </p>
    </Frame>
  );
}

// ══ RAG: поиск по чанкам ══════════════════════════════════════

const DOCS = [
  "Postgres хранит таблицы в страницах по 8 КБ. VACUUM освобождает место мёртвых версий строк, а VACUUM FULL переписывает таблицу целиком.",
  "Индекс B-tree ускоряет поиск по равенству и диапазону. Составной индекс работает по левому префиксу колонок.",
  "Kubernetes перезапускает под, если liveness-проба не проходит. Readiness-проба убирает под из Service, пока он не готов.",
  "Kafka хранит сообщения в партициях. Порядок гарантирован только внутри партиции, ключ определяет партицию.",
  "Отпуск сотрудника оформляется через заявку в HR-портале не позднее чем за две недели до начала отпуска.",
  "Для деплоя на прод нужен зелёный CI и апрув двух ревьюеров. Откат выполняется командой rollback в пайплайне.",
];
const QUERIES = ["как освободить место после удаления строк в postgres", "почему под не получает трафик", "за сколько дней подать заявку на отпуск", "как откатить релиз"];
const tok = (s: string) => s.toLowerCase().replace(/[^a-zа-яё0-9 ]/gi, " ").split(/\s+/).filter((w) => w.length > 2).map((w) => w.slice(0, 6));

export function RagDemo() {
  const [qi, setQi] = useState(0);
  const [chunk, setChunk] = useState<"doc" | "sentence">("sentence");
  const [k, setK] = useState(2);
  const chunks = useMemo(() => (chunk === "doc" ? DOCS.map((d, i) => ({ doc: i, text: d })) : DOCS.flatMap((d, i) => d.split(/(?<=\.)\s+/).map((t) => ({ doc: i, text: t })))), [chunk]);
  const df = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of chunks) for (const w of new Set(tok(c.text))) m.set(w, (m.get(w) ?? 0) + 1);
    return m;
  }, [chunks]);
  const vec = (s: string) => {
    const v = new Map<string, number>();
    for (const w of tok(s)) v.set(w, (v.get(w) ?? 0) + Math.log(1 + chunks.length / (df.get(w) ?? 1)));
    return v;
  };
  const cos = (a: Map<string, number>, b: Map<string, number>) => {
    let dot = 0;
    for (const [w, x] of a) dot += x * (b.get(w) ?? 0);
    const n = (m: Map<string, number>) => Math.sqrt([...m.values()].reduce((s, x) => s + x * x, 0)) || 1;
    return dot / (n(a) * n(b));
  };
  const q = vec(QUERIES[qi]);
  const scored = chunks.map((c) => ({ ...c, s: cos(q, vec(c.text)) })).sort((a, b) => b.s - a.s);
  const top = scored.slice(0, k);
  const tokens = top.reduce((a, c) => a + Math.ceil(c.text.length / 4), 0);
  return (
    <Frame title="RAG: найти контекст до генерации" hint="TF-IDF вместо эмбеддингов — механика та же">
      <div className="flex flex-wrap gap-1.5">
        {QUERIES.map((x, i) => (
          <Chip key={i} active={i === qi} onClick={() => setQi(i)} className="h-auto py-1.5 text-left text-[12.5px]">
            {x}
          </Chip>
        ))}
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:items-end">
        <Segmented value={chunk} onChange={setChunk} block options={[{ value: "doc", label: "Чанк = документ" }, { value: "sentence", label: "Чанк = предложение" }]} />
        <Slider label="top-k" value={k} min={1} max={4} onChange={setK} />
      </div>
      <div className="mt-3 grid gap-1.5">
        {scored.slice(0, 5).map((c, i) => (
          <div key={i} className={cx("grid grid-cols-[48px_1fr] items-start gap-2 rounded-lg border px-2.5 py-1.5", i < k ? "border-accent/50 bg-accent/[0.06]" : "border-line opacity-60")}>
            <span className="font-mono text-[11.5px] text-dim">{c.s.toFixed(2)}</span>
            <span className="text-[12.5px] leading-snug text-ink">{c.text}</span>
          </div>
        ))}
      </div>
      <Metrics className="mt-3 sm:grid-cols-2">
        <Metric label="в промпт пойдёт" value={`~${tokens} токенов`} />
        <Metric label="чанков в индексе" value={chunks.length} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Найденные чанки вставляются в промпт: «Ответь по контексту: …». Модель видит только то, что нашёл поиск — плохой поиск = уверенный неверный ответ. Крупные чанки тащат шум и токены, мелкие теряют контекст. Чисто лексический поиск ломается на синонимах («трафик» ≠ «Service»), чисто векторный — на точных терминах и кодах, поэтому в проде делают гибрид и реранкинг.
      </p>
    </Frame>
  );
}

// ══ Агент: цикл инструментов ══════════════════════════════════

const AGENT: { who: "user" | "model" | "tool"; text: string; tokens: number }[] = [
  { who: "user", text: "Почему вчера вырос p99 у checkout-сервиса?", tokens: 20 },
  { who: "model", text: "tool_use: query_metrics(service='checkout', metric='p99', range='48h')", tokens: 60 },
  { who: "tool", text: "p99: 180мс → 2.4с с 14:05 вчера; ошибок без изменений", tokens: 120 },
  { who: "model", text: "tool_use: list_deploys(service='checkout', since='yesterday 13:00')", tokens: 50 },
  { who: "tool", text: "14:02 v2.31: «добавлен расчёт скидок по истории заказов»", tokens: 80 },
  { who: "model", text: "tool_use: slow_queries(db='orders', since='14:00')", tokens: 40 },
  { who: "tool", text: "SELECT … FROM orders WHERE user_id = $1 ORDER BY created_at — Seq Scan, 2.1с, 40K вызовов", tokens: 150 },
  { who: "model", text: "Ответ: деплой v2.31 в 14:02 добавил запрос по истории заказов без индекса (user_id, created_at) — Seq Scan по 2 с на каждом checkout. Решение: CREATE INDEX CONCURRENTLY … или откат.", tokens: 90 },
];

export function AgentLoop() {
  const [i, setI] = useState(0);
  const shown = AGENT.slice(0, i + 1);
  const context = shown.reduce((a, m) => a + m.tokens, 800);
  const calls = shown.filter((m) => m.who === "model").length;
  // каждый вызов модели получает на вход всю историю до него (системный промпт ~800 токенов)
  let inputTotal = 0;
  let acc = 800;
  for (const m of shown) {
    if (m.who === "model") inputTotal += acc;
    acc += m.tokens;
  }
  return (
    <Frame
      title="Агент = LLM в цикле с инструментами"
      hint="каждый шаг — новый вызов модели со всей историей"
      controls={<StepControls onStep={() => setI(i + 1)} onBack={() => setI(i - 1)} canBack={i > 0} canStep={i < AGENT.length - 1} onReset={() => setI(0)} />}
    >
      <div className="grid gap-1.5">
        {shown.map((m, k) => (
          <div
            key={k}
            className={cx(
              "rounded-xl border px-3 py-2 text-[13px] leading-snug",
              m.who === "user" ? "border-blue/40 bg-blue/[0.06] text-ink" : m.who === "tool" ? "ml-6 border-line bg-bg/40 font-mono text-[12px] text-dim" : m.text.startsWith("tool_use") ? "border-amber/40 bg-amber/[0.06] font-mono text-[12px] text-ink" : "border-accent/50 bg-accent/[0.06] text-ink",
            )}
          >
            <span className="mr-2 font-mono text-[10.5px] uppercase text-mute">{m.who === "tool" ? "результат" : m.who === "model" ? "модель" : "пользователь"}</span>
            {m.text}
          </div>
        ))}
      </div>
      <Metrics className="mt-3">
        <Metric label="вызовов модели" value={calls} />
        <Metric label="контекст сейчас" value={`${context} ток.`} />
        <Metric label="суммарно на входе" value={`~${inputTotal} ток.`} />
        <Metric label="готово" value={i === AGENT.length - 1 ? "да" : "нет"} tone={i === AGENT.length - 1 ? "ok" : undefined} />
      </Metrics>
      <Legend className="mt-2" items={[{ color: C.amber, label: "модель просит вызвать инструмент" }, { color: C.accent, label: "финальный ответ" }]} />
    </Frame>
  );
}

// ══ Evals: сколько примеров нужно ═════════════════════════════

export function EvalStats() {
  const [n, setN] = useState(50);
  const [pa, setPa] = useState(78);
  const [pb, setPb] = useState(82);
  const se = (p: number) => Math.sqrt((p / 100) * (1 - p / 100) / n) * 100;
  const ci = (p: number) => [Math.max(0, p - 1.96 * se(p)), Math.min(100, p + 1.96 * se(p))];
  const diffSe = Math.sqrt(se(pa) ** 2 + se(pb) ** 2);
  const z = (pb - pa) / (diffSe || 1);
  const significant = Math.abs(z) > 1.96;
  const needed = Math.ceil((2 * 1.96 ** 2 * ((pa / 100) * (1 - pa / 100) + (pb / 100) * (1 - pb / 100))) / ((pb - pa) / 100) ** 2 / 2);
  const Bar = ({ p, color, label }: { p: number; color: string; label: string }) => {
    const [lo, hi] = ci(p);
    return (
      <div className="grid grid-cols-[80px_1fr_120px] items-center gap-2">
        <span className="font-mono text-[12px] text-dim">{label}</span>
        <div className="relative h-5 rounded bg-raised">
          <div className="absolute inset-y-1 rounded" style={{ left: `${lo}%`, width: `${hi - lo}%`, background: color, opacity: 0.35 }} />
          <div className="absolute inset-y-0 w-[3px] rounded" style={{ left: `${p}%`, background: color }} />
        </div>
        <span className="text-right font-mono text-[11.5px] text-mute">
          {p}% ± {(1.96 * se(p)).toFixed(1)}
        </span>
      </div>
    );
  };
  return (
    <Frame title="Новый промпт лучше старого?" hint="95% доверительные интервалы">
      <div className="grid gap-4 sm:grid-cols-3">
        <Slider label="Примеров в eval" value={n} min={20} max={2000} step={10} onChange={setN} />
        <Slider label="Версия A проходит" value={pa} min={50} max={99} onChange={setPa} display={`${pa}%`} />
        <Slider label="Версия B проходит" value={pb} min={50} max={99} onChange={setPb} display={`${pb}%`} />
      </div>
      <div className="mt-4 grid gap-2">
        <Bar p={pa} color={C.blue} label="A" />
        <Bar p={pb} color={C.accent} label="B" />
      </div>
      <Metrics className="mt-3">
        <Metric label="разница" value={`${pb - pa > 0 ? "+" : ""}${pb - pa} п.п.`} />
        <Metric label="z" value={z.toFixed(2)} />
        <Metric label="значимо?" value={significant ? "да" : "нет"} tone={significant ? "ok" : "bad"} />
        <Metric label="нужно примеров" value={pb === pa ? "∞" : `~${needed}`} />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        На {n} примерах разница {pb - pa} п.п. {significant ? "статистически заметна." : "тонет в шуме: интервалы перекрываются, «улучшение» может быть случайностью."} Маленький eval хорош, чтобы ловить грубые регрессии, но не чтобы выбирать между близкими версиями. Ещё надёжнее — парное сравнение на одних и тех же примерах.
      </p>
    </Frame>
  );
}
