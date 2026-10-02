# Commerce AI SaaS

> Plataforma SaaS de comercio conversacional con Inteligencia Artificial para WhatsApp.

---

# Descripción

Commerce AI SaaS es una plataforma multiempresa (Multi-Tenant) que permite a cualquier negocio conectar su cuenta de WhatsApp y disponer de un asistente de ventas basado en Inteligencia Artificial.

El sistema es capaz de:

- Atender clientes automáticamente.
- Mostrar productos.
- Responder preguntas sobre productos.
- Buscar productos mediante lenguaje natural.
- Recomendar productos.
- Generar pedidos.
- Enviar enlaces de pago.
- Consultar documentos mediante RAG.
- Administrar múltiples empresas desde una misma plataforma.

Cada empresa paga una suscripción mensual para utilizar el servicio.

---

# Objetivos del Proyecto

- Arquitectura escalable.
- Código limpio y modular.
- Fácil mantenimiento.
- Multiempresa (Multi-Tenant).
- Preparado para miles de empresas.
- Backend desacoplado de la IA.
- Fácil cambio de proveedor de IA.
- Fácil integración con múltiples pasarelas de pago.

---

# Stack Tecnológico

## Frontend

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- TanStack Query
- React Hook Form
- Zod

---

## Backend

- Python 3.12 + FastAPI
- Pydantic v2 (validación y configuración)
- SQLAlchemy 2 (async, asyncpg)
- Alembic (migraciones)
- uv (dependencias y entorno)
- PostgreSQL

---

## Inteligencia Artificial

- OpenAI API
- Embeddings
- pgvector
- RAG (Retrieval Augmented Generation)

---

## WhatsApp

- Twilio WhatsApp (Messages API; no Cloud API / Graph)

---

## Base de Datos

- PostgreSQL

---

## ORM

- SQLAlchemy 2 + Alembic

---

## Archivos

- Cloudflare R2

---

## Cache

- Redis

---

## Jobs

- BullMQ

---

## Contenedores

- Docker
- Docker Compose

---

## Monitoreo

- Sentry

---

## Analítica (Futuro)

- PostHog

---

# Arquitectura General

```
                    Next.js

                       │

                 REST API

                       │

                  FastAPI

 ┌────────────┬────────────┬────────────┐
 │            │            │            │
Auth     Products      AI       Payments
 │            │            │            │
 └────────────┴────────────┴────────────┘
                       │
                  SQLAlchemy
                       │
                  PostgreSQL
```

---

# Arquitectura del Proyecto

```
commerce-ai/

apps/

    admin-web/    # Next.js

    api-py/       # FastAPI

packages/

    ui/

    types/

    config/

docker/

docs/

scripts/
```

---

# Filosofía del Proyecto

Este proyecto se desarrolla siguiendo los siguientes principios:

- Arquitectura antes que código.
- Código modular.
- Alta cohesión.
- Bajo acoplamiento.
- Escalable desde el primer día.
- No generar deuda técnica innecesaria.
- Cada fase debe dejar un producto funcional.

---

# Roadmap

---

# Fase 0 — Arquitectura

Objetivo:

Preparar toda la infraestructura del proyecto.

Incluye:

- Monorepo
- Next.js
- Backend API (NestJS al inicio; hoy FastAPI, ver "Migración a Python")
- PostgreSQL
- ORM (Prisma al inicio; hoy SQLAlchemy + Alembic)
- Docker
- Variables de entorno
- Git
- Arquitectura inicial
- Convenciones

Resultado esperado:

Proyecto listo para comenzar el desarrollo.

---

# Fase 1 — Autenticación

Objetivo:

Sistema completo de autenticación.

Incluye:

- Login
- Registro
- Recuperar contraseña
- JWT
- Refresh Token
- Roles
- Usuarios

---

# Fase 2 — Empresas (Multi-Tenant)

Objetivo:

Permitir que múltiples empresas utilicen la plataforma.

Incluye:

- Empresas
- Usuarios por empresa
- Roles
- Permisos (matriz de capacidades por rol; sin módulo/tabla Permission — ver [docs/general/autenticacion.md](docs/general/autenticacion.md))
- Configuración inicial
- Envío de emails de plataforma (SMTP global, no por empresa)

---

# Fase 3 — Catálogo

Objetivo:

Administración completa de productos.

Incluye:

- Productos
- Categorías
- Variantes
- Inventario
- Imágenes

---

# Fase 4 — Dashboard

Objetivo:

Mostrar información del negocio (empresa) y de la plataforma (staff).

Incluye:

- Dashboard empresa (`/`): checklist de primeros pasos, ingresos por canal (WhatsApp / tienda), pedidos, catálogo, stock y miembros
- Dashboard plataforma (`/admin`): KPIs globales, altas y empresas recientes; listado en `/admin/companies`
- Pendiente: entidad Customer (métricas de clientes)

---

# Fase 5 — Integración con WhatsApp (Twilio) ✅

**Estado:** MVP cerrado. Funciona en **dispositivo móvil real** (sender Twilio/Meta aprobado + webhook).

Objetivo:

Conectar la plataforma con WhatsApp vía **Twilio**, multi-tenant, con modo simulación para desarrollo local.

Incluye (implementado):

- Modelo `WhatsAppConnection` (1:1 empresa) con `twilioWhatsAppNumber` + `Conversation` + `Message`
- Credenciales de plataforma en `.env` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`); número por empresa en DB
- Webhook único público (`POST /api/v1/whatsapp/webhook`) — tenant por `To` (número Twilio)
- CRUD de conexión por empresa (`/whatsapp/connection`)
- Inbox: listar conversaciones, hilo y envío manual de texto
- `POST /whatsapp/webhook/simulate` + `WHATSAPP_SIMULATE_SEND` para desarrollar sin llamadas reales (sin gastar mensajes)
- Auto-reply configurable; con `AI_ENABLED=true` responde la IA (Fase 6)
- Admin: `/whatsapp` (conexión + simular), `/whatsapp/inbox` (Conversaciones) y `/assistant/playground` (Prueba tu asistente, sin WhatsApp ni Twilio)
- **Validación punta a punta en celular** con sender aprobado + ngrok → backend `:4000`

Pendiente solo para endurecer producción (fuera del cierre MVP):

- Firma `X-Twilio-Signature` con `TWILIO_WEBHOOK_URL` fijo (en local se puede usar `TWILIO_SKIP_SIGNATURE=true`)
- Dominio/hosting estable (sin ngrok)
- Plantillas / ventana 24h (reglas de WhatsApp vía Twilio)

Cómo probar en local (sin gastar WhatsApp):

1. `WHATSAPP_SIMULATE_SEND=true`
2. Guardar conexión con el número del sender
3. Simular mensaje entrante desde el admin
4. Ver conversación + auto-reply en el inbox

Webhook real (móvil):

1. ngrok/cloudflared → backend `:4000`
2. En Twilio (sender): When a message comes in → `POST https://<host>/api/v1/whatsapp/webhook`
3. `TWILIO_WEBHOOK_URL` igual a esa URL; `WHATSAPP_SIMULATE_SEND=false`
4. Escribir desde el celular al número de la tienda

Número compartido de la plataforma (plan Free, sin esperar número propio):

1. En `apps/api-py/.env`: `TWILIO_SHARED_WHATSAPP_NUMBER=+1…` (el sender de Twilio). Ese número no puede estar asignado como número propio de ninguna tienda.
2. Reiniciar el backend
3. Con productos, envíos y Mercado Pago listos, el dueño pulsa **Activar canal** en `/whatsapp` y copia su enlace (`…?text=Hola <Tienda> #codigo`)
4. Abrir el enlace en el celular y enviar el mensaje: el bot responde "Estás hablando con _Tienda_." y sigue el flujo normal. Escribir al compartido sin código y sin sesión previa devuelve un mensaje genérico.

Mensajes interactivos (botones, listas, tarjeta de producto y botón de pago):

1. Con `WHATSAPP_INTERACTIVE_ENABLED=true` (por defecto) los botones y listas se crean solos en la Content API de Twilio la primera vez que se usan y quedan cacheados; no requieren aprobación porque van dentro de la ventana de 24 h.
2. Botón **Pagar pedido** (opcional): en Twilio Console → Content Template Builder, crea una plantilla _Call to action_ con un cuerpo fijo (ej. "Tu pedido está listo. Completa tus datos de envío y paga aquí:"), un botón URL "Pagar pedido" con la URL `https://<FRONTEND_URL>/checkout/{{1}}` (dominio fijo y `{{1}}` solo al final) y envíala a aprobación de WhatsApp. Cuando esté aprobada, pon su SID en `TWILIO_CHECKOUT_CONTENT_SID=HX…`. Sin ella, el cliente recibe el enlace como texto.
3. Para apagar los interactivos y volver a texto con opciones numeradas: `WHATSAPP_INTERACTIVE_ENABLED=false`.
4. En **Prueba tu asistente** los botones y listas se pueden tocar; en **Conversaciones** se ven tal como le llegaron al cliente, junto con la opción que eligió.

---

# Fase 6 — Inteligencia Artificial ✅ (prototipo cerrado)

**Estado:** cerrada como **prototipo / demo**. Ya corre también sobre WhatsApp real (Fase 5). No es production-ready (calidad del modelo).

Objetivo:

Responder preguntas sobre productos del catálogo activo vía WhatsApp (simulate o webhook real).

Incluye (implementado):

- Módulo `ai/` con `AiChatProvider` (OpenRouter + mock)
- Contexto de productos `active` por empresa + historial corto del hilo
- Enganche en auto-reply de WhatsApp cuando `AI_ENABLED=true`
- Fallback fijo (`AI_FALLBACK_TEXT`) si la IA falla, basura/CoT, o pide humano (`[HANDOFF]`)
- Routing bot / asesor (`pending` → `bot` | `human`) + reactivación desde inbox
- Envíos configurables en `/settings/shipping` (país, alcance, transportadoras, ubicación) inyectados al prompt
- La IA puede sugerir productos (`suggestedProductIds`) que el bot muestra como lista o tarjeta interactiva
- Tests unitarios de provider, catálogo y reply

Configuración (development / demo):

1. Key en [openrouter.ai](https://openrouter.ai) → `OPENROUTER_API_KEY` en `apps/api-py/.env`
2. Modelo típico de demo: `AI_MODEL=openrouter/free` (variable; calidad no garantizada)
3. Productos **activos** + envíos/conocimiento en Configuración
4. Simular en `/whatsapp` o escribir desde el celular

Sin key: `AI_PROVIDER=mock` o `AI_ENABLED=false` (vuelve al texto fijo de Fase 5).

Alcance del prototipo (aceptado a propósito):

- Modelo free; el tono/precisión pueden fallar
- Sin entrenamiento fino ni evaluación sistemática de calidad

Pendiente para producción (futuro, fuera del cierre de esta fase):

- Modelo de pago estable en OpenRouter (o proveedor dedicado) + key de prod
- Mejoras de prompt / evaluación
- Settings de IA por empresa, streaming

Fuera de alcance de Fase 6: RAG/documentos (Fase 7), settings de IA por empresa, streaming.

---

# Fase 7 — RAG ✅

**Estado:** MVP completo (4 PDFs opcionales que mejoran las respuestas). Listo para uso en simulate y WhatsApp real.

Objetivo:

Permitir responder usando documentos de la empresa (guía, FAQ, garantías, políticas) además del catálogo.

Incluye (implementado):

- Modelos `KnowledgeDocument` + `KnowledgeChunk` con **pgvector** (extensión `vector`, embeddings 1536)
- Un PDF por tipo y empresa (`@@unique([companyId, type])`): `guide`, `faq`, `warranty`, `policy`
- Subida PDF → extracción de texto → chunk → embedding (OpenRouter o mock) → DB
- Retrieval top-k por similitud coseno (fallback léxico) inyectado en `AiReplyService`
- API `GET /api/v1/knowledge`, `PUT /api/v1/knowledge/:type/file`, `DELETE /api/v1/knowledge/:type` (`owner`/`manager`, capability `manageKnowledge`)
- Admin: página **Conocimiento** en `/knowledge` (en el menú lateral)
- **Prerequisitos WhatsApp:** al menos un producto activo, envíos configurados y Mercado Pago conectado ("Prueba tu asistente" no exige Mercado Pago). Los documentos son opcionales y todos los planes pueden subir los 4.

Cómo probar:

1. En Conocimiento, subir uno o más PDFs (texto seleccionable, no escaneados)
2. Configurar envíos si aún no lo están
3. Simular o WhatsApp real: “¿puedo devolver a los 10 días?”
4. El bot debe basarse en el texto indexado; preguntas de producto siguen usando el catálogo

Env: `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `RAG_TOP_K`, `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP` (reutiliza `OPENROUTER_API_KEY`).

Fuera de este MVP (no bloquea el cierre): OCR / PDFs escaneados, DOCX, settings de IA por empresa.

---

# Fase 8 — Pedidos ✅

**Estado:** MVP completo. Carrito + pedido desde WhatsApp, checkout público por link, validación de cobertura de envío. Pago real vía Mercado Pago (Fase 9).

Objetivo:

Administrar compras desde WhatsApp y operarlas en el admin.

Incluye (implementado):

- Modelos `Cart` / `CartItem` (1 carrito por conversación) y `Order` / `OrderItem` (snapshot de líneas)
- Estados: `draft` → `confirmed` → `awaiting_payment` → `paid` → `preparing` → `shipped` → `delivered` | `cancelled`
- Checkout descuenta stock; cancelar repone si el stock se había descontado
- API: listado/detalle/estado/cancelar + carrito/checkout por `conversationId`
- Bot con botones (agregar, elegir variante, ver/vaciar carrito, confirmar, pagar) y, si el cliente escribe, intenciones `agregar…`, `quiero 2`, `pedir una` (con historial), confirmación `sí` tras oferta, `ver carrito`, `vaciar carrito`, `confirmar pedido`
- Tras `confirmar pedido`: orden `awaiting_payment` + `checkoutToken` + link `{FRONTEND_URL}/checkout/{token}`
- Página pública `/checkout/[token]`: resumen + país/depto/municipio (selects) + dirección + **Pagar** (Mercado Pago Checkout Pro)
- Validación de cobertura (local vs nacional vs internacional) contra ubicación base de la tienda
- API pública: `GET/POST /api/v1/checkout/:token` (sin JWT)
- Admin: `/orders` + enlace desde inbox; KPIs de pedidos en dashboard

Cómo probar:

1. Producto activo con stock; envíos con país + depto + municipio base
2. Bot (simulate o móvil): agregar producto → `ver carrito` → `confirmar pedido`
3. Abrir el link `/checkout/...` → llenar envío → **Pagar** (requiere Mercado Pago conectado en la empresa)
4. Ver pedido en `/orders` (estado `paid`, con dirección)

Fuera de este MVP (roadmap): flete calculado, entidad Customer.

---

# Fase 9 — Pagos ✅

Objetivo:

Reemplazar el stub de pago del checkout público por una pasarela real.

Alcance actual: **Latinoamérica** con **Mercado Pago** (AR, BR, CL, CO, MX, PE, UY). Más adelante se podrán sumar otros proveedores.

Incluye:

- Mercado Pago (Checkout Pro) **por empresa** (OAuth o Access Token manual)
- Webhooks de confirmación
- Confirmación automática del estado `paid`
- País de la empresa en el registro (países con soporte MP); depto/municipio en configuración
- WhatsApp bloqueado hasta conectar Mercado Pago

Estado MVP actual:

- ✅ SDK + OAuth de plataforma (`MP_CLIENT_ID` / `MP_CLIENT_SECRET` / `MP_REDIRECT_URI`)
- ✅ Conexión por empresa (OAuth o pegar Access Token) en Configuración → Pagos
- ✅ Preferencia de pago desde `/checkout/[token]` con token del comercio → Checkout Pro
- ✅ Webhook → marcar `paid` + validación monto/moneda + WhatsApp de confirmación
- ✅ Checkout bloqueado si ya pagó o el link expiró
- ✅ WhatsApp requiere Mercado Pago conectado
- ✅ WhatsApp al enviar / entregar / cancelar

Setup plataforma (app en [developers.mercadopago.com](https://www.mercadopago.com/developers)):

1. Crea una aplicación Checkout Pro
2. Define Redirect URI = `MP_REDIRECT_URI` (en local: ngrok del API + `/api/v1/payments/mercadopago/oauth/callback`)
3. Copia Application ID → `MP_CLIENT_ID`, Client Secret → `MP_CLIENT_SECRET`
4. Webhook: `API_PUBLIC_URL` o `MP_WEBHOOK_URL` (`…/api/v1/payments/mercadopago/webhook`)

Cada dueño conecta **su** cuenta en Configuración → Pagos (botón OAuth o Access Token de prueba). El dinero del pedido llega a esa cuenta.
---

# Fase 10 — Ventas físicas ✅

**Estado:** MVP ligero (POS admin). Ventas de mostrador sobre la misma entidad `Order`, con impacto en stock e ingresos del dashboard.

Objetivo:

Que dueños y operadores registren lo vendido en tienda física para unificar inventario y finanzas con el canal WhatsApp.

Incluye (implementado):

- Canal `Order.channel`: `whatsapp` | `in_store` (+ método de pago en tienda: efectivo / tarjeta / transferencia / otro)
- `POST /orders/in-store`: líneas desde catálogo, descuenta stock, estado `delivered` (sin checkout ni Mercado Pago)
- Cancelación de ventas de tienda (owner/manager) repone stock
- Admin: `/sales` + filtro/badge por canal en Pedidos
- Dashboard: ingresos cobrados y conteos por canal (WhatsApp vs tienda)

---

# Fase 11 — Suscripciones ✅

**Estado:** MVP. Trial Free 15 días, planes Pro/Business con suscripción recurrente Mercado Pago (mensual/anual), límites enforced, cancelación al fin de periodo.

Objetivo:

Modelo SaaS con prueba acotada y upgrade de pago recurrente.

Incluye (implementado):

- Planes `free` / `pro` / `business` (seed) + `Subscription` 1:1 por empresa + `UsageCounter` mensual
- Registro **Free**: crea la cuenta al instante (trial 15 días)
- Registro **Pro/Business**: no crea User/Company hasta que Mercado Pago autorice el Preapproval (`PendingRegistration`); al volver del pago se crea la cuenta y se inicia sesión en `/login`
- Suscripción MP Preapproval (plataforma): mensual o anual (anual = 10× mensual, 2 meses gratis)
- `GET /billing/plans`, `GET /billing/subscription`, `POST /billing/checkout`, `POST /billing/cancel`
- Cancelar renovación en cualquier momento; acceso hasta `currentPeriodEnd`, luego `canceled`
- Enforcement: productos, variantes, miembros, knowledge, conectar WhatsApp, cupos WA/IA
- Tras trial: `trial_expired`; periodo vencido sin renovación: `past_due` (features gated + banner)
- UI: `/pricing` (toggle mensual/anual), registro, Facturación, banner
- Local: `API_PUBLIC_URL` (ngrok HTTPS) + `MP_TEST_PAYER_EMAIL` (comprador de prueba) para sandbox

---

# Fase 12 — Diseño y organización del admin (casi cerrada)

**Estado:** rediseño aplicado; quedan detalles de pulido. Reglas en [docs/frontend/diseno.md](docs/frontend/diseno.md).

Hecho:

- App shell único: layout `(company)` con sidebar en desktop y `MobileNav` en móvil, `PageHeader` en todas las páginas
- Rutas sin `/dashboard` (el prefijo viejo redirige); cada sección tiene su ruta: `/products`, `/categories`, `/orders`, `/sales`, `/whatsapp`, `/whatsapp/inbox`, `/assistant/playground`, `/knowledge`, `/settings`, `/settings/payments`, `/settings/shipping`, `/members`, `/billing`
- Primitivas: Table, Sheet, Dialog, Dropdown, Select, Segmented, Skeleton, EmptyState, StatusPill (sin `<select>` nativo)
- Pedidos con panel lateral, Conversaciones tipo chat a alto de viewport, Prueba tu asistente con botones y listas tocables
- Checklist de primeros pasos y `SetupRequirements` con todos los requisitos pendientes juntos
- Revisado en móvil (390 px)

Pendiente de pulir:

- `window.confirm` en billing, categorías, conocimiento, miembros, Mercado Pago y editor de producto → diálogo de confirmación
- No hay toasts para confirmar acciones guardadas
- Algunos "Cargando…" que deberían ser `Skeleton`
- Montos del bot con `toFixed(2)` en vez del formato de moneda del admin

Fuera de alcance: rebranding de marketing/landing, dark mode obligatorio, app móvil, rediseño del checkout público.

---

# Fase 13 — Entrenamiento del bot y visión (imágenes)

**Estado:** parcial. Los botones y listas interactivos ya resuelven las acciones de compra sin pasar por el modelo; falta visión y la batería de casos.

Hecho: acciones por botón con IDs deterministas (`cart:*`, `variant:<id>`, `product:<id>`), sugerencias de productos desde la IA y Prueba tu asistente para probar el flujo sin WhatsApp.

Hoy: inbound **solo texto** (foto sin `Body` se descarta; no se lee `NumMedia`). El bot **sí envía** fotos del catálogo (Twilio `MediaUrl`). Matching de producto es léxico (tokens/sinónimos), no visión. Cuando el cliente escribe en vez de tocar, siguen las heurísticas frágiles: carrito vs “quiero ver”, handoff “humano/asesor”, catálogo sesgado a ropa, `maxTokens: 220`.

Objetivo:

Hacer el asistente más fiable en ventas y que **entienda imágenes** que el cliente mande por WhatsApp (foto de producto, talla, captura) — siempre dentro de la tienda.

Incluye:

- Golden cases / tests de las fallas conocidas (carrito, confirmación, handoff, fuera de tema, catálogo vs RAG)
- Ajuste de prompts, routing e intenciones (sin alucinar políticas ni precios)
- Webhook: leer `NumMedia` / `MediaUrl0`; persistir `type: "image"` + caption; no dropear foto sin texto
- Descargar media Twilio (auth) y modelo vision vía OpenRouter (`image_url` en el chat)
- Mapear la foto al catálogo o pedir el nombre si no identifica; no ser un GPT genérico de imágenes
- Simulate + inbox: poder probar inbound con imagen
- Límites: jpg/png/webp, tamaño, fallback si la visión falla

Fuera de alcance: fine-tuning propio, CLIP/embeddings de `ProductImage` (nice-to-have), OCR legal, generación de imágenes, stickers/audio como canal principal.

Resultado esperado:

Menos saltos en texto; el cliente puede mandar una foto y el bot intenta relacionarla con la tienda.

---

# Fase 14 — Primer prototipo a producción (ex Fase 12)

**Estado:** pendiente. Depende de Fases 12 (diseño) y 13 (bot + imágenes).

Hoy: Redis corre en Docker **pero la app no lo usa**. No hay BullMQ, Helmet, Sentry, Dockerfiles, CI ni `admin-web/.env.example`. Sí hay CORS, rate limit in-memory (slowapi, 120/min), cookies seguras, validación de env en production, health de Postgres (siempre `ok` aunque la DB esté down) y R2 obligatorio en prod.

Objetivo:

Primer **despliegue piloto** usable (dominio + WhatsApp real + pagos), no un rewrite.

Incluye (bloquea el piloto):

- Dockerfiles + arranque prod (`admin-web` + `api-py` + Postgres pgvector + Redis)
- Arreglar `lint` de admin-web y montar CI: lint / typecheck / test / build (ruff, mypy y pytest en api-py) + `alembic upgrade head`
- `apps/admin-web/.env.example`; health que falle si la DB está down
- Helmet, `trust proxy`, `SkipThrottle` en `/health` y webhooks (Twilio/MP)
- Checklist env: Twilio firma + URL fija (sin ngrok), R2, SMTP, MP, JWT, `FRONTEND_URL` / CORS
- Runbook: cómo subir, rollback, backup mínimo de DB

Incluye (después del primer up, o si hay réplicas):

- Redis real: cache + throttler compartido
- BullMQ: webhooks / IA / indexación fuera del request HTTP
- Logs JSON + Sentry (API + Next)

Fuera de alcance del piloto: multi-región, autoscaling agresivo, PostHog, SLA enterprise.

Resultado esperado:

Piloto desplegable con observabilidad básica y sin ngrok.

---

# Módulos del Backend

- Auth
- Users
- Companies
- Roles (matriz en `packages/types/src/data/capabilities.json`, la misma para admin-web y api-py; sin tabla Permission)
- Dashboard (stats empresa + plataforma)
- Products / Categories / Inventory (stock en variantes)
- Storage (R2 o local en desarrollo)
- Customers _(roadmap)_
- Conversations / Messages (WhatsApp)
- AI / Knowledge (RAG)
- Orders (carrito + pedidos WhatsApp; ventas `in_store` en Fase 10; Payments en Fase 9)
- Payments / Billing / Subscriptions (trial 15d; Pro/Business recurrente MP mensual/anual; cancel al fin de periodo)

---

# Flujo General

```
Cliente

↓

WhatsApp

↓

Webhook

↓

Backend

↓

Buscar Empresa

↓

Buscar Conversación

↓

Buscar Productos

↓

IA

↓

Respuesta

↓

WhatsApp
```

---

# Objetivo Final

Construir una plataforma SaaS profesional que permita a cualquier empresa vender automáticamente mediante WhatsApp utilizando Inteligencia Artificial, manteniendo una arquitectura escalable, modular y preparada para crecer sin necesidad de rehacer el sistema.

---

# Migración a Python ✅

El backend NestJS se portó a **FastAPI + SQLAlchemy 2 (async)** en `apps/api-py`, módulo por módulo y sin cambiar el contrato: mismo prefijo `/api/v1`, mismas rutas (86), mismas respuestas `{ status, data, message }` y mensajes de error (si falta un campo obligatorio se informa un mensaje en vez de todos), mismas cookies de sesión (JWT HS256, bcrypt) y la misma base de datos. Cada módulo se comparó contra Nest con la misma sesión antes del corte.

En el corte (octubre 2026):

- Se eliminó `apps/backend` (NestJS + Prisma); el backend vuelve a correr en `:4000`.
- El esquema pasó a Alembic: la migración base (`apps/api-py/alembic/baseline.sql`) es el historial SQL de Prisma, y los modelos de `app/models.py` coinciden con la base (`alembic check` sin diferencias), así que `--autogenerate` ya es fiable.
- Una base creada antes del corte se marca una sola vez con `uv run alembic stamp head`; una base nueva se crea con `uv run alembic upgrade head`.
- La tabla `_prisma_migrations` queda como histórico y Alembic la ignora.
- El seed (`uv run python -m app.seed`) crea el admin de plataforma y los planes, igual que el de Prisma.
- Webhooks: el túnel (ngrok) de `TWILIO_WEBHOOK_URL`, `MP_WEBHOOK_URL` y `API_PUBLIC_URL` apunta a `:4000`.

---

# Puesta en Marcha

Requisitos: Node.js 20+, Bun 1.4+, Python 3.12+, [uv](https://docs.astral.sh/uv/getting-started/installation/) en el `PATH`, Docker.

```bash
bun install                                   # dependencias del monorepo (admin-web y paquetes)
bun run docker:up                             # PostgreSQL (pgvector) + Redis
cd packages/types && bun run build && cd -    # compilar los tipos compartidos
cp apps/api-py/.env.example apps/api-py/.env  # y completar los valores
cd apps/api-py && uv sync && uv run alembic upgrade head && uv run python -m app.seed && cd -
bun run dev                                   # api-py en :4000 y admin-web en :3000
```

Otros comandos:

```bash
bun run build       # build de producción (turborepo, en orden de dependencias)
bun run typecheck   # tsc --noEmit en admin-web y mypy en api-py
bun run test        # pytest en api-py
bun run lint        # eslint en admin-web (hoy falla; ver Fase 14) y ruff en api-py
bun run format      # prettier --write
```

Base de datos (desde `apps/api-py`):

```bash
uv run alembic revision --autogenerate -m "describe el cambio"   # tras editar app/models.py; revisar el archivo generado
uv run alembic upgrade head                                      # aplicar migraciones
uv run python -m app.seed                                        # admin de plataforma + planes (idempotente)
```

Endpoints disponibles:

- `GET http://localhost:4000/api/v1/health` — estado del backend y la base de datos.
- `http://localhost:3000` — landing del admin-web.
