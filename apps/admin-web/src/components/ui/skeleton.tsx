import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("skeleton h-4", className)} />;
}

/** Filas de tabla mientras carga; las columnas imitan anchos típicos. */
export function SkeletonRows({
  rows = 5,
  columns = 4,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  const widths = ["w-24", "w-40", "w-20", "w-16", "w-28", "w-12"];
  return (
    <div role="status" aria-label="Cargando" className={cn("flex flex-col", className)}>
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex items-center gap-6 border-b border-border py-3.5 last:border-b-0"
          style={{ opacity: 1 - row * 0.12 }}
        >
          {Array.from({ length: columns }, (_, col) => (
            <Skeleton
              key={col}
              className={cn(widths[col % widths.length], col === columns - 1 && "ml-auto")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div role="status" aria-label="Cargando" className={cn("flex flex-col gap-2.5", className)}>
      {Array.from({ length: lines }, (_, index) => (
        <Skeleton key={index} className={index === lines - 1 ? "w-2/3" : "w-full"} />
      ))}
    </div>
  );
}
