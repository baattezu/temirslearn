import { Check, Eye, PenLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { CodeEditor } from "../../ui/CodeEditor";
import { Markdown } from "../../ui/Markdown";
import { Segmented } from "../../ui/Segmented";
import { Spinner } from "../../ui/misc";

export interface Note {
  id: string;
  lesson_id: string | null;
  title: string;
  body: string;
  created_at: number;
  updated_at: number;
}

type SaveState = "idle" | "saving" | "saved" | "error";

/** Markdown-заметка с автосохранением. Если note нет — создаётся при первом вводе. */
export function NoteEditor({
  note,
  lessonId,
  defaultTitle,
  onSaved,
  placeholder,
}: {
  note: Note | null;
  lessonId?: string | null;
  defaultTitle?: string;
  onSaved?: (n: Note) => void;
  placeholder?: string;
}) {
  const [body, setBody] = useState(note?.body ?? "");
  const [mode, setMode] = useState<"edit" | "view">("edit");
  const [state, setState] = useState<SaveState>("idle");
  const current = useRef<Note | null>(note);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(body);

  useEffect(() => {
    current.current = note;
    setBody(note?.body ?? "");
    latest.current = note?.body ?? "";
  }, [note?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const text = latest.current;
    setState("saving");
    try {
      if (!current.current) {
        if (!text.trim()) return setState("idle");
        const firstLine = text.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").slice(0, 80);
        const created = await api<Note>("/notes", {
          method: "POST",
          json: { lesson_id: lessonId ?? null, title: defaultTitle ?? firstLine ?? "Без названия", body: text },
        });
        current.current = created;
        onSaved?.(created);
      } else {
        const title = current.current.lesson_id ? undefined : text.split("\n").find((l) => l.trim())?.replace(/^#+\s*/, "").slice(0, 80);
        await api(`/notes/${current.current.id}`, { method: "PUT", json: { body: text, title } });
        onSaved?.({ ...current.current, body: text, title: title || current.current.title, updated_at: Date.now() });
      }
      setState("saved");
    } catch {
      setState("error");
    }
  };

  const onChange = (v: string) => {
    setBody(v);
    latest.current = v;
    clearTimeout(timer.current);
    timer.current = setTimeout(save, 700);
  };

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        if (latest.current !== (current.current?.body ?? "")) void save();
      }
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-2 flex items-center justify-between gap-2">
        <Segmented
          size="sm"
          value={mode}
          onChange={setMode}
          options={[
            { value: "edit", label: <><PenLine className="size-3.5" /> Писать</> },
            { value: "view", label: <><Eye className="size-3.5" /> Смотреть</> },
          ]}
        />
        <span className="flex items-center gap-1.5 text-[12px] text-mute">
          {state === "saving" && <><Spinner className="size-3" /> сохраняю</>}
          {state === "saved" && <><Check className="size-3.5 text-ok" /> сохранено</>}
          {state === "error" && <span className="text-bad">не сохранилось</span>}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-line bg-bg px-3">
        {mode === "edit" ? (
          <CodeEditor lang="markdown" value={body} onChange={onChange} placeholder={placeholder ?? "Markdown: # заголовок, **жирный**, `код`, $формулы$"} minHeight="240px" />
        ) : body.trim() ? (
          <Markdown className="py-3 text-[15px]">{body}</Markdown>
        ) : (
          <div className="py-6 text-center text-[13px] text-mute">Пусто</div>
        )}
      </div>
    </div>
  );
}
