# Commerce AI SaaS — Backend

API REST de la plataforma. NestJS 11 + Prisma + PostgreSQL.

## Scripts

```bash
pnpm dev            # desarrollo con watch
pnpm build          # compilar a dist/
pnpm lint           # eslint
pnpm typecheck      # tsc --noEmit
pnpm test           # unit tests (jest)
pnpm test:e2e       # e2e tests
pnpm prisma:generate
pnpm prisma:migrate # migrate dev
pnpm prisma:studio
pnpm prisma:seed    # crea el admin admin@admin.com / admin@admin.com
```

## Estructura

```
src/
  auth/      # autenticación (login, registro, refresh, logout, guards)
  common/    # decoradores, filtros y utilidades compartidas
  config/    # validación de variables de entorno
  health/    # endpoint de salud (GET /api/v1/health)
  mail/      # envío de correos (Nodemailer + SMTP, modo preview en dev)
  prisma/    # PrismaModule y PrismaService (global)
  users/     # consultas de usuarios y mapeo a AuthUser público
test/        # e2e tests (jest + supertest)
```

## Endpoints

| Método | Ruta                           | Acceso      | Descripción                                                                    |
| ------ | ------------------------------ | ----------- | ------------------------------------------------------------------------------ |
| GET    | `/api/v1/health`               | Público     | Estado del servicio y de la base de datos.                                     |
| POST   | `/api/v1/auth/register`        | Público     | Registro: crea usuario con rol `owner` + su empresa (transaccional).           |
| POST   | `/api/v1/auth/login`           | Público     | Login, establece cookies httpOnly.                                             |
| POST   | `/api/v1/auth/refresh`         | Público     | Rota el refresh token y renueva la sesión.                                     |
| POST   | `/api/v1/auth/forgot-password` | Público     | Genera token de reset y envía el enlace por correo.                            |
| POST   | `/api/v1/auth/reset-password`  | Público     | Cambia la contraseña con el token del correo (borra tokens y revoca sesiones). |
| POST   | `/api/v1/auth/logout`          | Público     | Revoca el refresh token y limpia cookies.                                      |
| GET    | `/api/v1/auth/me`              | Autenticado | Usuario de la sesión actual.                                                   |

## Correos (Nodemailer + SMTP)

El envío usa SMTP (gratuito: Brevo 300/día, Resend 3.000/mes). Sin `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`
configurados, entra en **modo preview**: los correos se loguean en la consola del backend.
`MAIL_FROM` define el remitente. El enlace de reset apunta a `FRONTEND_URL` + `/reset-password?token=...`.

## Variables de entorno

Ver `.env.example`. Valores clave: `DATABASE_URL`, `JWT_SECRET` (mín. 32 caracteres),
`ACCESS_TOKEN_TTL_SECONDS` (900), `REFRESH_TOKEN_TTL_SECONDS` (604800),
`RESET_TOKEN_TTL_SECONDS` (3600), `FRONTEND_URL`, `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`MAIL_FROM`, `COOKIE_SECURE` (false en dev).
