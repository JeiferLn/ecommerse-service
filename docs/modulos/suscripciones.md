# Suscripciones (Fase 11)

Código en `app/modules/billing/`.

## Planes y límites

- Planes `free` / `pro` / `business` (`Plan`, creados por el seed) con límites: `maxMembers`, `maxProducts`, `maxVariants`, `maxWaMessagesMonth`, `maxAiRepliesMonth`, `maxKnowledgeDocs`.
- `Subscription` 1:1 por empresa.
- Consumo mensual en `UsageCounter` (`periodKey` UTC `YYYY-MM`: `waInboundCount`, `aiReplyCount`).

## Estados

`trialing` (Free 15 días) → `active` | `trial_expired` | `past_due` | `canceled`. `cancelAtPeriodEnd` mantiene el acceso hasta `currentPeriodEnd`.

## Cobro de la plataforma

- Mercado Pago Preapproval (`billingInterval` `month` | `year`). El plan guarda `priceUsdCents` mensual y la API expone también `priceYearUsdCents`.
- Registro Pro/Business: se guarda una `PendingRegistration` y la cuenta se crea al volver del pago.

## Enforcement (en backend, no en UI)

- `BillingService.assert_can(...)` antes de crear productos, variantes, miembros o documentos, y antes de conectar WhatsApp.
- `record_wa_inbound` / `record_ai_reply` por mensaje (el playground solo consume IA).
- Cupo agotado → texto fijo al cliente, nunca un error.

## API y admin

- `GET /billing/plans` (público), `GET /billing/subscription`, `POST /billing/checkout`, `POST /billing/cancel`.
- UI: `/pricing`, registro, `/billing` y banner de prueba/vencimiento.
