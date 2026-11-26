import type { CSSProperties } from "react";
import { cx } from "./cx";

// Скелетоны вместо спиннеров: место под контент занято сразу, страница не прыгает,
// когда данные или чанк догрузились. Мерцание — transform по псевдоэлементу (только композитинг).

export function Skeleton({ className, style }: { className?: string; style?: CSSProperties }) {
  return <div className={cx("skeleton rounded-lg", className)} style={style} aria-hidden />;
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cx("grid gap-2.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-3.5" style={{ width: i === lines - 1 ? "62%" : `${92 - ((i * 7) % 15)}%` }} />
      ))}
    </div>
  );
}

/** Страница целиком: шапка + блоки. Для ленивых маршрутов. */
export function PageSkeleton() {
  return (
    <div className="px-5 pt-6 md:px-10 md:pt-10" aria-busy="true" aria-label="Загрузка">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-8 w-2/3 max-w-md" />
      <div className="mt-8 grid max-w-3xl gap-3">
        <Skeleton className="h-24 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
        <Skeleton className="h-16 rounded-2xl" />
      </div>
    </div>
  );
}

/** Текст урока: абзацы, заголовок, «виджет». */
export function LessonSkeleton() {
  return (
    <div className="grid gap-6 pt-2" aria-busy="true" aria-label="Загрузка урока">
      <SkeletonText lines={4} />
      <Skeleton className="h-6 w-1/2" />
      <SkeletonText lines={3} />
      <Skeleton className="h-64 rounded-2xl" />
      <SkeletonText lines={4} />
    </div>
  );
}

/** Список карточек/строк. */
export function ListSkeleton({ rows = 4, height = 56 }: { rows?: number; height?: number }) {
  return (
    <div className="grid gap-2" aria-busy="true">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="rounded-2xl" style={{ height }} />
      ))}
    </div>
  );
}
