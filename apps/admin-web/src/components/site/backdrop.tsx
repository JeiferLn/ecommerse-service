import { cn } from "@/lib/utils";

/** Retícula y luz verde en movimiento para los fondos oscuros (`site-ink`). */
export function Backdrop({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <div className="hero-grid absolute inset-0" />
      <div className="hero-light absolute -inset-x-1/4 -top-1/3 h-[110%]" />
    </div>
  );
}
