# Documentación de Commerce AI SaaS

Convenciones y referencia técnica para todo desarrollo en el proyecto. El estado por fases y la puesta en marcha están en el [README de la raíz](../README.md).

## General

| Documento                                         | Contenido                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------ |
| [Monorepo](general/monorepo.md)                   | Estructura de carpetas, gestores (pnpm, uv, turbo), naming, commits |
| [Autenticación y roles](general/autenticacion.md) | Roles, matriz de capacidades, reglas para endpoints, sesión        |
| [Seguridad](general/seguridad.md)                 | Producción, rate limit, uploads, webhooks públicos                 |
| [Entorno y verificación](general/entorno.md)      | Variables de entorno, typecheck, tests, lint y formato             |

## Backend (`apps/api-py`)

| Documento                                 | Contenido                                               |
| ----------------------------------------- | ------------------------------------------------------- |
| [Arquitectura](backend/arquitectura.md)   | Módulos, núcleo, respuestas, validación, sesión de base |
| [Base de datos](backend/base-de-datos.md) | Modelos SQLAlchemy, migraciones Alembic, seed           |

## Frontend (`apps/admin-web`)

| Documento                              | Contenido                                               |
| -------------------------------------- | ------------------------------------------------------- |
| [Next.js](frontend/nextjs.md)          | App Router, grupos y rutas, sesión y refresh, errores   |
| [Diseño del admin](frontend/diseno.md) | Layout, primitivas UI, patrones compartidos, pendientes |

## Módulos de producto

| Documento                                        | Fase   | Contenido                                           |
| ------------------------------------------------ | ------ | --------------------------------------------------- |
| [Catálogo](modulos/catalogo.md)                  | 3      | Categorías, productos, variantes, imágenes          |
| [Dashboards](modulos/dashboards.md)              | 4      | Overview de la tienda y panel de plataforma         |
| [WhatsApp](modulos/whatsapp.md)                  | 5      | Twilio, BYO/plataforma, inbox, playground, Tech Provider |
| [Mensajes interactivos](modulos/interactivos.md) | 5      | Botones, listas, tarjetas y botón de pago           |
| [IA](modulos/ia.md)                              | 6      | Proveedores, flujo de respuesta, prompts            |
| [Conocimiento (RAG)](modulos/conocimiento.md)    | 7      | PDFs, chunking, embeddings, retrieval               |
| [Pedidos](modulos/pedidos.md)                    | 8 + 10 | Carrito, checkout, estados, ventas en tienda        |
| [Pagos](modulos/pagos.md)                        | 9      | Mercado Pago por tienda, preferencia y webhook      |
| [Suscripciones](modulos/suscripciones.md)        | 11     | Planes, límites, consumo y cobro de la plataforma   |
