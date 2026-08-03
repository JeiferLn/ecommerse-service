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

## Autenticación y autorización

### Roles

- `admin` — staff de la plataforma Commerce AI (seed). No opera una tienda ni se une a empresas.
- `owner` — dueño de una empresa: settings, equipo, billing y operación completa.
- `manager` — opera el día a día (catálogo, pedidos, WhatsApp/IA) sin settings ni billing ni gestión de equipo.
- `user` — opera con menos poder (atender pedidos/conversaciones, ver catálogo/miembros); sin config sensible.

Los roles de empresa viven en `CompanyMembership.role` (el JWT lleva el rol efectivo de la empresa activa). Se definen en `packages/types` (`UserRole`).

### Matriz de capacidades (sin módulo Permission)

No hay modelo/tabla `Permission`. La autorización es por **roles gruesos** (`@Roles(...)` + `RolesGuard`) y la matriz tipada `ROLE_CAPABILITIES` / helpers (`canEditCompany`, `canManageMembers`, …) en `@commerce-ai/types`.

| Capacidad | owner | manager | user | admin |
|-----------|:-----:|:-------:|:----:|:-----:|
| Editar empresa (settings) | ✓ | ✗ | ✗ | — |
| Invitar / expulsar / cambiar roles | ✓ | ✗ | ✗ | — |
| Ver miembros | ✓ | ✓ | ✓ | — |
| Catálogo CRUD | ✓ | ✓ | ver | — |
| Pedidos / conversaciones | ✓ | ✓ | operar | — |
| WhatsApp / IA config | ✓ | ✓ | ver | — |
| Billing / plan | ✓ | ✗ | ✗ | — |
| Soporte global plataforma | ✗ | ✗ | ✗ | ✓ |

Reglas al añadir endpoints:

1. Marcar públicos con `@Public()`.
2. Si cualquier miembro autenticado de la empresa puede: sin `@Roles` (solo JWT).
3. Si solo algunos roles: `@Roles("owner")` o `@Roles("owner", "manager")` según la matriz.
4. En el front, preferir `canEditCompany(role)` / `canManageMembers(role)` en lugar de comparar strings a mano.
5. Revisar la matriz al entrar en nuevas fases. Catálogo, dashboard y WhatsApp ya aplican `manageCatalog` / `viewCatalog` / `viewDashboard` / `manageWhatsapp` / `viewWhatsapp`.

### Sesión y registro

- Registro público crea usuarios con rol `owner` y su empresa en una única transacción (`$transaction`): `User` + `Company` + `CompanyMembership`. Abre sesión de inmediato. `AuthUser` expone `companyId` y `companies[]`.
- Tipos de empresa (`CompanyType`): ver `COMPANY_TYPES` / `COMPANY_TYPE_LABELS` en `@commerce-ai/types` (orientados a ventas; perfil ampliable en settings).
- Sesión con dos cookies httpOnly (`sameSite: lax`):
  - `access_token` — JWT de 15 min (valor por defecto, `ACCESS_TOKEN_TTL_SECONDS`), path `/`.
  - `refresh_token` — opaco de 64 hex (32 bytes aleatorios), 7 días (`REFRESH_TOKEN_TTL_SECONDS`), path `/api/v1/auth`; se guarda hasheado (sha256) en `RefreshToken`.
- Rotación: cada `POST /api/v1/auth/refresh` revoca el token usado y emite uno nuevo; reutilizar un token ya revocado devuelve 401.
- Logout: revoca el refresh token y limpia cookies. El access token (stateless) sigue siendo válido hasta expirar.
- El guard lee el token de la cookie `access_token` (no del header `Authorization`).
- Recuperación de contraseña: `POST /auth/forgot-password` genera un token opaco de 64 hex (1 hora, `RESET_TOKEN_TTL_SECONDS`) guardado hasheado en `PasswordResetToken` y envía el enlace por correo (Nodemailer + SMTP de plataforma; sin SMTP configurado entra en modo preview). La respuesta es genérica. `POST /auth/reset-password` valida el token, cambia la contraseña, borra los tokens y revoca todas las sesiones activas. El token es de un solo uso.
- Emails de la app salen con SMTP de plataforma (como GitHub): no hay SMTP por empresa.
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
  - `(auth)` — páginas de autenticación (`/login`, `/register`, `/forgot-password`, `/reset-password`); redirige a `/dashboard` si ya hay sesión.
  - `(private)` — área autenticada; el middleware redirige a `/login` si no hay cookie `access_token`.
- La sesión se mantiene con cookie httpOnly (`access_token`); el cliente obtiene el usuario vía `GET /api/v1/auth/me` (TanStack Query, queryKey `["session"]`).
- Refresh automático de sesión en `src/lib/api.ts`: ante un 401 se llama a `POST /auth/refresh` (single-flight: las peticiones concurrentes comparten la misma promesa) y se reintenta la petición original una vez. Si el refresh falla con 401, se redirige a `/login?next=...`. Los endpoints de auth (`login`, `register`, `forgot-password`, `reset-password`, `refresh`, `logout`) están excluidos del retry. Tras cada rotación se dispara el evento `auth:refreshed` (el SessionProvider invalida `["session"]`).
- Errores de API: `ApiClientError` (status + message) desde `src/lib/api.ts`.

## Base de datos (Prisma)

- Esquema en `apps/backend/prisma/schema.prisma` (única fuente de verdad).
- Migraciones preservadas: nunca se edita una migración ya aplicada.
- Modelos normalizados, índices para columnas consultadas por igualdad/tenant.
- Todas las tablas multi-tenant incluyen la columna de aislamiento del tenant.

## Catálogo (Fase 3)

- Entidades: `Category`, `Product`, `ProductVariant`, `ProductImage`, todas aisladas por `companyId` (categoría/producto) o por producto.
- Categorías planas: `slug` único por empresa (`slugify` en backend).
- Variantes: cada producto tiene ≥1 variante; **precio y stock viven en la variante**. En admin se pueden generar combinaciones desde atributos libres (talla, color, material, largo, etc.); siguen siendo N filas de inventario.
- Ajuste de inventario: `PATCH /products/:id/variants/:variantId/stock` con `stock` absoluto o `delta`.
- Imágenes: `StorageService` usa Cloudflare R2 si hay `R2_*`; si no, guarda en disco (`LOCAL_UPLOAD_DIR` o `./uploads`) y sirve en `/uploads/...` con `API_PUBLIC_URL` (p. ej. `http://localhost:4000`). Reordenar: `PATCH /products/:id/images/reorder` con `{ imageIds: string[] }` (la primera es la portada).
- Autorización: lectura para miembros de la empresa; escritura `@Roles("owner", "manager")` / `canManageCatalog`.
- Endpoints bajo `/api/v1/categories` y `/api/v1/products`.
- Admin: `/dashboard/categories`, `/dashboard/products`, `/dashboard/products/new`, `/dashboard/products/[id]`.

## Dashboards (Fase 4)

- Dos superficies separadas:
  - **Empresa** (`/dashboard`): miembros de tienda (`owner` / `manager` / `user`) con `companyId`. Stats: `GET /api/v1/company/stats`. KPIs reales de catálogo/stock/categorías/miembros; ventas/pedidos/clientes/conversaciones como “Próximamente”.
  - **Plataforma** (`/admin`): solo rol global `admin`. Stats: `GET /api/v1/admin/stats`. KPIs globales + series de altas 30 días + empresas recientes.
- Capacidad `viewDashboard` en la matriz de empresa; el staff `admin` no usa capacidades de tenant.
- Post-login: `admin` → `/admin`; resto → `/dashboard`. El middleware de Next verifica el JWT (`JWT_SECRET` server-only) y redirige por rol (`/admin` ↔ `/dashboard`).

## WhatsApp (Fase 5)

- **Arquitectura:** 1 App Meta de plataforma + 1 `WhatsAppConnection` por empresa (`phoneNumberId` único → tenant). Credenciales por empresa en DB (no en `.env` global). Env de plataforma: `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_GRAPH_API_VERSION`, `WHATSAPP_AUTO_REPLY_*`, `WHATSAPP_SKIP_SIGNATURE`, `WHATSAPP_SIMULATE_SEND`.
- **Webhook único:** `GET/POST /api/v1/whatsapp/webhook` (`@Public()`). Meta verifica con `hub.verify_token`; POST valida `X-Hub-Signature-256` salvo `WHATSAPP_SKIP_SIGNATURE=true` fuera de production. El tenant se resuelve por `metadata.phone_number_id`.
- **Simulación sin Meta:** `POST /api/v1/whatsapp/webhook/simulate` (`@Roles("owner","manager")`) inyecta el mismo flujo de ingestión. Envíos: `WhatsAppCloudClient` no llama a Graph si `WHATSAPP_SIMULATE_SEND=true` o el token es dummy/`test-`.
- **Inbox:** conversaciones/mensajes aislados por `companyId`. Auto-reply fijo (sin IA; Fase 6).
- **Secretos:** el GET de conexión solo expone `accessTokenMasked`; nunca el token completo.
- **Capacidades:** `canManageWhatsapp` / `canViewWhatsapp`. Admin UI: `/dashboard/whatsapp`, `/dashboard/whatsapp/inbox`.
- Fuera de alcance: Embedded Signup / Tech Provider, plantillas, App Review, e2e real Graph.

## Seguridad operativa

- En `production`, `COOKIE_SECURE=true` y `JWT_SECRET` no puede ser el valor `dev-only` del example.
- Rate limit (`@nestjs/throttler`): 10 req/min en login/register/forgot/reset; 120 req/min global en el resto.
- Imágenes: validación por magic bytes; en production el upload exige R2 (sin disco local ni `/uploads` estático).
- `admin-web/.env.example` documenta `NEXT_PUBLIC_API_URL` y `JWT_SECRET` (middleware).

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
