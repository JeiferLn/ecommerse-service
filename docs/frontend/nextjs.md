# Frontend (Next.js, `apps/admin-web`)

## Base

- App Router con `src/` dir y alias `@/*`.
- Server Components por defecto; `"use client"` solo cuando se necesita interactividad.
- Estado de servidor con TanStack Query (cliente); nunca fetch directo en `useEffect`.
- Formularios: React Hook Form + Zod.
- Componentes UI: shadcn/ui generados en `src/components/ui/` con el CLI. Solo se mueven a `packages/ui` cuando 2+ apps los comparten.
- Diseño y patrones visuales: ver [Diseño del admin](diseno.md).

## Grupos de rutas

- `(public)` — landing y contenido sin sesión, incluidos `/pricing`, `/checkout/[token]` y `/session-refresh`.
- `(auth)` — `/login`, `/register`, `/register/invitation`, `/forgot-password`, `/reset-password`; con sesión redirige al inicio según rol (`homePathForRole`).
- `(private)` — área autenticada:
  - `(private)/(company)` — app de la tienda.
  - `(private)/admin` — staff de plataforma.

## Rutas

- **Tienda (sin prefijo):** `/` (overview; con sesión el middleware reescribe a `/overview`), `/products`, `/products/new`, `/products/[id]`, `/categories`, `/orders`, `/sales`, `/whatsapp`, `/whatsapp/inbox`, `/assistant/playground`, `/knowledge`, `/settings`, `/settings/payments`, `/settings/shipping`, `/members`, `/billing`.
- **Plataforma:** `/admin`, `/admin/companies`, `/admin/settings`.
- Las URLs antiguas `/dashboard/**` redirigen a la ruta sin prefijo; no crear rutas nuevas bajo `/dashboard`.
- Toda ruta nueva de la tienda se agrega a `COMPANY_ROUTES` en `middleware.ts`.
- Post-login: `admin` → `/admin`; resto → `/`. El middleware verifica el JWT (`JWT_SECRET` server-only) y redirige por rol (`/admin` ↔ rutas de la tienda).

## Sesión

- La sesión vive en la cookie httpOnly `access_token` (detalles del backend en [Autenticación](../general/autenticacion.md#sesión)). El cliente obtiene el usuario con `GET /api/v1/auth/me` (TanStack Query, queryKey `["session"]`).
- Si el access JWT no es válido, el middleware redirige a `/session-refresh?next=...` (que llama a `POST /auth/refresh`) y solo si eso falla a `/login`.
- Refresh automático en `src/lib/api.ts`: ante un 401 se llama a `POST /auth/refresh` (single-flight: las peticiones concurrentes comparten la misma promesa) y se reintenta la petición original una vez.
  - Si el refresh falla con 401, se redirige a `/login?next=...`.
  - Los endpoints de auth (`login`, `register`, `forgot-password`, `reset-password`, `refresh`, `logout`) están excluidos del reintento.
  - Tras cada rotación se dispara el evento `auth:refreshed` (el `SessionProvider` invalida `["session"]`).

## Errores de API

`ApiClientError` (status + message) desde `src/lib/api.ts`.
