# Arquitectura del backend (`apps/api-py`)

## Stack

FastAPI + Pydantic v2 + SQLAlchemy 2 async (asyncpg, pgvector) + Alembic. httpx para APIs externas (Twilio, Mercado Pago, OpenRouter), boto3 para R2, aiosmtplib para correo y slowapi para rate limit.

## Módulos

- Un paquete por dominio en `app/modules/<dominio>/`:
  - `router.py` — delgado: valida la entrada y delega.
  - `service.py` — lógica de negocio, clase `XService(session)`.
  - Utilidades puras en archivos propios, con sus tests en `tests/test_<dominio>.py`.
- Los routers se registran en `app/modules/__init__.py`.
- Lógica de negocio y acceso a datos solo en services, nunca en routers. Sin imports circulares entre módulos.

## Núcleo (`app/core/`)

| Archivo         | Responsabilidad                                                    |
| --------------- | ------------------------------------------------------------------ |
| `config.py`     | `Settings`: variables de entorno validadas al arrancar             |
| `db.py`         | Sesión por request (`DbSession`)                                   |
| `errors.py`     | `ApiError` y helpers `bad_request` / `not_found` / `forbidden` …   |
| `responses.py`  | `ok(data, message)`                                                |
| `schemas.py`    | `RequestModel` (cuerpo) / `QueryModel` (query)                     |
| `validation.py` | Validadores con mensajes en español                                |
| `security.py`   | Cookies JWT, `CurrentUser`, `require_roles`, `require_capability`  |
| `storage.py`    | R2 o disco local (ver [Catálogo](../modulos/catalogo.md#imágenes)) |
| `rate_limit.py` | Límites de slowapi                                                 |
| `ids.py`        | `new_id()` (cuid), `utcnow()`, `iso()`                             |

## Contrato HTTP

- Respuestas con la forma de `ApiResponse<T>` de `@commerce-ai/types`:
  - Éxito: `ok(...)` → `{ status: "success", data, message? }`.
  - Cualquier error (incluida la validación): `{ status: "error", data: null, message }`.
- Entrada con `RequestModel` / `QueryModel`: JSON camelCase y sin campos extra (400 `property X should not exist`).
- Los mensajes de validación van en español con los helpers de `validation.py` (`string`, `text`, `integer`, `money`, `boolean`, `matches`, `one_of`); el admin los muestra tal cual.
- Los `POST` que crean responden 201 (`status_code=201`); los webhooks, 200.
- Si una respuesta cambia de forma, cambia en `packages/types` y en el diccionario que devuelve el service a la vez.
- Datos compartidos con el frontend (capacidades por rol, países, geografía de Colombia) viven como JSON en `packages/types/src/data/` y los leen TypeScript y Python.

## Datos

- Una sesión de base de datos por request (`expire_on_commit=False`); el service hace `commit` explícito y `rollback` si captura una excepción para seguir respondiendo.
- Ids `cuid` con `new_id()`, fechas UTC sin zona en milisegundos con `utcnow()` (`updatedAt` lo pone la app) y serialización con `iso()`.
- Esquema y migraciones: ver [Base de datos](base-de-datos.md).
