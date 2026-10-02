# Base de datos (SQLAlchemy + Alembic)

## Modelos

- Esquema en `apps/api-py/app/models.py` (única fuente de verdad).
- Tablas `"PascalCase"` y columnas camelCase (heredado). Los nombres de índices, uniques y FKs siguen la convención de la base (`naming_convention` + bloque de `Index(...)` al final del archivo).
- Modelos normalizados, con índices para las columnas consultadas por igualdad o por tenant.
- Todas las tablas multi-tenant incluyen la columna de aislamiento del tenant (`companyId`).

## Migraciones

1. Editar `models.py`.
2. `bun run db:revision "<descripcion>"` (o `uv run alembic revision --autogenerate -m …`).
3. Revisar el archivo generado en `alembic/versions/`.
4. `bun run db:migrate`.

Reglas:

- `uv run alembic check` debe quedar sin diferencias.
- Nunca se edita una migración ya aplicada.
- La revisión base (`20261002000000`) ejecuta `alembic/baseline.sql`, el esquema heredado de las migraciones de Prisma. La tabla `_prisma_migrations` se ignora.

## Seed

Idempotente (usuario `admin@admin.com` y planes free/pro/business): `bun run db:seed` (`uv run python -m app.seed`).
