"use client";

import { useEffect, useRef, useState } from "react";

function format(value: number, prefix: string): string {
  return `${prefix}${Math.round(value).toLocaleString("es-CO")}`;
}

/** Número que cuenta hasta `value` cuando entra en pantalla. */
export function CountUp({
  value,
  prefix = "",
  duration = 1600,
  className,
}: {
  value: number;
  prefix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setCurrent(value);
      return;
    }
    let frame = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min((now - start) / duration, 1);
          const eased = 1 - Math.pow(1 - progress, 4);
          setCurrent(value * eased);
          if (progress < 1) frame = requestAnimationFrame(tick);
        };
        frame = requestAnimationFrame(tick);
      },
      { threshold: 0.4 },
    );
    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={className}>
      <span aria-hidden className="tabular-nums">
        {format(current, prefix)}
      </span>
      <span className="sr-only">{format(value, prefix)}</span>
    </span>
  );
}
