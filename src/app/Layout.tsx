import { BookOpen, ChevronDown, Settings, ChevronLeft, Code2, House, LogOut, Map as MapIcon, Mic, NotebookPen, PencilRuler, Repeat } from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router";
import { GROUPS, trackById } from "../content/catalog";
import { dueLessons, heatColor, heatOpacity, indexOf, masteryOf } from "../lib/mastery";
import { TrackIcon } from "../ui/TrackIcon";
import { Assistant } from "./Assistant";
import { api } from "../lib/api";
import { useIsPhone, useLocalStorage } from "../lib/hooks";
import { cx } from "../ui/cx";
import { IconButton } from "../ui/Button";
import { useData } from "./data";

const NAV = [
  { to: "/", label: "Главная", icon: House, end: true },
  { to: "/roadmaps", label: "Роадмап", icon: MapIcon },
  { to: "/tracks", label: "Треки", icon: BookOpen },
  { to: "/problems", label: "Задачи", icon: Code2 },
  { to: "/interview", label: "Интервью", icon: Mic },
  { to: "/notes", label: "Заметки", icon: NotebookPen },
];
const ROOTS = new Set(NAV.map((n) => n.to));

export function Layout() {
  const phone = useIsPhone();
  const { settings } = useData();
  useEffect(() => {
    document.documentElement.classList.toggle("reduce-motion", !!settings.reduceMotion);
  }, [settings.reduceMotion]);
  const { pathname } = useLocation();
  const isRoot = ROOTS.has(pathname);

  return (
    <div className="min-h-dvh">
      <ScrollRestoration />
      {!phone && <Sidebar />}
      <main className={cx(!phone && "pl-[248px]", phone && isRoot && "pb-[calc(64px+env(safe-area-inset-bottom))]")}>
        <Outlet />
      </main>
      {phone && isRoot && <TabBar />}
      <Assistant />
    </div>
  );
}

function Sidebar() {
  const data = useData();
  const due = useMemo(() => dueLessons(data).length, [data]);
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    location.reload();
  };
  return (
    <aside className="fixed inset-y-0 left-0 flex w-[248px] flex-col border-r border-line bg-surface/60">
      <Link to="/" className="flex h-16 shrink-0 items-center gap-2.5 px-5">
        <img src="/favicon.svg" alt="" className="size-7" />
        <span className="font-mono text-[13px] font-semibold tracking-[0.16em] text-ink">TEMIRSLEARN</span>
      </Link>
      <nav className="grid gap-0.5 px-3">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                "flex h-9 items-center gap-3 rounded-lg px-2.5 text-[14px] transition",
                isActive ? "bg-raised font-medium text-ink" : "text-dim hover:bg-raised/60 hover:text-ink",
              )
            }
          >
            <Icon className="size-[18px]" strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </nav>
      <nav className="mt-1 grid gap-0.5 px-3">
        <SideLink to="/review" icon={<Repeat className="size-[18px]" strokeWidth={1.8} />} label="Повторение" badge={due || undefined} />
        <SideLink to="/practice" icon={<PencilRuler className="size-[18px]" strokeWidth={1.8} />} label="Тренажёр" />
      </nav>
      <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        {GROUPS.map((g) => (
          <SideGroup key={g.id} id={g.id} title={g.title} trackIds={g.tracks} />
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-line px-3 py-2.5">
        <NavLink
          to="/settings"
          className={({ isActive }) => cx("flex h-9 items-center gap-2.5 rounded-lg px-2 text-[13.5px] transition", isActive ? "bg-raised text-ink" : "text-dim hover:bg-raised/60 hover:text-ink")}
        >
          <img src="/assistant/face.png" alt="" className="pixel size-6 rounded-full border border-line object-cover object-top" />
          Настройки
          <Settings className="size-3.5 text-mute" />
        </NavLink>
        <IconButton label="Выйти" onClick={logout}>
          <LogOut className="size-4" />
        </IconButton>
      </div>
    </aside>
  );
}

function SideLink({ to, icon, label, badge }: { to: string; icon: ReactNode; label: string; badge?: number }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cx(
          "flex h-9 items-center gap-3 rounded-lg px-2.5 text-[14px] transition",
          isActive ? "bg-raised font-medium text-ink" : "text-dim hover:bg-raised/60 hover:text-ink",
        )
      }
    >
      {icon}
      {label}
      {badge !== undefined && (
        <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1 font-mono text-[11px] font-bold text-bg">{badge}</span>
      )}
    </NavLink>
  );
}

/** Группа треков в сайдбаре: сворачивается, у каждого трека иконка и полоска свежести. */
function SideGroup({ id, title, trackIds }: { id: string; title: string; trackIds: string[] }) {
  const data = useData();
  const { pathname } = useLocation();
  const [collapsed, setCollapsed] = useLocalStorage<Record<string, boolean>>("tl.sidebar.collapsed", {});
  const tracks = trackIds.map(trackById).filter((t) => !!t);
  const activeInside = tracks.some((t) => pathname === `/t/${t.id}` || pathname.startsWith(`/l/${t.id}/`));
  const isCollapsed = collapsed[id] && !activeInside;
  const groupIdx = Math.round(indexOf(tracks.flatMap((t) => t.lessons), data) * 100);
  return (
    <div className="mb-1">
      <button
        type="button"
        onClick={() => setCollapsed({ ...collapsed, [id]: !collapsed[id] })}
        className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-mute hover:text-dim"
      >
        <ChevronDown className={cx("size-3 transition", isCollapsed && "-rotate-90")} />
        <span className="truncate">{title}</span>
        {groupIdx > 0 && <span className="ml-auto tabular-nums">{groupIdx}</span>}
      </button>
      {!isCollapsed &&
        tracks.map((t) => {
          const ready = t.lessons.filter((l) => l.ready);
          return (
            <NavLink
              key={t.id}
              to={`/t/${t.id}`}
              className={({ isActive }) =>
                cx(
                  "group flex min-h-8 items-center gap-2.5 rounded-lg px-2.5 py-1 text-[13px] transition",
                  isActive ? "bg-raised text-ink" : "text-dim hover:bg-raised/60 hover:text-ink",
                )
              }
            >
              <TrackIcon id={t.id} color={ready.length ? t.color : "var(--color-mute)"} className="size-4 shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{t.title}</span>
                {ready.some((l) => data.reviews[l.id]) && (
                  <span className="mt-0.5 flex gap-[2px]">
                    {t.lessons.map((l) => {
                      const m = masteryOf(l.id, data);
                      return (
                        <span
                          key={l.id}
                          className="h-[3px] flex-1 rounded-full"
                          style={{ background: m.heat === "none" ? "var(--color-line)" : heatColor(m), opacity: m.heat === "none" ? 1 : heatOpacity(m) }}
                        />
                      );
                    })}
                  </span>
                )}
              </span>
              {!ready.length && <span className="font-mono text-[10px] uppercase text-mute">скоро</span>}
            </NavLink>
          );
        })}
    </div>
  );
}

function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="grid h-16 grid-cols-6">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx("flex flex-col items-center justify-center gap-1 text-[10.5px] transition", isActive ? "text-accent" : "text-mute")
            }
          >
            <Icon className="size-[22px]" strokeWidth={1.8} />
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

/**
 * Шапка страницы. На телефоне внутренние страницы получают компактную панель с «назад»
 * вместо таб-бара; на десктопе — обычный заголовок.
 */
export function PageHeader({
  title,
  eyebrow,
  back,
  actions,
  children,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  back?: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const phone = useIsPhone();
  const navigate = useNavigate();
  if (phone && back) {
    return (
      <header className="sticky top-0 z-30 flex h-14 items-center gap-1 border-b border-line bg-bg/90 px-2 backdrop-blur-xl">
        <IconButton label="Назад" onClick={() => (history.length > 1 ? navigate(-1) : navigate(back))}>
          <ChevronLeft className="size-6" />
        </IconButton>
        <div className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink">{title}</div>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </header>
    );
  }
  return (
    <header className="px-5 pb-2 pt-6 md:px-10 md:pt-10">
      {eyebrow && <div className="mb-1.5 font-mono text-[11.5px] uppercase tracking-[0.14em] text-mute">{eyebrow}</div>}
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-ink md:text-[30px]">{title}</h1>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </header>
  );
}
