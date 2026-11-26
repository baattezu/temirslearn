import { ArrowRight, ChevronRight, Mic } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { LANGS, LEVELS, ROLES, type Lang, type Level, type RoleId } from "../../../shared/interview";
import { PageHeader } from "../../app/Layout";
import { api } from "../../lib/api";
import { ago } from "../../lib/format";
import { useApi, useLocalStorage } from "../../lib/hooks";
import { Button } from "../../ui/Button";
import { Chip } from "../../ui/Chip";
import { Label } from "../../ui/Field";
import { Segmented } from "../../ui/Segmented";
import { Card, ErrorNote, SectionTitle } from "../../ui/misc";
import { cx } from "../../ui/cx";
import type { InterviewListItem } from "./types";

export const roleLabel = (id: RoleId) => ROLES.find((r) => r.id === id)?.label ?? id;

export function scoreTone(score: number, max = 100) {
  const p = score / max;
  return p >= 0.7 ? "text-ok" : p >= 0.5 ? "text-amber" : "text-bad";
}

export function InterviewHome() {
  const navigate = useNavigate();
  const [cfg, setCfg] = useLocalStorage<{ role: RoleId; level: Level; lang: Lang; count: number }>("tl.interview", {
    role: "backend-java",
    level: "middle",
    lang: "en",
    count: 5,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data: history } = useApi<InterviewListItem[]>("/interviews");

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>("/interviews", { method: "POST", json: cfg });
      navigate(`/interview/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const role = ROLES.find((r) => r.id === cfg.role)!;

  return (
    <div className="pb-12">
      <PageHeader title="Интервью" eyebrow="ИИ задаёт — ты отвечаешь голосом" />
      <div className="grid gap-8 px-5 pt-4 md:px-10 lg:grid-cols-[1fr_360px]">
        <Card className="p-5 md:p-6">
          <div className="grid gap-5">
            <div>
              <Label>Роль</Label>
              <div className="flex flex-wrap gap-2">
                {ROLES.map((r) => (
                  <Chip key={r.id} active={cfg.role === r.id} onClick={() => setCfg({ ...cfg, role: r.id })}>
                    {r.label}
                  </Chip>
                ))}
              </div>
              <p className="mt-2.5 text-[13px] leading-relaxed text-mute">{role.focus}</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-3">
              <div>
                <Label>Уровень</Label>
                <Segmented block value={cfg.level} onChange={(level) => setCfg({ ...cfg, level })} options={LEVELS.map((l) => ({ value: l.id, label: l.label }))} />
              </div>
              <div>
                <Label>Язык</Label>
                <Segmented block value={cfg.lang} onChange={(lang) => setCfg({ ...cfg, lang })} options={LANGS.map((l) => ({ value: l.id, label: l.id === "en" ? "EN" : "RU" }))} />
              </div>
              <div>
                <Label>Вопросов</Label>
                <Segmented block value={cfg.count} onChange={(count) => setCfg({ ...cfg, count })} options={[3, 5, 8].map((n) => ({ value: n, label: String(n) }))} />
              </div>
            </div>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button variant="primary" size="lg" onClick={start} loading={busy} icon={!busy && <Mic className="size-4" />} block>
              {busy ? "Готовлю вопросы…" : "Начать интервью"}
            </Button>
            <p className="-mt-2 text-center text-[12.5px] text-mute">
              Отвечай вслух — запись расшифруется в текст, ты сможешь поправить его перед оценкой.
            </p>
          </div>
        </Card>

        <section>
          <SectionTitle>История</SectionTitle>
          {!history?.length ? (
            <div className="rounded-2xl border border-dashed border-line px-5 py-8 text-center text-[13.5px] text-mute">
              Здесь будут прошлые интервью с баллами.
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line">
              {history.map((h, i) => (
                <Link
                  key={h.id}
                  to={`/interview/${h.id}`}
                  className={cx("flex items-center gap-3 bg-surface px-4 py-3 transition hover:bg-raised", i > 0 && "border-t border-line")}
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-medium text-ink">{roleLabel(h.role)}</div>
                    <div className="text-[12px] text-mute">
                      {h.level} · {h.lang.toUpperCase()} · {ago(h.created_at)}
                      {!h.finished_at && ` · ${h.answered}/${h.total}`}
                    </div>
                  </div>
                  {h.score !== null ? (
                    <span className={cx("font-mono text-[17px] font-semibold tabular-nums", scoreTone(h.score))}>{h.score}</span>
                  ) : (
                    <span className="flex items-center gap-1 text-[12px] text-blue">
                      продолжить <ArrowRight className="size-3" />
                    </span>
                  )}
                  <ChevronRight className="size-4 text-mute" />
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
