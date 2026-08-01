# Commerce AI SaaS — Admin Web

Frontend de administración de la plataforma. Next.js 15 (App Router) + TypeScript + Tailwind CSS v4 + shadcn/ui.

## Scripts

```bash
pnpm dev        # desarrollo en http://localhost:3000 (Turbopack)
pnpm build      # build de producción
pnpm lint       # eslint
pnpm typecheck  # tsc --noEmit
```

## Convenciones

- Server Components por defecto; `"use client"` solo cuando se necesita interactividad.
- Componentes UI: shadcn/ui en `src/components/ui/` (generados con el CLI).
- Formularios: React Hook Form + Zod (a partir de Fase 1).
- Estado de servidor: TanStack Query.
- Más detalles en `docs/CONVENTIONS.md` (raíz del repo).
