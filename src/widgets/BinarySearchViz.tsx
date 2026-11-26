import { RotateCcw, StepForward } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Slider } from "../ui/Field";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";

const ARR = [2, 3, 5, 5, 5, 8, 11, 13, 13, 17, 21, 24, 29, 30, 34, 40];

type Mode = "exact" | "lower";
interface State {
  lo: number;
  hi: number;
  mid: number | null;
  done: boolean;
  found: number | null;
  log: string[];
}

function init(mode: Mode): State {
  // exact: закрытый [lo, hi]; lower_bound: полуоткрытый [lo, hi)
  return { lo: 0, hi: mode === "exact" ? ARR.length - 1 : ARR.length, mid: null, done: false, found: null, log: [] };
}

function step(s: State, mode: Mode, x: number): State {
  if (s.done) return s;
  if (mode === "exact") {
    if (s.lo > s.hi) return { ...s, mid: null, done: true, log: [...s.log, `lo > hi → не найдено`] };
    const mid = (s.lo + s.hi) >> 1;
    const v = ARR[mid];
    if (v === x) return { ...s, mid, done: true, found: mid, log: [...s.log, `a[${mid}] = ${v} == ${x} → нашли`] };
    if (v < x) return { ...s, mid, lo: mid + 1, log: [...s.log, `a[${mid}] = ${v} < ${x} → lo = ${mid + 1}`] };
    return { ...s, mid, hi: mid - 1, log: [...s.log, `a[${mid}] = ${v} > ${x} → hi = ${mid - 1}`] };
  }
  if (s.lo >= s.hi)
    return { ...s, mid: null, done: true, found: s.lo, log: [...s.log, `lo == hi = ${s.lo} → первый ≥ ${x}: индекс ${s.lo}`] };
  const mid = (s.lo + s.hi) >> 1;
  const v = ARR[mid];
  if (v < x) return { ...s, mid, lo: mid + 1, log: [...s.log, `a[${mid}] = ${v} < ${x} → lo = ${mid + 1}`] };
  return { ...s, mid, hi: mid, log: [...s.log, `a[${mid}] = ${v} ≥ ${x} → hi = ${mid}`] };
}

export function BinarySearchViz() {
  const [mode, setMode] = useState<Mode>("lower");
  const [x, setX] = useState(5);
  const [s, setS] = useState<State>(() => init("lower"));
  const reset = (m = mode) => setS(init(m));
  const maxSteps = useMemo(() => Math.ceil(Math.log2(ARR.length + 1)), []);
  const comparisons = s.log.filter((l) => l.startsWith("a[")).length;

  const inRange = (i: number) => (mode === "exact" ? i >= s.lo && i <= s.hi : i >= s.lo && i < s.hi);

  return (
    <Frame
      title="Бинарный поиск по шагам"
      hint={`n = ${ARR.length}, максимум ${maxSteps} сравнений`}
      controls={
        <div className="grid gap-4 sm:grid-cols-2">
          <Segmented
            value={mode}
            onChange={(m) => {
              setMode(m);
              reset(m);
            }}
            block
            options={[
              { value: "exact", label: "Найти x" },
              { value: "lower", label: "lower_bound" },
            ]}
          />
          <Slider label="Ищем x" value={x} min={0} max={42} onChange={(v) => { setX(v); reset(); }} />
        </div>
      }
    >
      <div className="grid grid-cols-8 gap-1.5 sm:grid-cols-16">
        {ARR.map((v, i) => {
          const isMid = s.mid === i;
          const isFound = s.done && s.found === i;
          return (
            <div key={i} className="flex flex-col items-center gap-1">
              <div
                className={cx(
                  "flex h-10 w-full items-center justify-center rounded-lg border font-mono text-[14px] tabular-nums transition",
                  isFound
                    ? "border-ok bg-ok/15 text-ok"
                    : isMid
                      ? "border-accent bg-accent/15 text-accent"
                      : inRange(i) && !s.done
                        ? "border-line-strong bg-raised text-ink"
                        : "border-line/60 text-mute/60",
                )}
              >
                {v}
              </div>
              <div className={cx("h-4 font-mono text-[10px] leading-4", !s.done && (i === s.lo || i === s.hi) ? "text-accent" : "text-mute")}>
                {s.done ? i : [i === s.lo && "lo", i === s.hi && "hi"].filter(Boolean).join("·") || i}
              </div>
            </div>
          );
        })}
      </div>
      {mode === "lower" && !s.done && s.hi === ARR.length && (
        <div className="mt-1 text-right font-mono text-[10px] text-mute">hi = {ARR.length} (за концом)</div>
      )}

      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto]">
        <div className="min-h-[88px] rounded-xl border border-line bg-bg/50 p-3 font-mono text-[12.5px] leading-6 text-dim">
          {s.log.length === 0 ? (
            <span className="text-mute">
              {mode === "exact"
                ? "Инвариант: если x есть, он в [lo, hi]. Нажми «Шаг»."
                : "Инвариант: всё левее lo — меньше x, всё от hi и правее — ≥ x. Нажми «Шаг»."}
            </span>
          ) : (
            s.log.map((l, i) => (
              <div key={i} className={cx(i === s.log.length - 1 && "text-ink")}>
                {i + 1}. {l}
              </div>
            ))
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 md:w-36 md:grid-cols-1 md:content-start">
          <Button variant="primary" icon={<StepForward className="size-4" />} onClick={() => setS(step(s, mode, x))} disabled={s.done} block>
            Шаг
          </Button>
          <Button icon={<RotateCcw className="size-4" />} onClick={() => reset()} block>
            Сначала
          </Button>
        </div>
      </div>
      <div className="mt-2 text-[12.5px] text-mute">
        Сравнений: <span className="font-mono text-ink">{comparisons}</span> из максимум {maxSteps} (⌈log₂(n+1)⌉)
      </div>
    </Frame>
  );
}
