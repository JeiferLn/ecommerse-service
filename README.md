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
- Permisos
- Configuración inicial

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

Mostrar información del negocio.

Incluye:

- KPIs
- Gráficas
- Ventas
- Productos
- Clientes

---

# Fase 5 — Integración con WhatsApp

Objetivo:

Conectar la plataforma con WhatsApp.

Incluye:

- WhatsApp Cloud API
- Recepción de mensajes
- Envío de mensajes
- Webhooks
- Conversaciones

---

# Fase 6 — Inteligencia Artificial

Objetivo:

Responder preguntas sobre productos.

Incluye:

- Integración OpenAI
- Contexto de productos
- Respuestas inteligentes
- Búsquedas

---

# Fase 7 — RAG

Objetivo:

Permitir responder usando documentos de la empresa.

Incluye:

- Embeddings
- pgvector
- Documentos
- FAQs
- Políticas
- Garantías

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
- Roles
- Permissions
- Products
- Categories
- Inventory
- Customers
- Conversations
- Messages
- AI
- Documents
- Orders
- Payments
- Billing
- Subscriptions

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

Construir una plataforma SaaS profesional que permita a cualquier empresa vender automáticamente mediante WhatsApp utilizando Inteligencia Artificial, manteniendo una arquitectura escalable, modular y preparada para crecer sin necesidad de rehacer el sistema.# Commerce AI SaaS

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
- Permisos
- Configuración inicial
- Configuración Enviar Emails de usuarios

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

Mostrar información del negocio.

Incluye:

- KPIs
- Gráficas
- Ventas
- Productos
- Clientes

---

# Fase 5 — Integración con WhatsApp

Objetivo:

Conectar la plataforma con WhatsApp.

Incluye:

- WhatsApp Cloud API
- Recepción de mensajes
- Envío de mensajes
- Webhooks
- Conversaciones

---

# Fase 6 — Inteligencia Artificial

Objetivo:

Responder preguntas sobre productos.

Incluye:

- Integración OpenAI
- Contexto de productos
- Respuestas inteligentes
- Búsquedas

---

# Fase 7 — RAG

Objetivo:

Permitir responder usando documentos de la empresa.

Incluye:

- Embeddings
- pgvector
- Documentos
- FAQs
- Políticas
- Garantías

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
- Roles
- Permissions
- Products
- Categories
- Inventory
- Customers
- Conversations
- Messages
- AI
- Documents
- Orders
- Payments
- Billing
- Subscriptions

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