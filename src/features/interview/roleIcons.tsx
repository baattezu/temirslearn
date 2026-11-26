import { Binary, Bot, BrainCircuit, Boxes, CircuitBoard, Mountain, Server, Sprout, TreeDeciduous, Users } from "lucide-react";
import type { Level, RoleId } from "../../../shared/interview";
import { TrackIcon } from "../../ui/TrackIcon";
import { cx } from "../../ui/cx";

/** Иконка роли интервью: логотип стека, где он есть, иначе Lucide. */
export function RoleIcon({ role, className }: { role: RoleId; className?: string }) {
  const c = cx("size-4 shrink-0", className);
  switch (role) {
    case "backend-java":
      return <TrackIcon id="java" className={c} />;
    case "backend-python":
      return <TrackIcon id="python" className={c} />;
    case "frontend":
      return <TrackIcon id="web" className={c} />;
    case "devops":
      return <Server className={c} style={{ color: "var(--color-teal)" }} />;
    case "ai-swe":
      return <Bot className={c} style={{ color: "var(--color-teal)" }} />;
    case "ai-research":
      return <BrainCircuit className={c} style={{ color: "var(--color-violet)" }} />;
    case "embedded":
      return <CircuitBoard className={c} style={{ color: "var(--color-amber)" }} />;
    case "system-design":
      return <Boxes className={c} style={{ color: "var(--color-rose)" }} />;
    case "dsa":
      return <Binary className={c} style={{ color: "var(--color-accent)" }} />;
    case "behavioral":
      return <Users className={c} style={{ color: "var(--color-blue)" }} />;
  }
}

export function LevelIcon({ level, className }: { level: Level; className?: string }) {
  const c = cx("size-4 shrink-0", className);
  if (level === "junior") return <Sprout className={c} />;
  if (level === "middle") return <TreeDeciduous className={c} />;
  return <Mountain className={c} />;
}
