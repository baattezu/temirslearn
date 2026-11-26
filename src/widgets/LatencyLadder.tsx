import { useState } from "react";
import { Segmented } from "../ui/Segmented";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";

// Порядки величин, а не бенчмарк: на конкретном железе цифры гуляют в 2–3 раза.
const ITEMS = [
  { name: "L1 кэш", ns: 1, color: "var(--color-accent)", note: "Ядро и L1 — на одном кристалле в паре миллиметров. ~4 такта." },
  { name: "L2 кэш", ns: 4, color: "var(--color-accent)", note: "Свой у каждого ядра, ~12 тактов. Сотни КБ — пара МБ." },
  { name: "L3 кэш", ns: 15, color: "var(--color-accent)", note: "Общий на все ядра, десятки МБ. Дальше — уже шина памяти." },
  { name: "RAM", ns: 100, color: "var(--color-blue)", note: "Промах мимо всех кэшей. Поэтому массив обходится в разы быстрее связного списка: префетчер угадывает следующую строку кэша." },
  { name: "Переключение контекста", ns: 3_000, color: "var(--color-violet)", note: "Ядро ОС сохраняет регистры одного потока и загружает другой, плюс остывшие кэши. Тысячи потоков на запросы — это дорого." },
  { name: "NVMe SSD, 4 КБ случайно", ns: 50_000, color: "var(--color-amber)", note: "Случайное чтение страницы. Отсюда random_page_cost в Postgres и смысл буферного кэша." },
  { name: "RTT внутри датацентра", ns: 250_000, color: "var(--color-teal)", note: "Сервис → сервис в одной зоне. N+1 запросов по сети = N × эта цифра." },
  { name: "HDD, seek", ns: 8_000_000, color: "var(--color-amber)", note: "Механика: головка едет к дорожке и ждёт поворота пластины." },
  { name: "Астана ↔ Франкфурт", ns: 80_000_000, color: "var(--color-teal)", note: "Скорость света в оптоволокне ≈ 200 км/мс, плюс кабель идёт не по прямой." },
  { name: "Астана ↔ Калифорния", ns: 250_000_000, color: "var(--color-teal)", note: "Через полмира. Каждый лишний round-trip в рукопожатии стоит четверть секунды." },
];

function real(ns: number) {
  if (ns < 1_000) return `${ns} нс`;
  if (ns < 1_000_000) return `${+(ns / 1_000).toFixed(1)} мкс`;
  if (ns < 1_000_000_000) return `${+(ns / 1_000_000).toFixed(1)} мс`;
  return `${+(ns / 1e9).toFixed(1)} с`;
}

// 1 нс → 1 секунда
function human(ns: number) {
  const s = ns;
  if (s < 60) return `${s} с`;
  if (s < 3600) return `${+(s / 60).toFixed(1)} мин`;
  if (s < 86400) return `${+(s / 3600).toFixed(1)} ч`;
  if (s < 86400 * 60) return `${+(s / 86400).toFixed(1)} дн`;
  if (s < 86400 * 365) return `${+(s / 86400 / 30).toFixed(1)} мес`;
  return `${+(s / 86400 / 365).toFixed(1)} лет`;
}

export function LatencyLadder() {
  const [mode, setMode] = useState<"real" | "human">("human");
  const [sel, setSel] = useState(3);
  const max = Math.log10(ITEMS[ITEMS.length - 1].ns);
  const item = ITEMS[sel];

  return (
    <Frame
      title="Лестница задержек"
      hint="логарифмическая шкала"
      controls={
        <Segmented
          value={mode}
          onChange={setMode}
          block
          options={[
            { value: "real", label: "Реальное время" },
            { value: "human", label: "Если 1 нс = 1 секунда" },
          ]}
        />
      }
    >
      <div className="grid gap-1">
        {ITEMS.map((it, i) => {
          const w = 6 + (Math.log10(it.ns) / max) * 94;
          return (
            <button
              key={it.name}
              type="button"
              onClick={() => setSel(i)}
              className={cx(
                "grid grid-cols-[minmax(0,7.5rem)_1fr_4.5rem] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition sm:grid-cols-[12rem_1fr_5.5rem]",
                sel === i ? "bg-raised" : "hover:bg-raised/60",
              )}
            >
              <span className={cx("truncate text-[13px]", sel === i ? "text-ink" : "text-dim")}>{it.name}</span>
              <span className="h-3.5 rounded-sm bg-line/50">
                <span
                  className="block h-full rounded-sm transition-[width] duration-500"
                  style={{ width: `${w}%`, background: it.color, opacity: sel === i ? 1 : 0.6 }}
                />
              </span>
              <span className="text-right font-mono text-[12.5px] tabular-nums text-ink">{mode === "real" ? real(it.ns) : human(it.ns)}</span>
            </button>
          );
        })}
      </div>
      <div key={sel} className="anim-fade mt-4 rounded-xl border border-line bg-bg/50 p-3.5">
        <div className="mb-1 flex flex-wrap items-baseline gap-x-3">
          <span className="font-medium text-ink">{item.name}</span>
          {sel > 0 && (
            <span className="font-mono text-[12.5px] text-mute">
              ×{Math.round(item.ns / ITEMS[0].ns).toLocaleString("ru-RU")} от L1
              {sel > 3 && <> · ×{Math.round(item.ns / ITEMS[3].ns).toLocaleString("ru-RU")} от RAM</>}
            </span>
          )}
        </div>
        <p className="text-[14px] leading-relaxed text-dim">{item.note}</p>
      </div>
    </Frame>
  );
}
