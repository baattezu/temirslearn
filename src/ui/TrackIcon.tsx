import {
  Binary,
  BrainCircuit,
  Bot,
  Boxes,
  CircuitBoard,
  Cpu,
  FlaskConical,
  FunctionSquare,
  Grid3x3,
  History,
  Landmark,
  Layers,
  Network,
  Puzzle,
  Shapes,
  Sigma,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import {
  siC,
  siCplusplus,
  siDocker,
  siGooglechrome,
  siLinux,
  siOpenjdk,
  siPostgresql,
  siPython,
  siReact,
  type SimpleIcon,
} from "simple-icons";
import { cx } from "./cx";

// Языки и технологии — логотипы (Simple Icons, CC0), темы — иконки Lucide.
// Цвет логотипа подобран под тёмный фон: фирменный там, где он читается, иначе светлее.

type Def = { brand: SimpleIcon; color: string } | { lucide: LucideIcon };

const ICONS: Record<string, Def> = {
  intro: { lucide: History },
  discrete: { lucide: Sigma },
  linalg: { lucide: Grid3x3 },
  computer: { lucide: Cpu },
  linux: { brand: siLinux, color: "#FCC624" },
  embedded: { lucide: CircuitBoard },
  dsa: { lucide: Binary },
  "clean-code": { lucide: Sparkles },
  oop: { lucide: Shapes },
  fp: { lucide: FunctionSquare },
  solid: { lucide: Layers },
  patterns: { lucide: Puzzle },
  testing: { lucide: FlaskConical },
  c: { brand: siC, color: "#A8B9CC" },
  cpp: { brand: siCplusplus, color: "#5E97D0" },
  java: { brand: siOpenjdk, color: "#F89820" },
  python: { brand: siPython, color: "#FFD43B" },
  network: { lucide: Network },
  browser: { brand: siGooglechrome, color: "#7BAAF7" },
  web: { brand: siReact, color: "#61DAFB" },
  databases: { brand: siPostgresql, color: "#7BA3E8" },
  tools: { brand: siDocker, color: "#4AA8F0" },
  "system-design": { lucide: Boxes },
  ml: { lucide: BrainCircuit },
  "ai-eng": { lucide: Bot },
  fintech: { lucide: Landmark },
};

export function TrackIcon({ id, color, className }: { id: string; color?: string; className?: string }) {
  const d = ICONS[id];
  if (!d) return <span className={cx("inline-block rounded-full", className)} style={{ background: color }} />;
  if ("lucide" in d) {
    const I = d.lucide;
    return <I className={className} style={{ color }} strokeWidth={1.8} aria-hidden />;
  }
  return (
    <svg viewBox="0 0 24 24" className={className} fill={d.color} aria-hidden>
      <path d={d.brand.path} />
    </svg>
  );
}
