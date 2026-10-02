# Monorepo

## Estructura

```
apps/
  admin-web/   # Frontend Next.js (App Router, Server Components por defecto)
  api-py/      # API FastAPI (Python 3.12, uv)
packages/
  config/      # tsconfigs compartidos (base, nextjs)
  types/       # Tipos compartidos (ApiResponse, PaginatedResponse, ...) y datos JSON
  ui/          # Componentes UI compartidos entre apps (placeholder en Fase 0)
docker/        # docker-compose (PostgreSQL + pgvector, Redis)
docs/          # Documentación
scripts/       # Utilidades de desarrollo
```

## Gestores y paquetes

- **bun** (workspaces, `packageManager: bun@…`) + Turborepo. `bun.lock` es el lockfile válido; `pnpm-lock.yaml` es un resto histórico.
- Paquetes `@commerce-ai/*` (`apps/*` y `packages/*`), siempre `private`; nada se publica a npm.
- Toda dependencia JS nueva se instala desde el workspace que la usa: `cd apps/<app> && bun add <pkg>`.
- El backend es Python y usa **uv**: `cd apps/api-py && uv add <pkg>` (dev: `uv add --dev <pkg>`). Su `package.json` solo expone scripts (`dev`, `test`, `lint`, `typecheck`, `db:*`) para que turbo lo orqueste; requiere `uv` en el PATH.
- `packages/types` se consume compilado (`dist`): tras cambiarlo, `cd packages/types && bun run build`.

## Naming

- Archivos y carpetas: `kebab-case` en TypeScript; `snake_case` en Python (módulos, funciones, variables).
- Clases: `PascalCase` (ej: `OrdersService`, `ProductImage`).
- Endpoints REST: `kebab-case` bajo el prefijo global `/api/v1`. Las claves JSON van en camelCase.
- Commits: conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`).
