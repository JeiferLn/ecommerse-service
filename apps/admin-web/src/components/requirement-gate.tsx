import type { LucideIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RequirementGate({
  icon: Icon,
  title,
  description,
  href,
  actionLabel,
  fallback,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  /** Sin `href` se muestra `fallback` en lugar del botón. */
  href?: string;
  actionLabel?: string;
  fallback?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-lg border border-border p-5 sm:flex-row sm:items-start",
        className,
      )}
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-warning-soft text-warning">
        <Icon className="size-4" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h2 className="text-sm font-medium">{title}</h2>
        <p className="max-w-xl text-sm text-pretty text-muted-foreground">{description}</p>
        {!href && fallback ? <p className="mt-2 text-sm">{fallback}</p> : null}
      </div>
      {href && actionLabel ? (
        <Button asChild size="sm" className="w-fit shrink-0">
          <Link href={href}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}
