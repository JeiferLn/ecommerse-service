# Dashboards (Fase 4)

Dos superficies separadas:

## Empresa (`/`, página `overview`)

- Para miembros de la tienda (`owner` / `manager` / `user`) con `companyId`. Capacidad `viewDashboard`.
- Stats: `GET /api/v1/company/stats`.
- KPIs de catálogo, stock, miembros y pedidos; ingresos cobrados; conteos por canal (WhatsApp vs tienda) y la puesta en marcha (onboarding) de la tienda.

## Plataforma (`/admin`, `/admin/companies`)

- Solo rol global `admin`; el staff no usa capacidades de tenant.
- Stats: `GET /api/v1/admin/stats`.
- KPIs globales, series de altas de 30 días, empresas recientes y asignación de número propio de WhatsApp (ver [WhatsApp](whatsapp.md#número-propio)).
- `/admin/settings`: número compartido y modo de envío de WhatsApp (ver [Configuración de plataforma](whatsapp.md#configuración-de-plataforma-adminsettings)).
