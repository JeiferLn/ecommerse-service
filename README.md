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

- NestJS
- TypeScript
- Prisma ORM
- PostgreSQL

---

## Inteligencia Artificial

- OpenAI API
- Embeddings
- pgvector
- RAG (Retrieval Augmented Generation)

---

## WhatsApp

- WhatsApp Cloud API

---

## Base de Datos

- PostgreSQL

---

## ORM

- Prisma

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

                  NestJS

 ┌────────────┬────────────┬────────────┐
 │            │            │            │
Auth     Products      AI       Payments
 │            │            │            │
 └────────────┴────────────┴────────────┘
                       │
                  PostgreSQL
                       │
                    Prisma
```

---

# Arquitectura del Proyecto

```
commerce-ai/

apps/

    admin-web/

    backend/

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
- NestJS
- PostgreSQL
- Prisma
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
- Permisos (matriz de capacidades por rol; sin módulo/tabla Permission — ver `docs/CONVENTIONS.md`)
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

- Dashboard empresa (`/dashboard`): KPIs de catálogo, stock, miembros y gráficas
- Dashboard plataforma (`/admin`): KPIs globales, altas y empresas recientes
- Placeholders de ventas/clientes/conversaciones hasta Fases 5 / 8

---

# Fase 5 — Integración con WhatsApp (Twilio)

Objetivo:

Conectar la plataforma con WhatsApp vía **Twilio**, multi-tenant, con modo simulación para desarrollo local.

Incluye (implementado):

- Modelo `WhatsAppConnection` (1:1 empresa) con `twilioWhatsAppNumber` + `Conversation` + `Message`
- Credenciales de plataforma en `.env` (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`); número por empresa en DB
- Webhook único público (`POST /api/v1/whatsapp/webhook`) — tenant por `To` (número Twilio)
- CRUD de conexión por empresa (`/whatsapp/connection`)
- Inbox: listar conversaciones, hilo y envío manual de texto
- `POST /whatsapp/webhook/simulate` + `WHATSAPP_SIMULATE_SEND` para desarrollar sin llamadas reales
- Auto-reply configurable; con `AI_ENABLED=true` responde la IA (Fase 6)
- Admin: `/dashboard/whatsapp` (conexión + simular) e `/dashboard/whatsapp/inbox`

Pendiente hasta Twilio/prod real:

- Validación punta a punta con sandbox o sender aprobado + ngrok
- Firma `X-Twilio-Signature` con `TWILIO_WEBHOOK_URL` público
- Plantillas / ventana 24h (reglas de WhatsApp vía Twilio)

Cómo probar en local:

1. Poner `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` (o dejar `WHATSAPP_SIMULATE_SEND=true`)
2. Guardar conexión con el número sandbox/sender (`+14155238886`)
3. Simular mensaje entrante desde el admin o `POST /whatsapp/webhook/simulate`
4. Ver conversación + auto-reply en el inbox

Webhook real (sandbox):

1. ngrok/cloudflared → backend `:4000`
2. En Twilio Sandbox: When a message comes in → `POST https://<host>/api/v1/whatsapp/webhook`
3. `join` desde tu WhatsApp al sandbox y escribe al número

---

# Fase 6 — Inteligencia Artificial ✅ (prototipo cerrado)

**Estado:** cerrada como **prototipo / demo**. No es production-ready.

Objetivo:

Responder preguntas sobre productos del catálogo activo vía WhatsApp (simulate o webhook).

Incluye (implementado):

- Módulo `ai/` con `AiChatProvider` (OpenRouter + mock)
- Contexto de productos `active` por empresa + historial corto del hilo
- Enganche en auto-reply de WhatsApp cuando `AI_ENABLED=true`
- Fallback fijo (`AI_FALLBACK_TEXT`) si la IA falla, basura/CoT, o pide humano (`[HANDOFF]`)
- Routing bot / asesor (`pending` → `bot` | `human`) + reactivación desde inbox
- Envíos configurables en `/dashboard/settings` (país, alcance, transportadoras) inyectados al prompt; el pago será por pasarela
- Tests unitarios de provider, catálogo y reply

Configuración (development / demo):

1. Key en [openrouter.ai](https://openrouter.ai) → `OPENROUTER_API_KEY` en `apps/backend/.env`
2. Modelo típico de demo: `AI_MODEL=openrouter/free` (variable; calidad no garantizada)
3. Productos **activos** + (recomendado) envíos/pagos en Configuración
4. Simular mensaje en `/dashboard/whatsapp` y ver la respuesta en el inbox

Sin key: `AI_PROVIDER=mock` o `AI_ENABLED=false` (vuelve al texto fijo de Fase 5).

Alcance del prototipo (aceptado a propósito):

- Demo con simulate + modelo free; el tono/precisión pueden fallar
- Sin entrenamiento fino ni evaluación sistemática de calidad
- Sin WhatsApp Cloud real ni App Review

Pendiente para producción (futuro, fuera del cierre de esta fase):

- Modelo de pago estable en OpenRouter (o proveedor dedicado) + key de prod
- Credenciales Meta reales (Callback URL, firma, Graph) — ver Fase 5 pendiente
- Mejoras de prompt / evaluación; RAG (Fase 7) y pedidos (Fase 8)

Fuera de alcance de Fase 6: RAG/documentos (Fase 7), settings de IA por empresa, streaming.

---

# Fase 7 — RAG ✅

**Estado:** MVP con **4 PDFs obligatorios** en Configuración (sin documentos opcionales ni texto libre).

Objetivo:

Permitir responder usando documentos de la empresa (guía, FAQ, garantías, políticas) además del catálogo.

Incluye (implementado):

- Modelos `KnowledgeDocument` + `KnowledgeChunk` con **pgvector** (extensión `vector`, embeddings 1536)
- Un PDF por tipo y empresa (`@@unique([companyId, type])`): `guide`, `faq`, `warranty`, `policy`
- Subida PDF → extracción de texto → chunk → embedding (OpenRouter o mock) → DB
- Retrieval top-k por similitud coseno (fallback léxico) inyectado en `AiReplyService`
- API `GET /api/v1/knowledge`, `PUT /api/v1/knowledge/:type/file`, `DELETE /api/v1/knowledge/:type` (`owner`/`manager`, capability `manageKnowledge`)
- Admin: sección **Conocimiento** en `/dashboard/settings#conocimiento` (sin nav lateral)
- **Prerequisito WhatsApp:** envíos configurados **y** los 4 PDFs activos con `fileKey`

Cómo probar:

1. En Configuración → Conocimiento, subir los 4 PDFs (texto seleccionable, no escaneados)
2. Configurar envíos si aún no lo están
3. Simular WhatsApp: “¿puedo devolver a los 10 días?”
4. El bot debe basarse en el texto indexado; preguntas de producto siguen usando el catálogo

Env: `EMBEDDING_PROVIDER`, `EMBEDDING_MODEL`, `EMBEDDING_DIMENSIONS`, `RAG_TOP_K`, `RAG_CHUNK_SIZE`, `RAG_CHUNK_OVERLAP` (reutiliza `OPENROUTER_API_KEY`).

Fuera de este MVP: OCR / PDFs escaneados, DOCX, settings de IA por empresa.

---

# Fase 8 — Pedidos

Objetivo:

Administrar compras desde WhatsApp.

Incluye:

- Carrito
- Pedido
- Estados
- Historial

---

# Fase 9 — Pagos

Objetivo:

Permitir pagos en línea.

Incluye:

- Pasarela de pagos
- Payment Links
- Webhooks
- Confirmación automática

---

# Fase 10 — Suscripciones

Objetivo:

Modelo SaaS.

Incluye:

- Planes
- Suscripciones
- Renovaciones
- Facturación
- Límites

---

# Fase 11 — Escalabilidad

Objetivo:

Preparar el sistema para producción.

Incluye:

- Redis
- BullMQ
- Cache
- Rate Limiting
- Logs
- Monitoreo
- Optimización

---

# Módulos del Backend

- Auth
- Users
- Companies
- Roles (matriz `ROLE_CAPABILITIES` en `@commerce-ai/types`; sin tabla Permission)
- Dashboard (stats empresa + plataforma)
- Products / Categories / Inventory (stock en variantes)
- Storage (R2 o local en desarrollo)
- Customers *(roadmap)*
- Conversations / Messages *(roadmap)*
- AI / Knowledge (RAG)
- Orders / Payments / Billing / Subscriptions *(roadmap)*

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

# Puesta en Marcha

Requisitos: Node.js 20+, pnpm 9+, Docker.

```bash
pnpm install        # instalar dependencias del monorepo
pnpm docker:up      # levantar PostgreSQL (pgvector) + Redis
pnpm dev            # backend en :4000 y admin-web en :3000
```

Otros comandos:

```bash
pnpm build          # build de producción (turborepo, en orden de dependencias)
pnpm lint           # eslint en todo el monorepo
pnpm typecheck      # tsc --noEmit en todas las apps
pnpm test           # unit tests del backend
pnpm format         # prettier --write
```

Endpoints disponibles:

- `GET http://localhost:4000/api/v1/health` — estado del backend y la base de datos.
- `http://localhost:3000` — landing del admin-web.
