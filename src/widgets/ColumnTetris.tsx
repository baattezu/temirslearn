import { ArrowDown, ArrowUp, Wand2 } from "lucide-react";
import { useState } from "react";
import { useIsPhone } from "../lib/hooks";
import { Button, IconButton } from "../ui/Button";
import { Slider } from "../ui/Field";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { C, Metric, Metrics } from "./kit";

// Выравнивание колонок в кортеже PostgreSQL (typalign): каждое значение начинается
// с адреса, кратного его выравниванию; разрыв заполняется нулями. Данные начинаются после t_hoff = 24.
interface Col {
  name: string;
  type: string;
  size: number;
  align: number;
}

const TYPES: Record<string, { size: number; align: number }> = {
  boolean: { size: 1, align: 1 },
  smallint: { size: 2, align: 2 },
  integer: { size: 4, align: 4 },
  date: { size: 4, align: 4 },
  bigint: { size: 8, align: 8 },
  timestamptz: { size: 8, align: 8 },
  "double precision": { size: 8, align: 8 },
  uuid: { size: 16, align: 1 },
  "text (10 симв.)": { size: 11, align: 1 }, // короткий varlena: 1 Б заголовка, без выравнивания
};

const START: Col[] = [
  ["is_active", "boolean"],
  ["id", "bigint"],
  ["kind", "smallint"],
  ["created_at", "timestamptz"],
  ["is_deleted", "boolean"],
  ["user_id", "bigint"],
  ["amount", "integer"],
  ["flag", "boolean"],
  ["score", "double precision"],
].map(([name, type]) => ({ name, type, ...TYPES[type] }));

const PALETTE = [C.accent, C.blue, C.amber, C.violet, C.teal, C.rose, "#9cc744", "#8fb8ff", "#ffd08a"];

function layout(cols: Col[]) {
  let off = 0;
  let pad = 0;
  const cells: { col: number | null }[] = [];
  cols.forEach((c, i) => {
    const a = Math.ceil(off / c.align) * c.align;
    for (; off < a; off++) cells.push({ col: null });
    for (let k = 0; k < c.size; k++) cells.push({ col: i });
    off = a + c.size;
  });
  pad = cells.filter((c) => c.col === null).length;
  const data = off;
  const tuple = 24 + data;
  const onDisk = Math.ceil(tuple / 8) * 8 + 4; // MAXALIGN + line pointer
  return { cells, pad, data, tuple, onDisk };
}

export function ColumnTetris() {
  const phone = useIsPhone();
  const [cols, setCols] = useState(START);
  const [rowsExp, setRowsExp] = useState(8);
  const L = layout(cols);
  const best = layout([...cols].sort((a, b) => b.align - a.align || b.size - a.size));
  const perLine = phone ? 16 : 32;
  const rows = 10 ** rowsExp;
  const gb = (bytes: number) => (bytes * rows) / 1024 ** 3;
  // строк на страницу: (8192 − 24) / (MAXALIGN(tuple) + 4)
  const perPage = Math.floor((8192 - 24) / L.onDisk);

  const move = (i: number, d: number) =>
    setCols((cs) => {
      const j = i + d;
      if (j < 0 || j >= cs.length) return cs;
      const n = [...cs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  return (
    <Frame
      title="Тетрис колонок: выравнивание в строке"
      hint="меняй порядок колонок"
      controls={
        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <Slider
            label="Строк в таблице"
            value={rowsExp}
            min={4}
            max={10}
            step={0.5}
            onChange={setRowsExp}
            display={rows >= 1e9 ? `${(rows / 1e9).toFixed(rows >= 1e10 ? 0 : 1)} млрд` : rows >= 1e6 ? `${Math.round(rows / 1e6)} млн` : `${Math.round(rows / 1e3)} тыс`}
          />
          <div className="grid grid-cols-2 gap-2">
            <Button variant="primary" icon={<Wand2 className="size-4" />} onClick={() => setCols((cs) => [...cs].sort((a, b) => b.align - a.align || b.size - a.size))}>
              Уложить
            </Button>
            <Button onClick={() => setCols(START)}>Сначала</Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <ol className="grid content-start gap-1">
          {cols.map((c, i) => (
            <li key={c.name} className="flex items-center gap-1.5 rounded-lg border border-line bg-bg/40 py-0.5 pl-2.5 pr-0.5">
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: PALETTE[START.findIndex((s) => s.name === c.name) % PALETTE.length] }} />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink">{c.name}</span>
              <span className="shrink-0 font-mono text-[10.5px] text-mute">
                {c.size}/{c.align}
              </span>
              <IconButton label="Выше" className="size-7" onClick={() => move(i, -1)} disabled={i === 0}>
                <ArrowUp className="size-3.5" />
              </IconButton>
              <IconButton label="Ниже" className="size-7" onClick={() => move(i, 1)} disabled={i === cols.length - 1}>
                <ArrowDown className="size-3.5" />
              </IconButton>
            </li>
          ))}
          <li className="px-1 pt-1 text-[11.5px] text-mute">размер / выравнивание, байт</li>
        </ol>

        <div className="min-w-0">
          <div className="mb-1 flex justify-between font-mono text-[10px] text-mute">
            <span>данные строки после 24 Б заголовка</span>
            <span>{perLine} Б в ряд</span>
          </div>
          <div className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${perLine}, minmax(0, 1fr))` }}>
            {L.cells.map((cell, k) => {
              const c = cell.col === null ? null : cols[cell.col];
              const color = c ? PALETTE[START.findIndex((s) => s.name === c.name) % PALETTE.length] : C.bad;
              const first = c && (k === 0 || L.cells[k - 1].col !== cell.col);
              return (
                <div
                  key={k}
                  title={c ? `${c.name} (${c.type})` : "выравнивание — пустые байты"}
                  className={cx("relative h-6 rounded-[3px]", k % 8 === 0 && "ml-[2px]")}
                  style={
                    c
                      ? { background: color, opacity: 0.85 }
                      : { background: `repeating-linear-gradient(135deg, ${color} 0 1.5px, transparent 1.5px 4px)`, border: `1px solid color-mix(in oklab, ${color} 55%, transparent)` }
                  }
                >
                  {first && <span className="absolute left-0.5 top-0 font-mono text-[8.5px] font-semibold leading-6 text-bg">{c!.name.slice(0, 3)}</span>}
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[12px] text-mute">Штриховка — байты выравнивания. Тонкие зазоры — границы 8-байтных слов.</div>

          <Metrics className="mt-4">
            <Metric label="данные" value={`${L.data} Б`} />
            <Metric label="из них padding" value={`${L.pad} Б`} tone={L.pad ? "bad" : "ok"} />
            <Metric label="на диске / строка" value={`${L.onDisk} Б`} />
            <Metric label="строк на страницу" value={perPage} />
          </Metrics>
          <div className="mt-3 rounded-xl border border-line bg-bg/40 p-3 text-[13.5px] leading-relaxed text-dim">
            Таблица: <b className="font-mono text-ink">{gb(L.onDisk).toFixed(gb(L.onDisk) < 10 ? 2 : 1)} ГБ</b>
            {L.onDisk > best.onDisk ? (
              <>
                {" "}
                · уложенная плотно — <b className="font-mono text-accent">{gb(best.onDisk).toFixed(gb(best.onDisk) < 10 ? 2 : 1)} ГБ</b>, минус{" "}
                {Math.round((1 - best.onDisk / L.onDisk) * 100)}% только от порядка колонок.
              </>
            ) : (
              <> · порядок оптимален: сначала 8-байтные, потом 4, 2, 1 и переменной длины.</>
            )}
          </div>
        </div>
      </div>
    </Frame>
  );
}
