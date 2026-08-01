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
```

## Estructura

```
src/
  config/    # validación de variables de entorno
  health/    # endpoint de salud (GET /api/v1/health)
  prisma/    # PrismaModule y PrismaService (global)
```

## Endpoints

- `GET /api/v1/health` — estado del servicio y de la base de datos.
