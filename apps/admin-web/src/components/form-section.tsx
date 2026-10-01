import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Sección de formulario: título y ayuda a la izquierda, campos a la derecha. */
export function FormSection({
  title,
  description,
  children,
  stacked = false,
  className,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Título encima de los campos, para columnas estrechas. */
  stacked?: boolean;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "grid gap-4 border-t border-border py-6 first:border-t-0 first:pt-0",
        !stacked && "md:grid-cols-[220px_minmax(0,1fr)] md:gap-8",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-sm font-medium">{title}</h2>
        {description ? (
          <p className="max-w-xl text-sm text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      <div className="flex min-w-0 flex-col gap-4">{children}</div>
    </section>
  );
}
