# Pedidos (Fase 8 + 10)

Código en `app/modules/orders/`.

## Modelo

- Carrito 1:1 por `Conversation`; pedido con snapshot de ítems.
- Canal `Order.channel`: `whatsapp` (default) o `in_store`.
- Estados: `draft` → `confirmed` → `awaiting_payment` → `paid` → `preparing` → `shipped` → `delivered` | `cancelled` (transiciones en `STATUS_TRANSITIONS`). Hoy el flujo de WhatsApp entra directo en `awaiting_payment`; `draft` / `confirmed` no se usan.
- El stock se descuenta en el checkout y se repone al cancelar.

## Bot

- Botones del carrito (`cart:*`, `variant:<id>`) y, si el cliente escribe, intenciones en `order_intent.py` antes del modelo: `agregar`, `ver/vaciar carrito`, `confirmar pedido`, seguimiento (`ORD-…` / "dónde está mi pedido").
- Si el hilo sigue en `pending` y el mensaje ya es una consulta de producto, entra al bot sin esperar "bot" o "asesor". Un saludo suelto sigue mostrando el menú.
- `confirmar pedido` → `begin_checkout`: orden `awaiting_payment` con `checkoutToken`.
- Mensajes al cliente: `format_cart_message` (`with_instructions=False` cuando va con botones) y `format_order_confirmation_message` (`include_link=False` cuando el enlace va en el botón Pagar).

## Checkout público

- `/checkout/[token]` (público, `GET|POST /api/v1/checkout/:token`): el cliente completa el envío y paga con [Mercado Pago](pagos.md).
- El enlace dura 48 h.

## Ventas en tienda

`POST /orders/in-store`: estado `delivered`, sin Mercado Pago.

## Permisos y admin

- `operateOrders` (listar, cambiar estado, carrito, venta en tienda) para owner/manager/user; `manageOrders` (cancelar) para owner/manager.
- Admin: `/orders` (filtro por canal, enlace desde Conversaciones) y `/sales` (venta de mostrador).

## Pendiente

Los mensajes del carrito y la confirmación usan 2 decimales fijos y no el formato de moneda local (`format_money`) del resto de la app.
