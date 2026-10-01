"use client";

import { useLayoutEffect, useState } from "react";

/** Ocupa el alto visible restante para que solo scrolleen las áreas internas. */
export function useFillHeight<T extends HTMLElement>(bottomGap = 32, minHeight = 480) {
  const [node, setNode] = useState<T | null>(null);
  const [height, setHeight] = useState<number | null>(null);
  useLayoutEffect(() => {
    if (!node) {
      return;
    }
    const update = () => {
      const top = node.getBoundingClientRect().top + window.scrollY;
      setHeight(Math.max(minHeight, window.innerHeight - top - bottomGap));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [node, bottomGap, minHeight]);
  return { ref: setNode, height };
}
