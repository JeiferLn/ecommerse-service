"use client";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = "default",
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: "default" | "sm";
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={cn("flex flex-wrap gap-1.5", className)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border transition-colors duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              selected
                ? "border-foreground bg-foreground text-background"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span className="text-[0.85em] tabular-nums opacity-70">{option.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
