import { Check } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Barra de guardado fija al pie del formulario. Va dentro del <form>. */
export function FormActions({
  dirty,
  pending,
  saved,
  error,
  submitLabel = "Guardar cambios",
  pendingLabel = "Guardando…",
  disabled,
  extra,
  className,
}: {
  /** Si se omite, el botón queda siempre habilitado. */
  dirty?: boolean;
  pending?: boolean;
  saved?: boolean;
  error?: string | null;
  submitLabel?: string;
  pendingLabel?: string;
  disabled?: boolean;
  extra?: ReactNode;
  className?: string;
}) {
  let status: ReactNode = null;
  if (error) {
    status = <span className="text-destructive">{error}</span>;
  } else if (dirty) {
    status = (
      <span className="inline-flex items-center gap-2 text-muted-foreground">
        <span aria-hidden className="size-1.5 rounded-full bg-warning" />
        Cambios sin guardar
      </span>
    );
  } else if (saved) {
    status = (
      <span className="inline-flex items-center gap-1.5 text-muted-foreground">
        <Check className="size-4 text-primary" aria-hidden />
        Cambios guardados
      </span>
    );
  }

  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-4 mt-2 flex items-center justify-end gap-3 border-t border-border bg-background px-4 py-3 sm:-mx-8 sm:px-8",
        className,
      )}
    >
      <p
        key={error ? "error" : dirty ? "dirty" : saved ? "saved" : "idle"}
        role="status"
        className="slide-up-in mr-auto min-w-0 truncate text-sm"
      >
        {status}
      </p>
      {extra}
      <Button type="submit" disabled={disabled || pending || dirty === false}>
        {pending ? pendingLabel : submitLabel}
      </Button>
    </div>
  );
}
