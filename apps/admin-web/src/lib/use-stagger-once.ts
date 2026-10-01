"use client";

import { useEffect, useState } from "react";

/**
 * Devuelve "stagger" solo durante la primera carga con datos; después la clase se
 * retira para que los refetch y el polling no vuelvan a animar la lista.
 */
export function useStaggerOnce(ready: boolean): string {
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (!ready || done) {
      return;
    }
    const timer = window.setTimeout(() => setDone(true), 800);
    return () => window.clearTimeout(timer);
  }, [ready, done]);
  return ready && !done ? "stagger" : "";
}
