# Autenticación y autorización

## Roles

- `admin` — staff de la plataforma Commerce AI (seed). No opera una tienda ni se une a empresas.
- `owner` — dueño de una empresa: settings, equipo, billing y operación completa.
- `manager` — opera el día a día (catálogo, pedidos, WhatsApp/IA) sin settings ni billing ni gestión de equipo.
- `user` — opera con menos poder (atender pedidos/conversaciones, ver catálogo/miembros); sin config sensible.

Los roles de empresa viven en `CompanyMembership.role` (el JWT lleva el rol efectivo de la empresa activa). Se definen en `packages/types` (`UserRole`).

## Matriz de capacidades

No hay modelo/tabla `Permission`. La autorización es por **roles gruesos** (dependencia `require_roles(...)` de `app/core/security.py`) y la matriz tipada `ROLE_CAPABILITIES` / helpers (`canEditCompany`, `canManageMembers`, …) en `@commerce-ai/types`. Backend y frontend leen la misma matriz desde `packages/types/src/data/`.

| Capacidad                          | owner | manager |  user  | admin |
| ---------------------------------- | :---: | :-----: | :----: | :---: |
| Editar empresa (settings)          |   ✓   |    ✗    |   ✗    |   —   |
| Invitar / expulsar / cambiar roles |   ✓   |    ✗    |   ✗    |   —   |
| Ver miembros                       |   ✓   |    ✓    |   ✓    |   —   |
| Catálogo CRUD                      |   ✓   |    ✓    |  ver   |   —   |
| Pedidos / conversaciones           |   ✓   |    ✓    | operar |   —   |
| WhatsApp / IA config               |   ✓   |    ✓    |  ver   |   —   |
| Billing / plan                     |   ✓   |    ✗    |   ✗    |   —   |
| Soporte global plataforma          |   ✗   |    ✗    |   ✗    |   ✓   |

### Reglas al añadir endpoints

1. Un endpoint es público si no pide `CurrentUser` ni `require_roles` (revisarlo siempre: no hay guard global).
2. Si cualquier miembro autenticado de la empresa puede: solo el parámetro `user: CurrentUser` (exige la cookie `access_token`).
3. Si solo algunos roles: `dependencies=[require_roles("owner")]` o `require_roles("owner", "manager")` en la ruta o en el `APIRouter`, según la matriz.
4. En el front, preferir `canEditCompany(role)` / `canManageMembers(role)` en lugar de comparar strings a mano.
5. Revisar la matriz al entrar en nuevas fases. Catálogo, dashboard y WhatsApp ya aplican `manageCatalog` / `viewCatalog` / `viewDashboard` / `manageWhatsapp` / `viewWhatsapp`.

## Registro

- El registro público crea un usuario `owner` y su empresa en una única transacción: `User` + `Company` + `CompanyMembership`. Abre sesión de inmediato. `AuthUser` expone `companyId` y `companies[]`.
- Registro Pro/Business: ver [Suscripciones](../modulos/suscripciones.md) (`PendingRegistration`).
- Tipos de empresa (`CompanyType`): `COMPANY_TYPES` / `COMPANY_TYPE_LABELS` en `@commerce-ai/types` (orientados a ventas; perfil ampliable en settings).

## Sesión

- Dos cookies httpOnly (`sameSite: lax`):
  - `access_token` — JWT de 15 min (por defecto, `ACCESS_TOKEN_TTL_SECONDS`), path `/`.
  - `refresh_token` — opaco de 64 hex (32 bytes aleatorios), 7 días (`REFRESH_TOKEN_TTL_SECONDS`), path `/api/v1/auth`; se guarda hasheado (sha256) en `RefreshToken`.
- `get_current_user` lee el token de la cookie `access_token` (no del header `Authorization`).
- Rotación: cada `POST /api/v1/auth/refresh` revoca el token usado y emite uno nuevo; reutilizar un token ya revocado devuelve 401.
- Logout: revoca el refresh token y limpia cookies. El access token (stateless) sigue siendo válido hasta expirar.
- Del lado del admin (middleware, `/session-refresh`, reintento ante 401): ver [Next.js](../frontend/nextjs.md#sesión).

## Recuperación de contraseña y correo

- `POST /auth/forgot-password` genera un token opaco de 64 hex (1 hora, `RESET_TOKEN_TTL_SECONDS`) guardado hasheado en `PasswordResetToken` y envía el enlace por correo. La respuesta es genérica.
- `POST /auth/reset-password` valida el token, cambia la contraseña, borra los tokens y revoca todas las sesiones activas. El token es de un solo uso.
- Los correos salen con aiosmtplib y el SMTP de plataforma (como GitHub): no hay SMTP por empresa. Sin SMTP configurado entra en modo preview.
