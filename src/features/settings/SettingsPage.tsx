import { Bot, BookOpen, Briefcase, Code2, Download, Gauge, LogOut, Mic, Repeat, Sparkles, Target, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { LANGS, LEVELS, type Lang, type Level, type RoleId } from "../../../shared/interview";
import { SRS_MODES, type SrsMode } from "../../../shared/srs";
import { PageHeader } from "../../app/Layout";
import { useData } from "../../app/data";
import { PROFESSIONS } from "../../content/roadmaps";
import { api } from "../../lib/api";
import { useLocalStorage } from "../../lib/hooks";
import type { Lang as CodeLang } from "../../problems";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { Toggle } from "../../ui/Field";
import { Segmented } from "../../ui/Segmented";
import { usePrimaryProfession } from "../roadmap/Roadmap";
import { LevelIcon } from "../interview/roleIcons";

function Section({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4 sm:p-5">
      <h2 className="mb-4 flex items-center gap-2 text-[15px] font-semibold text-ink">
        <Icon className="size-[18px] text-accent" strokeWidth={1.8} /> {title}
      </h2>
      <div className="grid gap-5">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[13.5px] font-medium text-dim">{label}</div>
      {children}
      {hint && <div className="mt-2 text-[12.5px] leading-snug text-mute">{hint}</div>}
    </div>
  );
}

export function SettingsPage() {
  const { settings, setSetting, mode } = useData();
  const [primary, setPrimary] = usePrimaryProfession();
  const [codeLang, setCodeLang] = useLocalStorage<CodeLang>("tl.lang", "python");
  const [iv, setIv] = useLocalStorage<{ role: RoleId; level: Level; lang: Lang; count: number }>("tl.interview", {
    role: "backend-java",
    level: "middle",
    lang: "en",
    count: 5,
  });
  const assistant = settings.assistant ?? {};
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    location.href = "/";
  };

  return (
    <div className="pb-16">
      <PageHeader title="Настройки" eyebrow="temirslearn" back="/" />
      <div className="grid max-w-3xl gap-4 px-5 pt-4 md:px-10">
        <Section icon={Briefcase} title="Профиль">
          <Row label="Основная профессия" hint="От неё зависят «следующий урок» на главной, индекс понимания и порядок роадмапов.">
            <div className="flex flex-wrap gap-2">
              {PROFESSIONS.map((p) => (
                <Chip
                  key={p.id}
                  active={primary === p.id}
                  onClick={() => setPrimary(p.id)}
                  icon={<span className="size-2 rounded-full" style={{ background: p.color }} />}
                >
                  {p.title}
                </Chip>
              ))}
            </div>
          </Row>
        </Section>

        <Section icon={Repeat} title="Повторения">
          <Row label="Режим интервалов" hint={SRS_MODES.find((m) => m.id === mode)?.about}>
            <Segmented<SrsMode> block value={mode} onChange={(v) => void setSetting("srsMode", v)} options={SRS_MODES.map((m) => ({ value: m.id, label: m.short }))} />
          </Row>
          <Row label="Цель на день" hint="Уроков, повторов, задач и интервью — всё, что попадает в календарь активности.">
            <Segmented<number>
              block
              value={settings.dailyGoal ?? 3}
              onChange={(v) => void setSetting("dailyGoal", v)}
              options={[1, 3, 5, 8].map((n) => ({ value: n, label: <span className="flex items-center justify-center gap-1.5"><Target className="size-3.5" />{n}</span> }))}
            />
          </Row>
        </Section>

        <Section icon={BookOpen} title="Уроки">
          <Row label="Размер текста">
            <Segmented
              block
              value={settings.lessonFont ?? "m"}
              onChange={(v) => void setSetting("lessonFont", v)}
              options={[
                { value: "s", label: <span className="text-[12.5px]">Мельче</span> },
                { value: "m", label: <span className="text-[14px]">Обычный</span> },
                { value: "l", label: <span className="text-[16px]">Крупнее</span> },
              ]}
            />
          </Row>
          <Toggle checked={settings.preQuestions ?? true} onChange={(v) => void setSetting("preQuestions", v)} label="Показывать вопросы «до чтения» в начале урока" />
        </Section>

        <Section icon={Code2} title="Задачи">
          <Row label="Язык по умолчанию">
            <Segmented<CodeLang>
              block
              value={codeLang}
              onChange={setCodeLang}
              options={[
                { value: "python", label: "Python" },
                { value: "javascript", label: "JavaScript" },
              ]}
            />
          </Row>
        </Section>

        <Section icon={Mic} title="Интервью по умолчанию">
          <div className="grid gap-5 sm:grid-cols-2">
            <Row label="Уровень">
              <Segmented
                block
                value={iv.level}
                onChange={(level) => setIv({ ...iv, level })}
                options={LEVELS.map((l) => ({ value: l.id, label: <span className="flex items-center justify-center gap-1.5"><LevelIcon level={l.id} className="size-3.5" />{l.label}</span> }))}
              />
            </Row>
            <Row label="Язык">
              <Segmented block value={iv.lang} onChange={(lang) => setIv({ ...iv, lang })} options={LANGS.map((l) => ({ value: l.id, label: l.id === "en" ? "English" : "Русский" }))} />
            </Row>
          </div>
        </Section>

        <Section icon={Bot} title="Помощник">
          <Toggle checked={!assistant.hidden} onChange={(v) => void setSetting("assistant", { ...assistant, hidden: !v })} label="Показывать помощника в углу" />
          <Toggle checked={!assistant.muted} onChange={(v) => void setSetting("assistant", { ...assistant, muted: !v })} label="Здороваться раз в день" />
        </Section>

        <Section icon={Sparkles} title="Интерфейс">
          <Toggle checked={!!settings.reduceMotion} onChange={(v) => void setSetting("reduceMotion", v)} label="Меньше анимаций" />
        </Section>

        <Section icon={Gauge} title="Данные">
          <div className="flex flex-wrap gap-2">
            <a href="/api/export" className="inline-flex h-10 items-center gap-2 rounded-xl border border-line bg-raised px-4 text-sm text-ink hover:border-line-strong">
              <Download className="size-4" /> Скачать всё (JSON)
            </a>
            <Button variant="danger" icon={<LogOut className="size-4" />} onClick={logout}>
              Выйти
            </Button>
          </div>
          <p className="-mt-2 text-[12.5px] text-mute">Прогресс, повторения, заметки, выделения, решения задач и интервью — в одном файле.</p>
        </Section>
      </div>
    </div>
  );
}
