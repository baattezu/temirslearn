import { BookOpen, Plus, Search, Trash2 } from "lucide-react";
import { ListSkeleton } from "../../ui/Skeleton";
import { useMemo, useState } from "react";
import { Link } from "react-router";
import { PageHeader } from "../../app/Layout";
import { lessonById } from "../../content/catalog";
import { api } from "../../lib/api";
import { ago } from "../../lib/format";
import { useApi, useIsPhone } from "../../lib/hooks";
import { Button, IconButton } from "../../ui/Button";
import { Input } from "../../ui/Field";
import { Sheet } from "../../ui/Sheet";
import { Empty } from "../../ui/misc";
import { cx } from "../../ui/cx";
import { NoteEditor, type Note } from "./NoteEditor";

export function NotesPage() {
  const phone = useIsPhone();
  const [q, setQ] = useState("");
  const { data, setData, loading } = useApi<Note[]>("/notes");
  const [openId, setOpenId] = useState<string | "new" | null>(null);

  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return (data ?? []).filter((n) => !s || n.title.toLowerCase().includes(s) || n.body.toLowerCase().includes(s));
  }, [data, q]);
  const open = openId && openId !== "new" ? (data ?? []).find((n) => n.id === openId) ?? null : null;

  const upsert = (n: Note) =>
    setData((prev) => {
      const rest = (prev ?? []).filter((x) => x.id !== n.id);
      return [n, ...rest].sort((a, b) => b.updated_at - a.updated_at);
    });

  const remove = async (id: string) => {
    await api(`/notes/${id}`, { method: "DELETE" });
    setData((prev) => (prev ?? []).filter((n) => n.id !== id));
    setOpenId(null);
  };

  const editor = (
    <NoteEditor
      key={openId ?? "none"}
      note={open}
      onSaved={(n) => {
        upsert(n);
        if (openId === "new") setOpenId(n.id);
      }}
      placeholder="# Заголовок&#10;&#10;Свободная заметка в markdown…"
    />
  );

  return (
    <div className="pb-12">
      <PageHeader
        title="Заметки"
        eyebrow="Вместо Obsidian"
        actions={
          <Button variant="primary" size={phone ? "sm" : "md"} icon={<Plus className="size-4" />} onClick={() => setOpenId("new")}>
            Новая
          </Button>
        }
      />
      <div className={cx("px-5 pt-3 md:px-10", !phone && openId && "grid grid-cols-[minmax(280px,380px)_1fr] gap-6")}>
        <div>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-mute" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по заметкам" className="pl-10" />
          </div>
          {loading && !data ? (
            <ListSkeleton rows={5} height={64} />
          ) : !list.length ? (
            <Empty title={q ? "Ничего не нашлось" : "Заметок пока нет"}>
              Конспекты уроков появляются здесь сами. Свободную заметку создай кнопкой «Новая».
            </Empty>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-line">
              {list.map((n, i) => {
                const lesson = n.lesson_id ? lessonById(n.lesson_id) : undefined;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setOpenId(n.id)}
                    className={cx(
                      "block w-full bg-surface px-4 py-3 text-left transition hover:bg-raised",
                      i > 0 && "border-t border-line",
                      openId === n.id && "bg-raised",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-ink">{n.title}</span>
                      <span className="shrink-0 text-[11.5px] text-mute">{ago(n.updated_at)}</span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-mute">
                      {lesson && <span className="mr-1.5 text-blue">{lesson.title} ·</span>}
                      {n.body.replace(/[#*`>$_-]/g, "").slice(0, 160) || "пусто"}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {!phone && openId && (
          <div className="flex h-[calc(100dvh-140px)] flex-col">
            <div className="mb-2 flex items-center gap-2">
              {open?.lesson_id && lessonById(open.lesson_id) && (
                <Link to={`/l/${open.lesson_id}`} className="flex items-center gap-1.5 text-[13px] text-blue hover:underline">
                  <BookOpen className="size-3.5" /> {lessonById(open.lesson_id)!.title}
                </Link>
              )}
              <div className="ml-auto flex items-center">
                {open && (
                  <IconButton label="Удалить" onClick={() => remove(open.id)}>
                    <Trash2 className="size-4" />
                  </IconButton>
                )}
                <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}>
                  Закрыть
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1">{editor}</div>
          </div>
        )}
      </div>

      {phone && (
        <Sheet
          open={!!openId}
          onClose={() => setOpenId(null)}
          title={open?.title ?? "Новая заметка"}
          tall
          footer={
            open ? (
              <Button variant="danger" size="sm" icon={<Trash2 className="size-4" />} onClick={() => remove(open.id)}>
                Удалить
              </Button>
            ) : undefined
          }
        >
          <div className="flex h-full flex-col pt-1">{editor}</div>
        </Sheet>
      )}
    </div>
  );
}
