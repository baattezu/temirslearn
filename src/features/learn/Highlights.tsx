import { Eraser } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { api } from "../../lib/api";
import { useIsPhone } from "../../lib/hooks";
import { cx } from "../../ui/cx";

// Выделения в уроке. Храним не позицию, а сам текст + 32 символа до и после (как W3C Web Annotation):
// урок можно править, выделение найдётся заново. Рисуем через CSS Custom Highlight API —
// DOM урока не меняется, React и виджеты ничего не замечают.

export const HL_COLORS = [
  { id: "yellow", label: "Жёлтый", css: "rgb(255 214 10)" },
  { id: "green", label: "Зелёный", css: "rgb(111 220 140)" },
  { id: "blue", label: "Синий", css: "rgb(106 167 255)" },
  { id: "pink", label: "Розовый", css: "rgb(255 122 144)" },
] as const;
type Color = (typeof HL_COLORS)[number]["id"];

interface Hl {
  id: string;
  lesson_id: string;
  color: Color;
  quote: string;
  prefix: string;
  suffix: string;
}

const CTX = 32;
const supported = typeof CSS !== "undefined" && "highlights" in CSS;

/** Текст статьи без виджетов/квизов (.not-prose) и карта «смещение → текстовый узел». */
function textIndex(root: HTMLElement) {
  const nodes: { node: Text; start: number }[] = [];
  let text = "";
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => ((n.parentElement?.closest(".not-prose, .katex-mathml") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)),
  });
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    nodes.push({ node: n as Text, start: text.length });
    text += (n as Text).data;
  }
  return { nodes, text };
}

function locate(nodes: { node: Text; start: number }[], offset: number) {
  let lo = 0;
  let hi = nodes.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (nodes[mid].start <= offset) lo = mid;
    else hi = mid - 1;
  }
  const n = nodes[lo];
  return { node: n.node, off: Math.min(offset - n.start, n.node.data.length) };
}

function offsetOf(nodes: { node: Text; start: number }[], node: Node, off: number): number | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const n = nodes.find((x) => x.node === node);
    return n ? n.start + off : null;
  }
  // граница внутри элемента: берём ближайший текстовый узел после неё
  const child = node.childNodes[off];
  const after = nodes.find((x) => (child ? child === x.node || child.contains(x.node) || !!(child.compareDocumentPosition(x.node) & Node.DOCUMENT_POSITION_FOLLOWING) : false));
  return after ? after.start : null;
}

function find(text: string, h: Hl): [number, number] | null {
  const full = h.prefix + h.quote + h.suffix;
  let i = text.indexOf(full);
  if (i >= 0) return [i + h.prefix.length, i + h.prefix.length + h.quote.length];
  i = text.indexOf(h.quote);
  return i >= 0 ? [i, i + h.quote.length] : null;
}

type Bar = { x: number; y: number; mode: "new"; start: number; end: number } | { x: number; y: number; mode: "edit"; hl: Hl };

export function useHighlights(articleRef: RefObject<HTMLElement | null>, lessonId: string, ready: boolean) {
  const [items, setItems] = useState<Hl[]>([]);
  const [bar, setBar] = useState<Bar | null>(null);
  const spans = useRef<{ hl: Hl; start: number; end: number }[]>([]);
  const phone = useIsPhone();

  useEffect(() => {
    setItems([]);
    api<Hl[]>(`/highlights?lesson=${encodeURIComponent(lessonId)}`).then(setItems).catch(() => {});
  }, [lessonId]);

  // рисуем
  useLayoutEffect(() => {
    if (!supported || !ready) return;
    const root = articleRef.current;
    if (!root) return;
    const paint = () => {
      const { nodes, text } = textIndex(root);
      if (!nodes.length) return;
      const byColor: Record<string, Range[]> = {};
      spans.current = [];
      for (const h of items) {
        const at = find(text, h);
        if (!at) continue;
        spans.current.push({ hl: h, start: at[0], end: at[1] });
        const a = locate(nodes, at[0]);
        const b = locate(nodes, at[1]);
        const r = document.createRange();
        r.setStart(a.node, a.off);
        r.setEnd(b.node, b.off);
        (byColor[h.color] ??= []).push(r);
      }
      for (const c of HL_COLORS) {
        const rs = byColor[c.id];
        if (rs?.length) CSS.highlights.set(`hl-${c.id}`, new Highlight(...rs));
        else CSS.highlights.delete(`hl-${c.id}`);
      }
    };
    paint();
    // MDX-контент может догрузиться (картинки, ленивые виджеты) — перерисуем один раз позже
    const t = setTimeout(paint, 400);
    return () => {
      clearTimeout(t);
      for (const c of HL_COLORS) CSS.highlights.delete(`hl-${c.id}`);
    };
  }, [items, ready, articleRef]);

  // выделили текст → панель
  useEffect(() => {
    if (!supported) return;
    const root = articleRef.current;
    if (!root) return;
    let timer: ReturnType<typeof setTimeout>;
    const onSel = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const sel = document.getSelection();
        if (!sel || sel.isCollapsed || !sel.rangeCount) {
          setBar((b) => (b?.mode === "new" ? null : b));
          return;
        }
        const r = sel.getRangeAt(0);
        if (!root.contains(r.commonAncestorContainer)) return;
        const anc = r.commonAncestorContainer instanceof Element ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement;
        if (anc?.closest(".not-prose")) return;
        const { nodes } = textIndex(root);
        const s = offsetOf(nodes, r.startContainer, r.startOffset);
        const e = offsetOf(nodes, r.endContainer, r.endOffset);
        if (s === null || e === null || e - s < 2) return;
        const rect = r.getBoundingClientRect();
        setBar({ mode: "new", start: s, end: e, x: rect.left + rect.width / 2, y: rect.top });
      }, phone ? 250 : 60);
    };
    document.addEventListener("selectionchange", onSel);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("selectionchange", onSel);
    };
  }, [articleRef, phone, ready]);

  // клик по выделению → сменить цвет / стереть
  useEffect(() => {
    if (!supported) return;
    const root = articleRef.current;
    if (!root) return;
    const onClick = (ev: MouseEvent) => {
      const sel = document.getSelection();
      if (sel && !sel.isCollapsed) return;
      const doc = document as Document & { caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null };
      let node: Node | null = null;
      let off = 0;
      if (doc.caretPositionFromPoint) {
        const p = doc.caretPositionFromPoint(ev.clientX, ev.clientY);
        if (p) [node, off] = [p.offsetNode, p.offset];
      } else if (document.caretRangeFromPoint) {
        const r = document.caretRangeFromPoint(ev.clientX, ev.clientY);
        if (r) [node, off] = [r.startContainer, r.startOffset];
      }
      if (!node || !root.contains(node)) return;
      const { nodes } = textIndex(root);
      const o = offsetOf(nodes, node, off);
      if (o === null) return;
      const hit = spans.current.find((s) => o >= s.start && o <= s.end);
      if (hit) setBar({ mode: "edit", hl: hit.hl, x: ev.clientX, y: ev.clientY - 12 });
      else setBar((b) => (b?.mode === "edit" ? null : b));
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [articleRef, ready]);

  // прокрутка — панель прячется (она привязана к экранным координатам)
  useEffect(() => {
    if (!bar || phone) return;
    const off = () => setBar(null);
    window.addEventListener("scroll", off, { passive: true, once: true });
    return () => window.removeEventListener("scroll", off);
  }, [bar, phone]);

  const add = useCallback(
    async (color: Color) => {
      if (!bar || bar.mode !== "new") return;
      const root = articleRef.current!;
      const { text } = textIndex(root);
      const quote = text.slice(bar.start, bar.end);
      if (!quote.trim()) return;
      // новое выделение заменяет пересекающиеся старые
      const overlapped = spans.current.filter((s) => s.start < bar.end && s.end > bar.start).map((s) => s.hl.id);
      setBar(null);
      document.getSelection()?.removeAllRanges();
      const row = await api<Hl>("/highlights", {
        method: "POST",
        json: { lesson_id: lessonId, color, quote, prefix: text.slice(Math.max(0, bar.start - CTX), bar.start), suffix: text.slice(bar.end, bar.end + CTX) },
      });
      await Promise.all(overlapped.map((id) => api(`/highlights/${id}`, { method: "DELETE" })));
      setItems((xs) => [...xs.filter((x) => !overlapped.includes(x.id)), row]);
    },
    [bar, articleRef, lessonId],
  );

  const recolor = useCallback(
    async (color: Color) => {
      if (!bar || bar.mode !== "edit") return;
      const id = bar.hl.id;
      setBar(null);
      setItems((xs) => xs.map((x) => (x.id === id ? { ...x, color } : x)));
      await api(`/highlights/${id}`, { method: "PUT", json: { color } });
    },
    [bar],
  );

  const remove = useCallback(async () => {
    if (!bar) return;
    if (bar.mode === "edit") {
      const id = bar.hl.id;
      setItems((xs) => xs.filter((x) => x.id !== id));
      setBar(null);
      await api(`/highlights/${id}`, { method: "DELETE" });
      return;
    }
    // «стереть» на новом выделении — убрать всё, что под ним
    const ids = spans.current.filter((s) => s.start < bar.end && s.end > bar.start).map((s) => s.hl.id);
    setItems((xs) => xs.filter((x) => !ids.includes(x.id)));
    setBar(null);
    document.getSelection()?.removeAllRanges();
    await Promise.all(ids.map((id) => api(`/highlights/${id}`, { method: "DELETE" })));
  }, [bar]);

  const overlapsExisting = bar?.mode === "new" && spans.current.some((s) => s.start < bar.end && s.end > bar.start);

  const toolbar =
    bar && supported
      ? createPortal(
          <div
            className={cx(
              "anim-pop z-50 flex items-center gap-1 rounded-2xl border border-line-strong bg-raised p-1.5 shadow-2xl",
              phone ? "fixed inset-x-4 bottom-[calc(16px+env(safe-area-inset-bottom))] justify-center" : "fixed -translate-x-1/2 -translate-y-full",
            )}
            style={phone ? undefined : { left: Math.max(90, Math.min(window.innerWidth - 90, bar.x)), top: Math.max(8, bar.y - 8) }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {HL_COLORS.map((c) => (
              <button
                key={c.id}
                type="button"
                aria-label={c.label}
                onClick={() => (bar.mode === "new" ? add(c.id) : recolor(c.id))}
                className={cx(
                  "flex size-10 items-center justify-center rounded-xl transition hover:bg-bg",
                  bar.mode === "edit" && bar.hl.color === c.id && "bg-bg",
                )}
              >
                <span className="size-5 rounded-full" style={{ background: c.css }} />
              </button>
            ))}
            {(bar.mode === "edit" || overlapsExisting) && (
              <>
                <span className="mx-0.5 h-6 w-px bg-line" />
                <button type="button" aria-label="Убрать выделение" onClick={remove} className="flex h-10 items-center gap-1.5 rounded-xl px-2.5 text-[13px] text-dim hover:bg-bg hover:text-ink">
                  <Eraser className="size-4" /> {phone && "Убрать"}
                </button>
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return { toolbar, count: items.length };
}
