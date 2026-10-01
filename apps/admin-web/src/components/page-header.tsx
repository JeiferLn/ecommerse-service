import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Encabezado común de las páginas del panel. */
export function PageHeader({
  title,
  description,
  actions,
  compact = false,
  className,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
  /** Para vistas de altura completa: menos aire y título más pequeño. */
  compact?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between",
        compact ? "mb-4" : "mb-8",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1
          className={cn(
            "font-semibold tracking-display text-balance",
            compact ? "text-xl sm:text-2xl" : "text-2xl sm:text-3xl",
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}
