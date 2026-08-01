# Convenciones del Proyecto

Documento de referencia para todo desarrollo en Commerce AI SaaS.

---

## Monorepo

- Gestor: pnpm (workspaces) + Turborepo.
- Paquetes: `@commerce-ai/*` (`apps/*` y `packages/*`).
- Un paquete es `private` siempre; nada se publica a npm.
- Toda dependencia nueva se instala con `pnpm add <pkg> --filter <workspace-pkg>`.

## Estructura

```
apps/
  admin-web/   # Frontend Next.js (App Router, Server Components por defecto)
  backend/     # API NestJS
packages/
  config/      # tsconfigs compartidos (base, nextjs, nestjs)
  types/       # Tipos compartidos (ApiResponse, PaginatedResponse, ...)
  ui/          # Componentes UI compartidos entre apps (placeholder en Fase 0)
docker/        # docker-compose (PostgreSQL + pgvector, Redis)
docs/          # Documentación
scripts/       # Utilidades de desarrollo
```

## Naming

- Archivos y carpetas: `kebab-case`.
- Clases/servicios de NestJS: `PascalCase` (ej: `PrismaService`).
- Endpoints REST: `kebab-case` bajo el prefijo global `/api/v1`.
- Commits: conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`).

## Backend (NestJS)

- Un módulo por dominio (`src/<dominio>/`): `*.module.ts`, `*.controller.ts`, `*.service.ts`, DTOs y `*.spec.ts`.
- Controllers delgados: solo validación de entrada y delegación al service.
- Lógica de negocio siempre en Services (nunca en controllers).
- Acceso a datos solo vía PrismaService (o repositorios) — nunca desde controllers.
- Módulos independientes, sin dependencias circulares.
- `PrismaModule` es global: `PrismaService` se inyecta sin importar el módulo.
- Respuestas API consistentes usando `ApiResponse<T>` de `@commerce-ai/types`.
- Variables de entorno validadas en `src/config/env.validation.ts` (zod) al arrancar.
- Errores manejados con excepciones HTTP de NestJS (`NotFoundException`, etc.).
- `HttpExceptionFilter` global formatea los errores como `{ status: "error", data: null, message }` (incluye el detalle de validación de DTOs).
- Guards globales vía `APP_GUARD`: `JwtAuthGuard` (autenticación) y `RolesGuard` (autorización por rol).
- Endpoints públicos se marcan con `@Public()`; rutas protegidas exigen cookie `access_token` (JWT).

## Autenticación

- Roles: `admin` (administradores de la plataforma), `owner` (creadores de empresa), `user` (invitados por owners). Se definen en `packages/types` (`UserRole`) y se asignan en el registro.
- Registro público crea usuarios con rol `owner`. El usuario `admin` se crea con el seed (`prisma/seed.ts`).
- Sesión con dos cookies httpOnly (`sameSite: lax`):
  - `access_token` — JWT de 15 min (valor por defecto, `ACCESS_TOKEN_TTL_SECONDS`), path `/`.
  - `refresh_token` — opaco de 64 hex (32 bytes aleatorios), 7 días (`REFRESH_TOKEN_TTL_SECONDS`), path `/api/v1/auth`; se guarda hasheado (sha256) en `RefreshToken`.
- Rotación: cada `POST /api/v1/auth/refresh` revoca el token usado y emite uno nuevo; reutilizar un token ya revocado devuelve 401.
- Logout: revoca el refresh token y limpia cookies. El access token (stateless) sigue siendo válido hasta expirar.
- El guard lee el token de la cookie `access_token` (no del header `Authorization`).
- Tests e2e (`test/auth.e2e-spec.ts`) usan cookies reales y una cuenta `e2e-<timestamp>@test.com` que se limpia en `afterAll`.

## Frontend (Next.js)

- App Router con `src/` dir y alias `@/*`.
- Server Components por defecto; `"use client"` solo cuando se necesita interactividad.
- Estado de servidor con TanStack Query (cliente) — nunca fetch en useEffect directo.
- Formularios: React Hook Form + Zod.
- Componentes UI: shadcn/ui generados en `src/components/ui/` con el CLI.
- Solo se mueven componentes a `packages/ui` cuando 2+ apps los comparten.
- Grupos de rutas por zona de acceso:
  - `(public)` — landing y contenido accesible sin sesión.
  - `(auth)` — páginas de autenticación (`/login`, `/register`, `/forgot-password`); redirige a `/dashboard` si ya hay sesión.
  - `(private)` — área autenticada; el middleware redirige a `/login` si no hay cookie `access_token`.
- La sesión se mantiene con cookie httpOnly (`access_token`); el cliente obtiene el usuario vía `GET /api/v1/auth/me` (TanStack Query, queryKey `["session"]`).
- Errores de API: `ApiClientError` (status + message) desde `src/lib/api.ts`.

## Base de datos (Prisma)

- Esquema en `apps/backend/prisma/schema.prisma` (única fuente de verdad).
- Migraciones preservadas: nunca se edita una migración ya aplicada.
- Modelos normalizados, índices para columnas consultadas por igualdad/tenant.
- Todas las tablas multi-tenant incluyen la columna de aislamiento del tenant.

## IA

- Proveedores abstraídos detrás de una interfaz propia; nunca acoplar lógica al SDK de OpenAI.
- Prompts en plantillas reutilizables, separadas de la lógica de negocio.

## Variables de entorno

- Cada app tiene `.env.example` versionado y `.env` ignorado por git.
- Nunca comprometer secretos ni valores reales.

## Verificación

- `pnpm lint` — eslint en todo el monorepo.
- `pnpm typecheck` — tsc --noEmit en todas las apps/paquetes.
- `pnpm build` — build de producción (dependencias en orden vía turbo).
- `pnpm test` (backend) — unit tests con jest.
