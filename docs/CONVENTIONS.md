# Convenciones del Proyecto

Documento de referencia para todo desarrollo en Commerce AI SaaS.

---

## Monorepo

- Gestor: **bun** (workspaces, `packageManager: bun@…`) + Turborepo. `bun.lock` es el lockfile válido; `pnpm-lock.yaml` es un resto histórico.
- Paquetes: `@commerce-ai/*` (`apps/*` y `packages/*`).
- Un paquete es `private` siempre; nada se publica a npm.
- Toda dependencia JS nueva se instala desde el workspace que la usa: `cd apps/<app> && bun add <pkg>`.
- El backend es Python y usa **uv** (`cd apps/api-py && uv add <pkg>`; dev: `uv add --dev <pkg>`). Su `package.json` solo expone scripts (`dev`, `test`, `lint`, `typecheck`, `db:*`) para que turbo lo orqueste; requiere `uv` en el PATH.
- `packages/types` se consume compilado (`dist`): tras cambiarlo, `cd packages/types && bun run build`.

## Estructura

```
apps/
  admin-web/   # Frontend Next.js (App Router, Server Components por defecto)
  api-py/      # API FastAPI (Python 3.12, uv)
packages/
  config/      # tsconfigs compartidos (base, nextjs)
  types/       # Tipos compartidos (ApiResponse, PaginatedResponse, ...)
  ui/          # Componentes UI compartidos entre apps (placeholder en Fase 0)
docker/        # docker-compose (PostgreSQL + pgvector, Redis)
docs/          # Documentación
scripts/       # Utilidades de desarrollo
```

## Naming

- Archivos y carpetas: `kebab-case` en TypeScript; `snake_case` en Python (módulos, funciones, variables).
- Clases: `PascalCase` (ej: `OrdersService`, `ProductImage`).
- Endpoints REST: `kebab-case` bajo el prefijo global `/api/v1`. Las claves JSON van en camelCase.
- Commits: conventional commits (`feat:`, `fix:`, `chore:`, `refactor:`).

## Backend (FastAPI, `apps/api-py`)

- Stack: FastAPI + Pydantic v2 + SQLAlchemy 2 async (asyncpg, pgvector) + Alembic; httpx para APIs externas (Twilio, Mercado Pago, OpenRouter), boto3 para R2, aiosmtplib para correo, slowapi para rate limit.
- Un paquete por dominio en `app/modules/<dominio>/`: `router.py` (delgado: valida la entrada y delega), `service.py` (lógica de negocio, clase `XService(session)`) y utilidades puras en archivos propios con sus tests en `tests/test_<dominio>.py`. Los routers se registran en `app/modules/__init__.py`.
- Lógica de negocio y acceso a datos solo en services, nunca en routers. Sin imports circulares entre módulos.
- Núcleo en `app/core/`: `config.py` (`Settings`, variables de entorno validadas al arrancar), `db.py` (sesión por request: `DbSession`), `errors.py` (`ApiError` y helpers `bad_request` / `not_found` / `forbidden` …), `responses.py` (`ok(data, message)`), `schemas.py` (`RequestModel` / `QueryModel`), `validation.py`, `security.py`, `storage.py`, `rate_limit.py`, `ids.py`.
- Respuestas consistentes con `ApiResponse<T>` de `@commerce-ai/types`: éxito `ok(...)` → `{ status: "success", data, message? }`; cualquier error (incluida la validación) → `{ status: "error", data: null, message }`.
- Entrada con modelos `RequestModel` (cuerpo) y `QueryModel` (query): JSON camelCase y sin campos extra (400 `property X should not exist`). Los mensajes de validación van en español con los helpers de `validation.py` (`string`, `text`, `integer`, `money`, `boolean`, `matches`, `one_of`); el admin los muestra tal cual.
- Los `POST` que crean responden 201 (`status_code=201`); los webhooks, 200.
- Una sesión de base de datos por request (`expire_on_commit=False`); el service hace `commit` explícito y `rollback` si captura una excepción para seguir respondiendo.
- Ids `cuid` con `new_id()`, fechas UTC sin zona en milisegundos con `utcnow()` (`updatedAt` lo pone la app) y serialización con `iso()`.
- Contrato con el frontend: si una respuesta cambia de forma, cambia en `packages/types` y en el diccionario que devuelve el service a la vez.
- Datos compartidos con el frontend (capacidades por rol, países, geografía de Colombia) viven como JSON en `packages/types/src/data/` y los leen TypeScript y Python.

## Autenticación y autorización

### Roles

- `admin` — staff de la plataforma Commerce AI (seed). No opera una tienda ni se une a empresas.
- `owner` — dueño de una empresa: settings, equipo, billing y operación completa.
- `manager` — opera el día a día (catálogo, pedidos, WhatsApp/IA) sin settings ni billing ni gestión de equipo.
- `user` — opera con menos poder (atender pedidos/conversaciones, ver catálogo/miembros); sin config sensible.

Los roles de empresa viven en `CompanyMembership.role` (el JWT lleva el rol efectivo de la empresa activa). Se definen en `packages/types` (`UserRole`).

### Matriz de capacidades (sin módulo Permission)

No hay modelo/tabla `Permission`. La autorización es por **roles gruesos** (dependencia `require_roles(...)` de `app/core/security.py`) y la matriz tipada `ROLE_CAPABILITIES` / helpers (`canEditCompany`, `canManageMembers`, …) en `@commerce-ai/types`.

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

Reglas al añadir endpoints:

1. Un endpoint es público si no pide `CurrentUser` ni `require_roles` (revisarlo siempre: no hay guard global).
2. Si cualquier miembro autenticado de la empresa puede: solo el parámetro `user: CurrentUser` (exige la cookie `access_token`).
3. Si solo algunos roles: `dependencies=[require_roles("owner")]` o `require_roles("owner", "manager")` en la ruta o en el `APIRouter`, según la matriz.
4. En el front, preferir `canEditCompany(role)` / `canManageMembers(role)` en lugar de comparar strings a mano.
5. Revisar la matriz al entrar en nuevas fases. Catálogo, dashboard y WhatsApp ya aplican `manageCatalog` / `viewCatalog` / `viewDashboard` / `manageWhatsapp` / `viewWhatsapp`.

### Sesión y registro

- Registro público crea usuarios con rol `owner` y su empresa en una única transacción: `User` + `Company` + `CompanyMembership`. Abre sesión de inmediato. `AuthUser` expone `companyId` y `companies[]`.
- Tipos de empresa (`CompanyType`): ver `COMPANY_TYPES` / `COMPANY_TYPE_LABELS` en `@commerce-ai/types` (orientados a ventas; perfil ampliable en settings).
- Sesión con dos cookies httpOnly (`sameSite: lax`):
  - `access_token` — JWT de 15 min (valor por defecto, `ACCESS_TOKEN_TTL_SECONDS`), path `/`.
  - `refresh_token` — opaco de 64 hex (32 bytes aleatorios), 7 días (`REFRESH_TOKEN_TTL_SECONDS`), path `/api/v1/auth`; se guarda hasheado (sha256) en `RefreshToken`.
- Rotación: cada `POST /api/v1/auth/refresh` revoca el token usado y emite uno nuevo; reutilizar un token ya revocado devuelve 401.
- Logout: revoca el refresh token y limpia cookies. El access token (stateless) sigue siendo válido hasta expirar.
- `get_current_user` lee el token de la cookie `access_token` (no del header `Authorization`).
- Recuperación de contraseña: `POST /auth/forgot-password` genera un token opaco de 64 hex (1 hora, `RESET_TOKEN_TTL_SECONDS`) guardado hasheado en `PasswordResetToken` y envía el enlace por correo (aiosmtplib + SMTP de plataforma; sin SMTP configurado entra en modo preview). La respuesta es genérica. `POST /auth/reset-password` valida el token, cambia la contraseña, borra los tokens y revoca todas las sesiones activas. El token es de un solo uso.
- Emails de la app salen con SMTP de plataforma (como GitHub): no hay SMTP por empresa.
## Frontend (Next.js)

- App Router con `src/` dir y alias `@/*`.
- Server Components por defecto; `"use client"` solo cuando se necesita interactividad.
- Estado de servidor con TanStack Query (cliente) — nunca fetch en useEffect directo.
- Formularios: React Hook Form + Zod.
- Componentes UI: shadcn/ui generados en `src/components/ui/` con el CLI.
- Solo se mueven componentes a `packages/ui` cuando 2+ apps los comparten.
- Grupos de rutas por zona de acceso:
  - `(public)` — landing y contenido accesible sin sesión.
  - `(public)` incluye también `/pricing`, `/checkout/[token]` y `/session-refresh`.
  - `(auth)` — páginas de autenticación (`/login`, `/register`, `/register/invitation`, `/forgot-password`, `/reset-password`); con sesión redirige al inicio según rol (`homePathForRole`).
  - `(private)/(company)` — app de la tienda. `(private)/admin` — staff de plataforma.
  - `(private)` — área autenticada; si el access JWT no es válido, el middleware redirige a `/session-refresh?next=...` (que llama a `POST /auth/refresh`) y solo si eso falla a `/login`.
- **Rutas de la tienda (sin prefijo):** `/` (overview; con sesión el middleware reescribe a `/overview`), `/products`, `/products/new`, `/products/[id]`, `/categories`, `/orders`, `/sales`, `/whatsapp`, `/whatsapp/inbox`, `/assistant/playground`, `/knowledge`, `/settings`, `/settings/payments`, `/settings/shipping`, `/members`, `/billing`. Plataforma: `/admin`, `/admin/companies`. Las URLs antiguas `/dashboard/**` redirigen a la ruta sin prefijo; no crear rutas nuevas bajo `/dashboard`. Toda ruta nueva de la tienda se agrega a `COMPANY_ROUTES` en `middleware.ts`.
- La sesión se mantiene con cookie httpOnly (`access_token`); el cliente obtiene el usuario vía `GET /api/v1/auth/me` (TanStack Query, queryKey `["session"]`).
- Refresh automático de sesión en `src/lib/api.ts`: ante un 401 se llama a `POST /auth/refresh` (single-flight: las peticiones concurrentes comparten la misma promesa) y se reintenta la petición original una vez. Si el refresh falla con 401, se redirige a `/login?next=...`. Los endpoints de auth (`login`, `register`, `forgot-password`, `reset-password`, `refresh`, `logout`) están excluidos del retry. Tras cada rotación se dispara el evento `auth:refreshed` (el SessionProvider invalida `["session"]`).
- Errores de API: `ApiClientError` (status + message) desde `src/lib/api.ts`.

## Base de datos (SQLAlchemy + Alembic)

- Esquema en `apps/api-py/app/models.py` (única fuente de verdad). Tablas `"PascalCase"` y columnas camelCase (heredado); los nombres de índices, uniques y FKs siguen la convención de la base (`naming_convention` + bloque de `Index(...)` al final del archivo).
- Cambiar el esquema: editar `models.py` → `bun run db:revision "<descripcion>"` (o `uv run alembic revision --autogenerate -m …`) → revisar el archivo generado en `alembic/versions/` → `bun run db:migrate`. `uv run alembic check` debe quedar sin diferencias.
- La revisión base (`20261002000000`) ejecuta `alembic/baseline.sql`, el esquema heredado de las migraciones de Prisma. La tabla `_prisma_migrations` se ignora.
- Migraciones preservadas: nunca se edita una migración ya aplicada.
- Seed idempotente (admin + planes): `bun run db:seed` (`uv run python -m app.seed`).
- Modelos normalizados, índices para columnas consultadas por igualdad/tenant.
- Todas las tablas multi-tenant incluyen la columna de aislamiento del tenant.

## Catálogo (Fase 3)

- Entidades: `Category`, `Product`, `ProductVariant`, `ProductImage`, todas aisladas por `companyId` (categoría/producto) o por producto.
- Categorías planas: `slug` único por empresa (`slugify` en backend).
- Variantes: cada producto tiene ≥1 variante; **precio y stock viven en la variante**. En admin se pueden generar combinaciones desde atributos libres (talla, color, material, largo, etc.); siguen siendo N filas de inventario.
- Ajuste de inventario: `PATCH /products/:id/variants/:variantId/stock` con `stock` absoluto o `delta`.
- Imágenes: `StorageService` (`app/core/storage.py`, `get_storage()`) usa Cloudflare R2 si hay `R2_*`; si no (solo fuera de production), guarda en disco (`LOCAL_UPLOAD_DIR` o `./uploads`) y el API las sirve en `/uploads/...`. Reordenar: `PATCH /products/:id/images/reorder` con `{ imageIds: string[] }` (la primera es la portada).
- **URL guardada ≠ URL mostrada (disco local):** nunca devolver `ProductImage.url` tal cual. Para el admin usar `storage.browser_url(url)` (siempre `http://localhost:<PORT>`) y para Twilio/WhatsApp `storage.external_url(url)` (el `API_PUBLIC_URL` vigente, p. ej. ngrok). Así un túnel caído o cambiado no rompe las imágenes ya guardadas. Con R2 ambas devuelven la URL pública sin cambios.
- Autorización: lectura para miembros de la empresa; escritura `require_roles("owner", "manager")` / `canManageCatalog`.
- Endpoints bajo `/api/v1/categories` y `/api/v1/products`.
- Admin: `/categories`, `/products`, `/products/new`, `/products/[id]`.

## Dashboards (Fase 4)

- Dos superficies separadas:
  - **Empresa** (`/`, página `overview`): miembros de tienda (`owner` / `manager` / `user`) con `companyId`. Stats: `GET /api/v1/company/stats`. KPIs de catálogo/stock/miembros/pedidos, ingresos cobrados y conteos por canal (WhatsApp vs tienda), y la puesta en marcha (onboarding) de la tienda.
  - **Plataforma** (`/admin`, `/admin/companies`): solo rol global `admin`. Stats: `GET /api/v1/admin/stats`. KPIs globales + series de altas 30 días + empresas recientes; asignación de número propio de WhatsApp.
- Capacidad `viewDashboard` en la matriz de empresa; el staff `admin` no usa capacidades de tenant.
- Post-login: `admin` → `/admin`; resto → `/`. El middleware de Next verifica el JWT (`JWT_SECRET` server-only) y redirige por rol (`/admin` ↔ rutas de la tienda).

## WhatsApp (Fase 5 — Twilio)

- **Arquitectura:** 1 cuenta Twilio de plataforma (`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` en `.env`) + 1 `WhatsAppConnection` por empresa con `mode` `shared` | `dedicated`.
- **Webhook único:** `POST /api/v1/whatsapp/webhook` (público), body form-urlencoded; responde TwiML vacío (`text/xml`). Valida `X-Twilio-Signature` salvo `TWILIO_SKIP_SIGNATURE=true` fuera de production (requiere `TWILIO_WEBHOOK_URL`). El tenant se resuelve en `_resolve_inbound_connection` de `app/modules/whatsapp/webhook_service.py` (ver abajo).
- **Número compartido (plan Free / arranque):** `TWILIO_SHARED_WHATSAPP_NUMBER` es un sender de la plataforma que comparten todas las tiendas sin número propio. La tienda lo activa sola con `POST /whatsapp/connection/shared` (solo `owner`, exige productos + envíos + Mercado Pago); se crea una conexión `shared` con `storeCode` único (slug del nombre, `-2`, `-3`… si choca). Su enlace es `wa.me/<compartido>?text=Hola <Tienda> #<storeCode>`.
- **Enrutamiento del inbound:** 1) conexión `dedicated` cuyo `twilioWhatsAppNumber` = `To`; 2) si `To` es el compartido, `#codigo` del mensaje → tienda, se guarda/actualiza `SharedNumberSession` (1 por cliente) y el primer mensaje del bot lleva "Estás hablando con _Tienda_."; 3) sin código, la tienda de la sesión del cliente; 4) si no hay ninguna, respuesta genérica desde el compartido y **no** se crea conversación. El código se quita del texto guardado. Un cliente solo está en una tienda a la vez en el compartido: el último código manda.
- **Número propio:** lo asigna la plataforma (`PUT /admin/companies/:id/whatsapp-connection`); pasa la conexión a `dedicated`, borra `storeCode` y sesiones compartidas, y rechaza el número compartido. `twilioWhatsAppNumber` no es único por sí solo: la unicidad entre dedicados es un índice único **parcial** (`WhatsAppConnection_dedicated_number_key`, `WHERE mode = 'dedicated'`) declarado en `app/models.py`; no lo quites.
- **Envío:** `app/modules/whatsapp/twilio_client.py` (`send_text`, `send_media`, `send_content`) → Messages API (texto, imagen con `MediaUrl` y contenido con `ContentSid`); no llama a Twilio si `WHATSAPP_SIMULATE_SEND=true` o SID/token dummy/`test-`. Las fotos salen con `storage.external_url`.
- **Simulación:** `POST /api/v1/whatsapp/webhook/simulate` (owner/manager, solo fuera de production) inyecta el mismo flujo de ingestión. Ojo: si la tienda tiene un número real, la respuesta sí sale por Twilio.
- **Inbox:** conversaciones/mensajes aislados por `companyId` (excluye `isPlayground`). Auto-reply fijo o IA (Fase 6) según `AI_ENABLED`. Handler `pending` | `bot` | `human`; el asesor puede tomar el chat o devolverlo al bot. En el chat, el cliente va a la derecha y el bot/asesor a la izquierda.
- **Prerrequisitos para activar el canal:** un producto activo, envíos configurados y Mercado Pago conectado (`assert_whatsapp_prerequisites` en `connection_service.py`); el admin los muestra juntos con `SetupRequirements`.
- **Capacidades:** `canManageWhatsapp` / `canViewWhatsapp`. Admin UI: `/whatsapp` (canal), `/whatsapp/inbox` (Conversaciones).
- Fuera de alcance inmediato: subcuentas Twilio por empresa, mensajes fuera de la ventana de 24 h (solo existe la plantilla de pago), **imágenes entrantes** (el webhook aún no lee `NumMedia`/`MediaUrl0`; Fase 13).

### Prueba tu asistente (playground)

- `GET|POST|DELETE /api/v1/assistant/playground[/messages]` (owner/manager). Una `Conversation` con `isPlayground: true` y `waConnectionId: null` por empresa; no aparece en Conversaciones.
- Reutiliza `WhatsAppWebhookService.reply_in_playground` (mismo routing, IA, carrito e interactivos), pero: no llama a Twilio, no consume cupo de WhatsApp (sí el de IA) y al confirmar pedido no crea la orden ni descuenta stock (responde `PLAYGROUND_CHECKOUT_TEXT` y el botón de pago sale deshabilitado como "Modo prueba").
- Exige productos y envíos, no Mercado Pago. "Reiniciar" borra mensajes y carrito y vuelve a `pending`.

### Mensajes interactivos

- **Modelo:** `Message.interactive` (JSON, tipo `MessageInteractive` en `@commerce-ai/types`): `buttons`, `list`, `product_card`, `link_button` (salientes) y `reply` (el toque del cliente). `body` siempre guarda el texto que vio el cliente. Se arman solo con los constructores de `app/modules/whatsapp/interactive.py`, que ya recortan a los límites de WhatsApp (`WA_LIMITS`: 3 botones de 20 caracteres; lista de 10 opciones con título 24, descripción 72 y botón 20; cuerpo 1024).
- **IDs de acción:** `handler:bot|human`, `cart:view|checkout|continue|clear`, `add:yes|no`, `variant:<id>`, `product:<id>` (entidad `[a-z0-9_-]{1,64}`). El inbound los trae en `ButtonPayload` / `ListId`, y el simulador en `actionId`. Cada ID tiene su respuesta fija en `_handle_action` (no pasa por la IA). Si el cliente escribe el número o el título exacto de una opción del último mensaje del bot, cuenta como tocarla (`resolve_typed_action`).
- **Cuándo se envía cada uno:** pendiente → botones bot/asesor; carrito con productos → botones Confirmar/Seguir/Vaciar; la IA sugiere 1 producto → tarjeta (imagen con caption + botones); varios → lista de variantes con stock; la IA ofrece agregar → Sí/No; checkout → botón Pagar pedido.
- **Envío:** `TwilioContentService` (`twilio_content.py`) crea el contenido en la Content API (`twilio/quick-reply` o `twilio/list-picker`, más `twilio/text` de respaldo) y lo cachea por hash en `WhatsAppContentTemplate`; el cuerpo es la variable `{{1}}`. Si `WHATSAPP_INTERACTIVE_ENABLED=false`, la Content API falla o no hay plantilla, se manda `render_as_fallback_text` (opciones numeradas). El flujo nunca se corta por un interactivo.
- **Pagar pedido:** usa la plantilla aprobada `TWILIO_CHECKOUT_CONTENT_SID` (botón URL `…/checkout/{{1}}`, con `{{1}}` = token). Su cuerpo es fijo, así que el resumen del pedido se envía antes como texto. Sin plantilla, sale el mensaje de siempre con el enlace.
- **Admin:** `ChatMessageBubble` pinta los interactivos al estilo WhatsApp (`chat-interactive.tsx`; la lista abre un drawer dentro de `ChatSurface`). Con `onAction` se pueden tocar (Prueba tu asistente envía `{ text, actionId }`); sin él son de solo lectura (Conversaciones: el asesor no envía botones).

## Seguridad operativa

- En `production`, `COOKIE_SECURE=true` y `JWT_SECRET` no puede ser el valor `dev-only` del example.
- Rate limit (slowapi, `app/core/rate_limit.py`, en memoria por IP): 10 req/min (`AUTH_LIMIT`) en login/register/forgot/reset; 120 req/min global en el resto.
- Imágenes: validación por magic bytes; en production el upload exige R2 (sin disco local ni `/uploads` estático).
- `admin-web` necesita `NEXT_PUBLIC_API_URL` (por defecto `http://localhost:4000`) y `JWT_SECRET` (el mismo del backend, para el middleware); ver `apps/admin-web/.env.example`.
- Webhooks públicos: Twilio valida `X-Twilio-Signature`; Mercado Pago revalida el pago contra su API (monto y moneda) antes de marcar `paid`.

## IA (Fase 6 — prototipo cerrado)

- Proveedores abstraídos detrás de `AiChatProvider` (`app/modules/ai/providers.py`, `get_chat_provider()`); nunca acoplar lógica de negocio a un SDK de proveedor.
- Proveedor por defecto **OpenRouter** (`AI_PROVIDER=openrouter`) vía HTTP compatible con chat completions. `AI_PROVIDER=mock` para tests.
- Env: `AI_ENABLED`, `OPENROUTER_API_KEY`, `AI_BASE_URL`, `AI_MODEL` (demo típico `openrouter/free`), `AI_MAX_PRODUCTS`, `AI_HISTORY_LIMIT`, `AI_FALLBACK_TEXT`, `AI_HTTP_REFERER`, `AI_APP_TITLE`.
- Flujo: inbound WhatsApp → routing handler → `generate_reply` (`app/modules/ai/reply.py`: catálogo `active` + **RAG** + historial + bloque envíos) → outbound. Si falla / basura / `[HANDOFF]` / sin productos: `AI_FALLBACK_TEXT` y el hilo queda en el inbox.
- Comercio: país, alcances y transportadoras en `Company` (UI `/settings/shipping`). El pago va por Mercado Pago (Fase 9); el bot no inventa otros medios de pago.
- `GenerateReplyResult` incluye `suggested_product_ids` (máx. 10) cuando la pregunta es de producto o de catálogo; el webhook los convierte en tarjeta (1) o lista (varios). Las intenciones de carrito y los botones se resuelven **antes** de llamar al modelo.
- Prompts separados del servicio: `app/modules/ai/prompts.py` (`build_sales_assistant_system_prompt`) y `commerce_prompt.py` (bloque de envíos).
- **Prod (futuro):** modelo de pago + key real, Twilio WhatsApp real; no asumir calidad del modelo free.
- Sin UI de settings de IA por empresa.

## RAG / conocimiento (Fase 7)

- Módulo `app/modules/knowledge/`: **4 PDFs opcionales** (`guide` | `faq` | `warranty` | `policy`), un documento por tipo (índice único `companyId + type`), chunking (`text.py`), embeddings (`embeddings.py`), indexado (`indexer.py`) y retrieval con pgvector (`retrieval.py`).
- Subida: `PUT /knowledge/:type/file` (multipart PDF); parseo con `pypdf` (solo texto seleccionable); delete `DELETE /knowledge/:type`.
- Capability `manageKnowledge` (owner + manager). Admin: `/knowledge` (entrada "Conocimiento" en el grupo Asistente del sidebar; aviso `KnowledgeHint` en el playground).
- WhatsApp exige un producto activo, `isCompanyCommerceConfigured` e `isCompanyPaymentsConfigured` (el playground omite pagos). Los documentos **no** bloquean: sin fragmentos, el prompt indica no inventar políticas y ofrecer un asesor. Todos los planes permiten los 4 (`maxKnowledgeDocs = 4`).
- El admin muestra todos los requisitos pendientes de una vez con `SetupRequirements` (`components/setup-requirements.tsx`); no encadenar avisos uno por uno.
- Env: `EMBEDDING_PROVIDER` (`openrouter` | `mock`), `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS` (1536), `RAG_TOP_K`, `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP`.
- El `rag_block` (`format_rag_block`) se inyecta en `build_sales_assistant_system_prompt` junto al catálogo.

## Pedidos (Fase 8 + 10)

- Módulo `app/modules/orders/`: carrito 1:1 por `Conversation`, pedido con snapshot de ítems, estados y stock al checkout.
- Canal `Order.channel`: `whatsapp` (default) o `in_store`. Ventas físicas vía `POST /orders/in-store` (estado `delivered`, sin MP).
- Capabilities: `operateOrders` (listar/estado/carrito/venta tienda) para owner/manager/user; `manageOrders` (cancelar) para owner/manager.
- Bot: botones del carrito (`cart:*`, `variant:<id>`) y, si escribe, intenciones en `order_intent.py` antes del modelo (`agregar`, `ver/vaciar carrito`, `confirmar pedido`).
- `confirmar pedido` → `begin_checkout`: orden `awaiting_payment` con `checkoutToken`; el cliente completa envío y paga en `/checkout/[token]` (público, `GET|POST /api/v1/checkout/:token`). El stock se descuenta en el checkout y se repone al cancelar.
- Estados: `draft` → `confirmed` → `awaiting_payment` → `paid` → `preparing` → `shipped` → `delivered` | `cancelled` (transiciones en `STATUS_TRANSITIONS`; el link de checkout dura 48 h). Hoy el flujo de WhatsApp entra directo en `awaiting_payment`; `draft`/`confirmed` no se usan.
- Mensajes al cliente: `format_cart_message` (`with_instructions=False` cuando va con botones) y `format_order_confirmation_message` (`include_link=False` cuando el enlace va en el botón Pagar). Pendiente: usan 2 decimales fijos y no el formato de moneda local (`format_money`) del resto de la app.
- Admin: `/orders` (filtro por canal, enlace desde Conversaciones) y `/sales` (venta de mostrador).

## Pagos (Fase 9 — Mercado Pago)

- **Cobro de pedidos por empresa:** cada tienda conecta **su** cuenta (`MercadoPagoConnection`, 1:1) por OAuth de la plataforma (`MP_CLIENT_ID` / `MP_CLIENT_SECRET` / `MP_REDIRECT_URI`) o pegando un Access Token. Solo `owner`. UI: `/settings/payments`. El dinero llega a la cuenta de la tienda.
- `/checkout/[token]` crea una preferencia Checkout Pro con el token del comercio. Webhook: `POST /api/v1/payments/mercadopago/webhook` (público; URL desde `MP_WEBHOOK_URL` o `API_PUBLIC_URL`). Antes de marcar `paid` consulta el pago en Mercado Pago y valida monto y moneda; luego avisa al cliente por WhatsApp.
- Mercado Pago exige URLs de retorno HTTPS: en local, `API_PUBLIC_URL` con ngrok.
- Sin Mercado Pago conectado no se puede activar el canal de WhatsApp (el playground sí funciona).

## Suscripciones (Fase 11)

- Planes `free` / `pro` / `business` (`Plan`, seed) con límites: `maxMembers`, `maxProducts`, `maxVariants`, `maxWaMessagesMonth`, `maxAiRepliesMonth`, `maxKnowledgeDocs`. `Subscription` 1:1 por empresa; consumo mensual en `UsageCounter` (`periodKey` UTC `YYYY-MM`: `waInboundCount`, `aiReplyCount`).
- Estados: `trialing` (Free 15 días) → `active` | `trial_expired` | `past_due` | `canceled`. `cancelAtPeriodEnd` mantiene el acceso hasta `currentPeriodEnd`.
- Cobro de la plataforma con Mercado Pago Preapproval (`billingInterval` `month` | `year`; el plan guarda `priceUsdCents` mensual y la API expone también `priceYearUsdCents`). Registro Pro/Business: `PendingRegistration` y la cuenta se crea al volver del pago.
- **Enforcement en backend, no en UI:** `BillingService.assert_can(...)` antes de crear productos, variantes, miembros, documentos o conectar WhatsApp; `record_wa_inbound` / `record_ai_reply` por mensaje (el playground solo consume IA). Cupo agotado → texto fijo, nunca error al cliente.
- API: `GET /billing/plans` (público), `GET /billing/subscription`, `POST /billing/checkout`, `POST /billing/cancel`. UI: `/pricing`, registro, `/billing` y banner de prueba/vencimiento.

## Diseño del admin (Fase 12)

- Toda página de la tienda usa `PageHeader` (título + descripción + acción principal) dentro del layout `(company)` (sidebar en desktop, `MobileNav` en móvil). Revisar siempre a 390 px.
- Primitivas en `components/ui/`: `button`, `input`, `textarea`, `select`, `segmented`, `table`, `sheet` (panel lateral derecho), `dialog`, `dropdown-menu`, `badge`, `status-pill`, `empty-state`, `skeleton`, `card`, `separator`, `label`. No usar `<select>` nativo.
- Patrones compartidos: `SetupRequirements` (todos los requisitos pendientes juntos), `OnboardingChecklist` (overview) / `OnboardingSummary` (sidebar), `ChatMessageBubble` + `chat-interactive.tsx` (chats), `useFillHeight` (paneles a alto de viewport).
- Iconos solo de `lucide-react`; nada de emojis ni SVG sueltos. Animaciones con las clases de `globals.css` (`bubble-in`, `fade-swap`, `slide-up-in`), que respetan `prefers-reduced-motion`.
- Carga con `Skeleton`/`SkeletonText`, no con "Cargando…". Pendiente de cerrar: quedan textos "Cargando…" en algunas pantallas, `window.confirm` en 6 lugares (billing, categorías, conocimiento, miembros, Mercado Pago, producto) que deben pasar a un diálogo de confirmación, y no hay toasts para confirmar acciones.

## Variables de entorno

- Cada app tiene `.env.example` versionado y `.env` / `.env.local` ignorado por git. El backend lee `apps/api-py/.env`.
- Nunca comprometer secretos ni valores reales.
- Toda variable nueva del backend se declara en `Settings` de `app/core/config.py` (con default si es opcional) y en `apps/api-py/.env.example`.

## Verificación

- `bun run typecheck` — en la raíz vía turbo: `tsc --noEmit` en las apps TS y `mypy app` en `apps/api-py`.
- `bun run test` — en `apps/api-py` corre pytest (`uv run pytest`; un módulo: `uv run pytest tests/test_orders.py`).
- `bun run lint` — en `apps/api-py`, `ruff check app tests`. En `admin-web` (eslint) **hoy falla** porque no resuelve `eslint-plugin-react-hooks`; arreglarlo antes de montar CI (Fase 14).
- `bun run build` — build de producción de las apps TS (dependencias en orden vía turbo).
- Formato: TypeScript con `node_modules/.bin/prettier --write <archivos>` desde la raíz; Python con `uv run ruff format app tests` en `apps/api-py`.
