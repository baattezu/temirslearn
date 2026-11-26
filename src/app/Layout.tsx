import { BookOpen, ChevronLeft, Code2, House, LogOut, Mic, NotebookPen } from "lucide-react";
import type { ReactNode } from "react";
import { Link, NavLink, Outlet, ScrollRestoration, useLocation, useNavigate } from "react-router";
import { TRACKS } from "../content/catalog";
import { api } from "../lib/api";
import { useIsPhone } from "../lib/hooks";
import { cx } from "../ui/cx";
import { IconButton } from "../ui/Button";
import { useData } from "./data";

const NAV = [
  { to: "/", label: "Главная", icon: House, end: true },
  { to: "/tracks", label: "Треки", icon: BookOpen },
  { to: "/problems", label: "Задачи", icon: Code2 },
  { to: "/interview", label: "Интервью", icon: Mic },
  { to: "/notes", label: "Заметки", icon: NotebookPen },
];
const ROOTS = new Set(NAV.map((n) => n.to));

export function Layout() {
  const phone = useIsPhone();
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
    </div>
  );
}

function Sidebar() {
  const { progress } = useData();
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
      <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
        <div className="mb-1.5 px-2.5 font-mono text-[11px] uppercase tracking-[0.12em] text-mute">Треки</div>
        {TRACKS.map((t) => {
          const ready = t.lessons.filter((l) => l.ready).length;
          const done = t.lessons.filter((l) => progress[l.id]?.status === "done").length;
          return (
            <NavLink
              key={t.id}
              to={`/t/${t.id}`}
              className={({ isActive }) =>
                cx(
                  "flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-[13px] transition",
                  isActive ? "bg-raised text-ink" : "text-dim hover:bg-raised/60 hover:text-ink",
                )
              }
            >
              <span className="size-1.5 shrink-0 rounded-full" style={{ background: ready ? t.color : "var(--color-line-strong)" }} />
              <span className="truncate">{t.title}</span>
              {done > 0 && <span className="ml-auto font-mono text-[11px] text-mute">{done}/{t.lessons.length}</span>}
            </NavLink>
          );
        })}
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-3">
        <span className="text-[13px] text-mute">temir</span>
        <IconButton label="Выйти" onClick={logout}>
          <LogOut className="size-4" />
        </IconButton>
      </div>
    </aside>
  );
}

function TabBar() {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl">
      <div className="grid h-16 grid-cols-5">
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
