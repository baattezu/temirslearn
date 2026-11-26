import { useState } from "react";
import { Link } from "react-router";
import { PROFESSIONS, SEGMENTS } from "../content/roadmaps";
import { cx } from "../ui/cx";
import { Frame } from "./Frame";
import { Caption } from "./kit";

const segsOf = (id: string) => new Set(PROFESSIONS.find((p) => p.id === id)!.stages.flatMap((s) => s.segments));

/** Две профессии → что общего, что своё. Данные — живые роадмапы. */
export function ProfessionOverlap() {
  const [a, setA] = useState("backend-java");
  const [b, setB] = useState("devops");
  const A = segsOf(a);
  const B = segsOf(b);
  const both = [...A].filter((s) => B.has(s));
  const onlyA = [...A].filter((s) => !B.has(s));
  const onlyB = [...B].filter((s) => !A.has(s));
  const pa = PROFESSIONS.find((p) => p.id === a)!;
  const pb = PROFESSIONS.find((p) => p.id === b)!;
  const share = Math.round((both.length / new Set([...A, ...B]).size) * 100);

  const picker = (val: string, set: (v: string) => void, other: string) => (
    <div className="flex flex-wrap gap-1.5">
      {PROFESSIONS.map((p) => (
        <button
          key={p.id}
          type="button"
          disabled={p.id === other}
          onClick={() => set(p.id)}
          className={cx(
            "h-8 rounded-full border px-3 text-[12.5px] transition disabled:opacity-30",
            p.id === val ? "border-transparent text-bg" : "border-line text-dim hover:text-ink",
          )}
          style={p.id === val ? { background: p.color } : undefined}
        >
          {p.title.replace(" · ", " ")}
        </button>
      ))}
    </div>
  );
  const list = (ids: string[], color: string) => (
    <ul className="grid gap-1">
      {ids.map((id) => (
        <li key={id} className="flex items-center gap-2 text-[13px] text-dim">
          <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
          {SEGMENTS[id].title}
        </li>
      ))}
      {!ids.length && <li className="text-[13px] text-mute">—</li>}
    </ul>
  );

  return (
    <Frame title="Где профессии пересекаются" hint="данные из роадмапов">
      <Caption>первая</Caption>
      {picker(a, setA, b)}
      <Caption className="mt-3">вторая</Caption>
      {picker(b, setB, a)}

      <div className="mt-5 flex h-4 overflow-hidden rounded-full">
        <div style={{ flex: onlyA.length, background: pa.color, opacity: 0.55 }} />
        <div style={{ flex: both.length, background: "var(--color-ink)" }} />
        <div style={{ flex: onlyB.length, background: pb.color, opacity: 0.55 }} />
      </div>
      <div className="mt-2 text-[14px] text-dim">
        Общего: <span className="font-mono font-semibold text-ink">{share}%</span> сегментов — {both.length} из {new Set([...A, ...B]).size}.
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <div>
          <Caption>только {pa.title.split(" ·")[0]}</Caption>
          {list(onlyA, pa.color)}
        </div>
        <div>
          <Caption>общее</Caption>
          {list(both, "var(--color-ink)")}
        </div>
        <div>
          <Caption>только {pb.title.split(" ·")[0]}</Caption>
          {list(onlyB, pb.color)}
        </div>
      </div>
      <Link to={`/roadmaps/${a}`} className="mt-4 inline-block text-[13px] text-dim hover:text-ink">
        открыть роадмап «{pa.title}» →
      </Link>
    </Frame>
  );
}
