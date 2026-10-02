# Seguridad operativa

- En `production`, `COOKIE_SECURE=true` y `JWT_SECRET` no puede ser el valor `dev-only` del example.
- Rate limit (slowapi, `app/core/rate_limit.py`, en memoria por IP): 10 req/min (`AUTH_LIMIT`) en login/register/forgot/reset; 120 req/min global en el resto.
- Imágenes: validación por magic bytes; en production el upload exige R2 (sin disco local ni `/uploads` estático).
- `admin-web` necesita `JWT_SECRET` (el mismo del backend) para verificar el JWT en el middleware.
- Webhooks públicos:
  - Twilio: se valida `X-Twilio-Signature` (ver [WhatsApp](../modulos/whatsapp.md#webhook)).
  - Mercado Pago: se revalida el pago contra su API (monto y moneda) antes de marcar `paid` (ver [Pagos](../modulos/pagos.md)).
- Autorización de endpoints: ver las reglas en [Autenticación y roles](autenticacion.md#reglas-al-añadir-endpoints).
