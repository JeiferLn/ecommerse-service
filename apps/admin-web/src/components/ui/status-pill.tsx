import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatusTone = "neutral" | "positive" | "attention" | "negative";

const TONE_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground",
  positive: "bg-accent text-accent-foreground",
  attention: "bg-warning-soft text-foreground",
  negative: "bg-destructive/10 text-destructive",
};

const DOT_CLASSES: Record<StatusTone, string> = {
  neutral: "bg-muted-foreground/60",
  positive: "bg-primary",
  attention: "bg-warning",
  negative: "bg-destructive",
};

export function StatusPill({
  tone = "neutral",
  children,
  className,
}: {
  tone?: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className,
      )}
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", DOT_CLASSES[tone])} />
      {children}
    </span>
  );
}
