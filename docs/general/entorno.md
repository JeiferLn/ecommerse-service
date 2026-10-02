# Entorno y verificación

## Variables de entorno

- Cada app tiene `.env.example` versionado y `.env` / `.env.local` ignorado por git.
  - Backend: `apps/api-py/.env` (plantilla `apps/api-py/.env.example`).
  - Admin: `apps/admin-web/.env.local` (plantilla `apps/admin-web/.env.example`): `NEXT_PUBLIC_API_URL` (por defecto `http://localhost:4000`) y `JWT_SECRET`.
- Nunca comprometer secretos ni valores reales.
- Toda variable nueva del backend se declara en `Settings` de `app/core/config.py` (con default si es opcional) y en `apps/api-py/.env.example`.
- Las variables propias de cada módulo están en su documento (por ejemplo [IA](../modulos/ia.md#configuración) o [Conocimiento](../modulos/conocimiento.md#configuración)).

## Verificación

Desde la raíz, vía turbo (o dentro de cada app):

| Comando             | Qué hace                                                                   |
| ------------------- | -------------------------------------------------------------------------- |
| `bun run typecheck` | `tsc --noEmit` en las apps TS y `mypy app` en `apps/api-py`                |
| `bun run test`      | pytest en `apps/api-py` (un archivo: `uv run pytest tests/test_orders.py`) |
| `bun run lint`      | `ruff check app tests` en `apps/api-py`; eslint en `admin-web`             |
| `bun run build`     | build de producción de las apps TS (dependencias en orden)                 |

Formato: TypeScript con `node_modules/.bin/prettier --write <archivos>` desde la raíz; Python con `uv run ruff format app tests` en `apps/api-py`.

**Pendiente:** el lint de `admin-web` falla porque no resuelve `eslint-plugin-react-hooks`; arreglarlo antes de montar CI (Fase 14).
