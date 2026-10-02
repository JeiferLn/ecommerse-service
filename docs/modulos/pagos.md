# Pagos (Fase 9 — Mercado Pago)

Código en `app/modules/payments/` y `app/integrations/mercadopago.py`. El cobro de la suscripción de la plataforma está en [Suscripciones](suscripciones.md).

## Conexión por tienda

- Cada tienda conecta **su** cuenta (`MercadoPagoConnection`, 1:1), por OAuth de la plataforma (`MP_CLIENT_ID` / `MP_CLIENT_SECRET` / `MP_REDIRECT_URI`) o pegando un Access Token.
- Solo `owner`. UI: `/settings/payments`.
- El dinero llega a la cuenta de la tienda.
- Sin Mercado Pago conectado no se puede activar el canal de WhatsApp (el playground sí funciona).

## Cobro de pedidos

1. `/checkout/[token]` crea una preferencia Checkout Pro con el token del comercio.
2. Webhook: `POST /api/v1/payments/mercadopago/webhook` (público; URL desde `MP_WEBHOOK_URL` o `API_PUBLIC_URL`).
3. Antes de marcar `paid`, consulta el pago en Mercado Pago y valida monto y moneda.
4. Avisa al cliente por WhatsApp.

## Desarrollo local

Mercado Pago exige URLs de retorno HTTPS: en local, `API_PUBLIC_URL` con ngrok.
