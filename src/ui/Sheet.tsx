import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useIsPhone } from "../lib/hooks";
import { cx } from "./cx";
import { IconButton } from "./Button";

/**
 * Диалог: на телефоне — нижний лист (bottom sheet), на десктопе — панель справа.
 * Единственный вид модальных окон в приложении.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
  footer,
  tall,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  tall?: boolean;
}) {
  const phone = useIsPhone();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="anim-fade absolute inset-0 bg-black/60 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal
        className={cx(
          "absolute flex flex-col border-line bg-surface shadow-2xl",
          phone
            ? cx("anim-sheet inset-x-0 bottom-0 rounded-t-3xl border-t pb-[env(safe-area-inset-bottom)]", tall ? "h-[92dvh]" : "max-h-[88dvh]")
            : "anim-pop inset-y-3 right-3 w-[min(520px,calc(100vw-24px))] rounded-2xl border",
        )}
      >
        {phone && <div className="mx-auto mt-2.5 h-1 w-10 shrink-0 rounded-full bg-line-strong" />}
        <div className="flex shrink-0 items-center justify-between gap-3 px-5 pb-2 pt-3 md:pt-4">
          <div className="min-w-0 truncate text-[15px] font-semibold text-ink">{title}</div>
          <IconButton label="Закрыть" onClick={onClose} className="-mr-2">
            <X className="size-5" />
          </IconButton>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="shrink-0 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
