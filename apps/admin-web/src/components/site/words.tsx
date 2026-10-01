import type { CSSProperties } from "react";

import { cn } from "@/lib/utils";

/** Parte un texto en palabras que suben una tras otra al cargar. */
export function Words({
  text,
  start = 0,
  step = 90,
  className,
}: {
  text: string;
  start?: number;
  step?: number;
  className?: string;
}) {
  return text.split(" ").map((word, index) => (
    <span
      key={`${word}-${index}`}
      className={cn("word-rise inline-block", className)}
      style={{ "--d": `${start + index * step}ms` } as CSSProperties}
    >
      {word}
      {"\u00a0"}
    </span>
  ));
}

export const accentWords = "font-accent font-normal tracking-normal text-primary italic";
