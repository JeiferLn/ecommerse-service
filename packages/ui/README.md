# @commerce-ai/ui

Paquete destinado a componentes UI **compartidos entre apps** (ej: widgets de dashboard, DataTable, layouts comunes).

Reglas:

- Los componentes shadcn/ui se generan dentro de cada app (`apps/*/src/components/ui`) con el CLI de shadcn.
- Solo se mueve a este paquete un componente cuando **dos o más apps** lo necesitan.
- Al mover componentes aquí, agregar `transpilePackages: ["@commerce-ai/ui"]` en el `next.config.ts` de cada app consumidora.

Estado actual: sin componentes (placeholder de la Fase 0 — Arquitectura).
