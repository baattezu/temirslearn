import { useState } from "react";
import { Button } from "../ui/Button";
import { Chip } from "../ui/Chip";
import { Slider, Toggle } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Caption, Log, Metric, Metrics } from "./kit";

// ══ Конвейер рендеринга ═════════════════════════════════════

const RSTAGES = [
  { id: "js", label: "JS", ms: 2, color: C.amber },
  { id: "style", label: "Style", ms: 1.5, color: C.violet },
  { id: "layout", label: "Layout", ms: 4, color: C.blue },
  { id: "paint", label: "Paint", ms: 3, color: C.teal },
  { id: "composite", label: "Composite", ms: 0.8, color: C.accent },
];
const PROPS: { id: string; label: string; stages: string[]; note: string }[] = [
  { id: "width", label: "width / height / top", stages: ["js", "style", "layout", "paint", "composite"], note: "Меняется геометрия: пересчитать раскладку (и соседей, и детей), перерисовать, собрать слои. Самое дорогое." },
  { id: "color", label: "color / background", stages: ["js", "style", "paint", "composite"], note: "Геометрия та же — layout пропускается, но пиксели надо перерисовать." },
  { id: "transform", label: "transform / opacity", stages: ["js", "style", "composite"], note: "Если элемент на своём слое (will-change или анимация), compositor просто сдвигает/просвечивает готовую текстуру на GPU. Работает даже когда главный поток занят." },
];

export function RenderPipeline() {
  const [prop, setProp] = useState("width");
  const [n, setN] = useState(100);
  const [interleave, setInterleave] = useState(true);
  const p = PROPS.find((x) => x.id === prop)!;
  const frame = RSTAGES.filter((s) => p.stages.includes(s.id)).reduce((a, s) => a + s.ms, 0);
  // layout thrashing: чтение offsetHeight после записи стиля форсирует синхронный layout
  const forced = interleave ? n : 1;
  const thrashMs = forced * 0.35;
  return (
    <Frame title="Конвейер кадра" hint="бюджет 16.7 мс при 60 Гц">
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-none">
        {PROPS.map((x) => (
          <Chip key={x.id} active={x.id === prop} onClick={() => setProp(x.id)} className="font-mono text-[12px]">
            {x.label}
          </Chip>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-5 gap-1.5">
        {RSTAGES.map((s) => {
          const on = p.stages.includes(s.id);
          return (
            <div key={s.id} className={cx("rounded-lg border px-1 py-2 text-center transition", on ? "" : "opacity-30")} style={{ borderColor: on ? s.color : "var(--color-line)", background: on ? `color-mix(in oklab, ${s.color} 14%, transparent)` : undefined }}>
              <div className="truncate text-[10.5px] font-medium text-ink sm:text-[12px]">{s.label}</div>
              <div className="font-mono text-[10px] text-mute">{on ? `${s.ms} мс` : "пропуск"}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-3 flex h-5 overflow-hidden rounded-md bg-raised">
        {RSTAGES.filter((s) => p.stages.includes(s.id)).map((s) => (
          <div key={s.id} style={{ width: `${(s.ms / 16.7) * 100}%`, background: s.color, opacity: 0.8 }} />
        ))}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10.5px] text-mute">
        <span>{frame.toFixed(1)} мс из 16.7</span>
        <span>{frame <= 16.7 ? "кадр успевает" : "кадр пропущен"}</span>
      </div>
      <p className="mt-2 text-[13.5px] leading-relaxed text-dim">{p.note}</p>

      <div className="mt-5 rounded-xl border border-line bg-bg/40 p-3">
        <Caption>Layout thrashing</Caption>
        <pre className="overflow-x-auto font-mono text-[11.5px] leading-[1.6] text-dim">
          {interleave
            ? `for (const el of items) {\n  el.style.width = w + "px";      // запись\n  total += el.offsetHeight;       // чтение → layout СЕЙЧАС\n}`
            : `const hs = items.map(el => el.offsetHeight); // все чтения\nitems.forEach(el => el.style.width = w + "px"); // все записи`}
        </pre>
        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <Slider label="Элементов" value={n} min={10} max={1000} step={10} onChange={setN} />
          <Toggle checked={interleave} onChange={setInterleave} label="Чтение и запись вперемешку" />
        </div>
        <Metrics className="mt-3 sm:grid-cols-2">
          <Metric label="принудительных layout" value={forced} tone={forced > 1 ? "bad" : "ok"} />
          <Metric label="≈ время" value={`${thrashMs.toFixed(1)} мс`} tone={thrashMs > 16 ? "bad" : "ok"} />
        </Metrics>
      </div>
    </Frame>
  );
}

// ══ V8: hidden classes и inline cache ═══════════════════════

interface Shape {
  id: number;
  props: string[];
  parent: number | null;
  dict?: boolean;
}
interface VObj {
  name: string;
  shape: number;
}
const MAKERS: { label: string; props: string[]; del?: boolean }[] = [
  { label: "{x, y}", props: ["x", "y"] },
  { label: "{y, x}", props: ["y", "x"] },
  { label: "{x, y, z}", props: ["x", "y", "z"] },
  { label: "{x, y} + delete y", props: ["x", "y"], del: true },
];

export function HiddenClasses() {
  const [shapes, setShapes] = useState<Shape[]>([{ id: 0, props: [], parent: null }]);
  const [objs, setObjs] = useState<VObj[]>([]);
  const [seen, setSeen] = useState<number[]>([]);
  const [log, setLog] = useState<string[]>([]);

  const make = (m: (typeof MAKERS)[number]) => {
    const sh = [...shapes];
    let cur = 0;
    const steps: string[] = [];
    for (const p of m.props) {
      const nextProps = [...sh[cur].props, p];
      let found = sh.find((s) => s.parent === cur && s.props.join() === nextProps.join() && !s.dict);
      if (!found) {
        found = { id: sh.length, props: nextProps, parent: cur };
        sh.push(found);
        steps.push(`новый переход S${cur} —${p}→ S${found.id}`);
      } else steps.push(`переход S${cur} —${p}→ S${found.id} уже есть`);
      cur = found.id;
    }
    if (m.del) {
      const d: Shape = { id: sh.length, props: m.props.slice(0, -1), parent: null, dict: true };
      sh.push(d);
      cur = d.id;
      steps.push(`delete → объект переведён в словарный режим (S${d.id}, медленный)`);
    }
    const name = `o${objs.length + 1}`;
    setShapes(sh);
    setObjs([...objs, { name, shape: cur }]);
    setLog((l) => [...l, `${name} = ${m.label}: ${steps.join("; ")}`]);
  };
  const call = (o: VObj) => {
    const ns = seen.includes(o.shape) ? seen : [...seen, o.shape];
    setSeen(ns);
    const st = ns.length === 1 ? "мономорфный" : ns.length <= 4 ? "полиморфный" : "мегаморфный";
    setLog((l) => [...l, `getX(${o.name}): форма S${o.shape} ${seen.includes(o.shape) ? "уже в кэше — быстрый путь" : "новая для этого места вызова"} → IC ${st} (${ns.length} форм)`]);
  };
  const ic = seen.length === 0 ? "неинициализирован" : seen.length === 1 ? "мономорфный" : seen.length <= 4 ? "полиморфный" : "мегаморфный";
  return (
    <Frame title="V8: скрытые классы и inline cache" hint="function getX(o) { return o.x }">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {MAKERS.map((m) => (
          <Button key={m.label} size="sm" onClick={() => make(m)} className="font-mono">
            {m.label}
          </Button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div>
          <Caption>Формы (hidden classes) и переходы</Caption>
          <div className="grid gap-1">
            {shapes.map((s) => (
              <div key={s.id} className={cx("flex items-center gap-2 rounded-md border px-2 py-1 font-mono text-[11.5px]", s.dict ? "border-bad/40 text-bad" : seen.includes(s.id) ? "border-accent/50 text-ink" : "border-line text-dim")} style={{ marginLeft: s.dict ? 0 : s.props.length * 14 }}>
                <span className="text-mute">S{s.id}</span>
                <span>{s.dict ? `dictionary {${s.props.join(", ")}}` : `{${s.props.join(", ")}}`}</span>
                {!s.dict && s.props.length > 0 && <span className="ml-auto text-[10px] text-mute">x @ слот {s.props.indexOf("x")}</span>}
              </div>
            ))}
          </div>
        </div>
        <div>
          <Caption>Объекты — нажми, чтобы вызвать getX</Caption>
          <div className="flex flex-wrap gap-1.5">
            {objs.length === 0 && <span className="text-[12.5px] text-mute">создай объекты кнопками сверху</span>}
            {objs.map((o) => (
              <button key={o.name} type="button" onClick={() => call(o)} className="rounded-lg border border-line-strong bg-raised px-2.5 py-1.5 font-mono text-[12px] text-ink hover:border-accent/60">
                {o.name} <span className="text-mute">S{o.shape}</span>
              </button>
            ))}
          </div>
          <div className={cx("mt-3 rounded-xl border px-3 py-2.5", seen.length <= 1 ? "border-ok/40 bg-ok/[0.06]" : seen.length <= 4 ? "border-amber/40 bg-amber/[0.06]" : "border-bad/40 bg-bad/[0.06]")}>
            <div className="font-mono text-[11px] text-mute">inline cache в getX</div>
            <div className="font-mono text-[15px] font-semibold text-ink">{ic}</div>
            <div className="mt-1 text-[12.5px] text-dim">
              {seen.length <= 1 ? "Одна форма: «если форма S — x в слоте k». Почти как поле в C-структуре." : seen.length <= 4 ? "Несколько форм — цепочка проверок. Медленнее, но терпимо." : "Слишком много форм: кэш сдаётся, каждый доступ — поиск по словарю."}
            </div>
          </div>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => { setShapes([{ id: 0, props: [], parent: null }]); setObjs([]); setSeen([]); setLog([]); }}>
            Сначала
          </Button>
        </div>
      </div>
      <Log className="mt-3" lines={log} max={3} />
    </Frame>
  );
}

// ══ GPU: варп и расхождение ветвлений ════════════════════════

export function WarpDivergence() {
  const [cond, setCond] = useState<"none" | "half" | "lane">("none");
  const lanes = Array.from({ length: 32 }, (_, i) => i);
  const takesIf = (i: number) => (cond === "none" ? true : cond === "half" ? i < 16 : i % 2 === 0);
  const paths = cond === "none" ? 1 : 2;
  const util = cond === "none" ? 100 : 50;
  return (
    <Frame title="Варп: 32 потока, одна инструкция" hint="SIMT">
      <Segmented
        value={cond}
        onChange={setCond}
        block
        options={[
          { value: "none", label: "Без ветвлений" },
          { value: "half", label: "if (i < 16)" },
          { value: "lane", label: "if (i % 2 == 0)" },
        ]}
      />
      <div className="mt-4 grid gap-3">
        {Array.from({ length: paths }, (_, pass) => (
          <div key={pass}>
            <Caption>
              Проход {pass + 1}: {cond === "none" ? "y[i] = a * x[i] + y[i]" : pass === 0 ? "ветка if" : "ветка else"}
            </Caption>
            <div className="grid gap-[3px]" style={{ gridTemplateColumns: "repeat(32, minmax(0, 1fr))" }}>
              {lanes.map((i) => {
                const active = cond === "none" || (pass === 0 ? takesIf(i) : !takesIf(i));
                return <div key={i} className="aspect-[1/2.2] rounded-[3px]" style={{ background: active ? (pass === 0 ? C.accent : C.blue) : "var(--color-raised)", opacity: active ? 0.85 : 1 }} title={`поток ${i}`} />;
              })}
            </div>
          </div>
        ))}
      </div>
      <Metrics className="mt-4">
        <Metric label="проходов" value={paths} />
        <Metric label="загрузка ALU" value={`${util}%`} tone={util === 100 ? "ok" : "bad"} />
        <Metric label="потоков в варпе" value={32} />
        <Metric label="варпов на H100" value="≈ 8 тыс." />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        {cond === "none"
          ? "Все 32 потока выполняют одну и ту же инструкцию над своими данными за раз. Так GPU и получает тысячи операций за такт."
          : "Потоки варпа не могут идти разными путями одновременно. Ветки выполняются по очереди, а потоки «не своей» ветки простаивают. Если условие зависит от данных случайно — та же беда."}
      </p>
    </Frame>
  );
}

export function GpuVsCpu() {
  const [n, setN] = useState(4096);
  const flops = 2 * n ** 3;
  const cpu = flops / 2e12; // ~2 TFLOPS: 32 ядра × AVX-512 FMA
  const gpu = flops / 400e12; // ~400 TFLOPS bf16 на тензорных ядрах (реалистично, не пик)
  const fmt = (s: number) => (s >= 1 ? `${s.toFixed(2)} с` : `${(s * 1000).toFixed(s < 0.01 ? 2 : 1)} мс`);
  return (
    <Frame title="Умножение матриц n × n" hint="2n³ операций">
      <Slider label="n" value={n} min={512} max={16384} step={512} onChange={setN} />
      <Metrics className="mt-4">
        <Metric label="операций" value={`${(flops / 1e12).toFixed(flops < 1e12 ? 2 : 0)} TFLOP`} />
        <Metric label="CPU 32 ядра" value={fmt(cpu)} />
        <Metric label="GPU (bf16)" value={fmt(gpu)} tone="accent" />
        <Metric label="разница" value={`×${Math.round(cpu / gpu)}`} tone="ok" />
      </Metrics>
      <p className="mt-3 text-[13.5px] leading-relaxed text-dim">
        Порядки величин, не бенчмарк. Матрица — идеальная задача для GPU: огромное число одинаковых независимых умножений-сложений, данные переиспользуются (плитки в разделяемой памяти). Но если данные надо сначала везти по PCIe — на маленьких n копирование съест весь выигрыш.
      </p>
    </Frame>
  );
}
