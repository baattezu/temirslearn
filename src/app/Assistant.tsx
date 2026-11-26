import { ArrowRight, ChevronLeft, ChevronRight, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation } from "react-router";
import { LESSONS, lessonById } from "../content/catalog";
import { TIPS, tipOfDay } from "../content/tips";
import { useIsPhone } from "../lib/hooks";
import { dueLessons, indexOf } from "../lib/mastery";
import { Toggle } from "../ui/Field";
import { cx } from "../ui/cx";
import { useData } from "./data";

// Помощник: пиксельный Темирхан в углу. Раз в день сам здоровается — что повторить, что дальше,
// совет дня. В остальное время по клику: подсказка к текущей странице и все советы по обучению.

const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);

/** Лицо-аватар: пиксель-арт с лендинга verylabs.dev. */
function Face({ size }: { size: number }) {
  return (
    <span
      className="pixel block overflow-hidden rounded-full border-2 border-line-strong bg-raised shadow-lg shadow-black/40"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <img src="/assistant/face.png" alt="" className="pixel size-full object-cover object-top" draggable={false} />
    </span>
  );
}

/** Подсказка к текущему экрану. */
function contextHint(path: string): string | null {
  if (path.startsWith("/l/")) return "Сначала ответь на вопросы «до чтения» — даже неправильно. Выделяй главное: выдели текст и выбери цвет. В конце — повтор и устный зачёт.";
  if (path.startsWith("/practice/")) return "Сначала прочитай «Как решать» и пройди пример у доски, угадывая каждый шаг. Свою задачу решай в тетради, а не в голове.";
  if (path.startsWith("/practice")) return "Тренажёр — это математика руками. Выбери тему из урока, который недавно прошёл.";
  if (path.startsWith("/t/")) return "Узел пути — это тема. Зелёный — свежо, жёлтый — пора повторить, серый — забывается. Цифра — сколько раз проходил.";
  if (path.startsWith("/review")) return "Отвечай честно: «С трудом» — тоже хороший ответ. Нечестное «Помню» отодвинет повтор, и тема забудется.";
  if (path.startsWith("/roadmaps")) return "Сегменты общие между профессиями: пройденная тема засчитывается везде, где встречается.";
  if (path.startsWith("/problems")) return "Сначала проговори подход вслух: перебор → оптимизация → сложность. Потом код.";
  if (path.startsWith("/interview")) return "Отвечай структурно: суть в одном предложении → как работает → компромиссы → пример из прода.";
  return null;
}

export function Assistant() {
  const data = useData();
  const phone = useIsPhone();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [tipIdx, setTipIdx] = useState(() => TIPS.indexOf(tipOfDay()));
  const conf = data.settings.assistant ?? {};

  // раз в день — приветствие (если не выключено)
  useEffect(() => {
    if (!data.settingsLoaded || conf.muted || conf.seen === today()) return;
    const t = setTimeout(() => {
      setOpen(true);
      void data.setSetting("assistant", { ...conf, seen: today() });
    }, 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conf.muted, conf.seen, data.settingsLoaded]);

  useEffect(() => setOpen(false), [pathname]);

  const due = useMemo(() => dueLessons(data), [data]);
  const idx = useMemo(() => Math.round(indexOf(LESSONS, data) * 100), [data]);
  const doing = Object.entries(data.progress)
    .filter(([, v]) => v.status === "doing")
    .sort((a, b) => b[1].at - a[1].at)
    .map(([id]) => lessonById(id))
    .find((l) => l?.ready);

  // где не мешать
  const hidden = conf.hidden || /^\/(interview\/|problems\/|settings)/.test(pathname);
  if (hidden) return null;

  const isRoot = ["/", "/roadmaps", "/tracks", "/problems", "/interview", "/notes"].includes(pathname);
  const bottom = phone ? (isRoot ? "calc(64px + env(safe-area-inset-bottom) + 10px)" : "calc(14px + env(safe-area-inset-bottom))") : "20px";
  const tip = TIPS[tipIdx];
  const hint = contextHint(pathname);

  return (
    <div className="fixed right-3 z-40 flex flex-col items-end md:right-5" style={{ bottom }}>
      {open && (
        <div
          className={cx(
            "anim-pop mb-2 overflow-hidden rounded-2xl border border-line-strong bg-raised shadow-2xl",
            phone ? "w-[calc(100vw-24px)]" : "w-[340px]",
          )}
          role="dialog"
          aria-label="Помощник"
        >
          <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
            <Face size={34} />
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-ink">Темирхан</div>
              <div className="text-[11.5px] text-mute">индекс понимания: <span className="font-mono text-dim">{idx}</span></div>
            </div>
            <button type="button" aria-label="Закрыть" onClick={() => setOpen(false)} className="flex size-8 items-center justify-center rounded-lg text-mute hover:bg-bg hover:text-ink">
              <X className="size-4" />
            </button>
          </div>

          <div className="max-h-[min(60dvh,520px)] overflow-y-auto p-3.5">
            {hint && <p className="mb-3 rounded-xl bg-bg/60 p-3 text-[13.5px] leading-relaxed text-dim">{hint}</p>}

            {(due.length > 0 || doing) && (
              <div className="mb-3 grid gap-2">
                {due.length > 0 && (
                  <Link to="/review" className="flex items-center gap-3 rounded-xl border border-amber/30 bg-amber/[0.07] p-3 hover:border-amber/50">
                    <span className="font-mono text-[20px] font-semibold text-amber">{due.length}</span>
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-dim">
                      {due.length === 1 ? "тема пожелтела" : "тем пожелтели"} — повтори, пока не забылось
                    </span>
                    <ArrowRight className="size-4 text-amber" />
                  </Link>
                )}
                {doing && (
                  <Link to={`/l/${doing.id}`} className="flex items-center gap-3 rounded-xl border border-line p-3 hover:border-line-strong">
                    <span className="min-w-0 flex-1 text-[13px] leading-snug text-dim">
                      Продолжить: <span className="text-ink">{doing.title}</span>
                    </span>
                    <ArrowRight className="size-4 text-mute" />
                  </Link>
                )}
              </div>
            )}

            <div className="rounded-xl border border-line p-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-accent">Как учиться · {tipIdx + 1}/{TIPS.length}</span>
                <span className="flex">
                  <button type="button" aria-label="Предыдущий совет" onClick={() => setTipIdx((i) => (i + TIPS.length - 1) % TIPS.length)} className="flex size-7 items-center justify-center rounded-lg text-mute hover:bg-bg hover:text-ink">
                    <ChevronLeft className="size-4" />
                  </button>
                  <button type="button" aria-label="Следующий совет" onClick={() => setTipIdx((i) => (i + 1) % TIPS.length)} className="flex size-7 items-center justify-center rounded-lg text-mute hover:bg-bg hover:text-ink">
                    <ChevronRight className="size-4" />
                  </button>
                </span>
              </div>
              <div className="text-[14.5px] font-semibold leading-snug text-ink">{tip.title}</div>
              <p className="mt-1.5 text-[13px] leading-relaxed text-dim">{tip.text}</p>
              <p className="mt-2 text-[13px] leading-relaxed text-mute">
                <span className="text-dim">Здесь:</span> {tip.how}
              </p>
              {tip.link && (
                <Link to={tip.link.to} className="mt-2 inline-flex items-center gap-1 text-[13px] text-accent hover:underline">
                  {tip.link.label} <ArrowRight className="size-3.5" />
                </Link>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <Toggle checked={!conf.muted} onChange={(v) => void data.setSetting("assistant", { ...conf, muted: !v })} label="Здороваться раз в день" />
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label={open ? "Скрыть помощника" : "Помощник: советы и что повторить"}
        onClick={() => setOpen((o) => !o)}
        className="group relative flex items-end justify-center"
      >
        {!open && due.length > 0 && (
          <span className="absolute -left-1 top-0 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-amber px-1 font-mono text-[11px] font-bold text-bg">
            {due.length}
          </span>
        )}
        <span className="relative transition duration-200 group-hover:-translate-y-0.5 group-active:scale-95">
          <Face size={phone ? 46 : 54} />
        </span>
      </button>
    </div>
  );
}
