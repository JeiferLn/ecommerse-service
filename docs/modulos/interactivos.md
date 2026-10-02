# Mensajes interactivos (WhatsApp)

## Modelo

- `Message.interactive` (JSON, tipo `MessageInteractive` en `@commerce-ai/types`):
  - Salientes: `buttons`, `list`, `product_card`, `link_button`.
  - Entrante: `reply` (el toque del cliente).
- `body` siempre guarda el texto que vio el cliente.
- Se arman solo con los constructores de `app/modules/whatsapp/interactive.py`, que ya recortan a los límites de WhatsApp (`WA_LIMITS`): 3 botones de 20 caracteres; lista de 10 opciones con título 24, descripción 72 y botón 20; cuerpo 1024.

## IDs de acción

- `handler:bot|human`, `cart:view|checkout|continue|clear`, `add:yes|no`, `variant:<id>`, `product:<id>` (entidad `[a-z0-9_-]{1,64}`).
- El inbound los trae en `ButtonPayload` / `ListId`, y el simulador en `actionId`.
- Cada ID tiene su respuesta fija en `_handle_action` (no pasa por la IA).
- Si el cliente escribe el número o el título exacto de una opción del último mensaje del bot, cuenta como tocarla (`resolve_typed_action`).

## Cuándo se envía cada uno

| Situación                       | Interactivo                            |
| ------------------------------- | -------------------------------------- |
| Conversación pendiente          | Botones bot / asesor                   |
| Carrito con productos           | Botones Confirmar / Seguir / Vaciar    |
| La IA sugiere 1 producto        | Tarjeta (imagen con caption + botones) |
| La IA sugiere varios            | Lista de variantes con stock           |
| La IA ofrece agregar al carrito | Sí / No                                |
| Checkout                        | Botón Pagar pedido                     |

## Envío

- `TwilioContentService` (`twilio_content.py`) crea el contenido en la Content API (`twilio/quick-reply` o `twilio/list-picker`, más `twilio/text` de respaldo) y lo cachea por hash en `WhatsAppContentTemplate`; el cuerpo es la variable `{{1}}`.
- Si `WHATSAPP_INTERACTIVE_ENABLED=false`, la Content API falla o no hay plantilla, se manda `render_as_fallback_text` (opciones numeradas). El flujo nunca se corta por un interactivo.

### Pagar pedido

- Usa la plantilla aprobada `TWILIO_CHECKOUT_CONTENT_SID` (botón URL `…/checkout/{{1}}`, con `{{1}}` = token).
- Su cuerpo es fijo, así que el resumen del pedido se envía antes como texto.
- Sin plantilla, sale el mensaje de siempre con el enlace.

## Admin

- `ChatMessageBubble` pinta los interactivos al estilo WhatsApp (`chat-interactive.tsx`; la lista abre un drawer dentro de `ChatSurface`).
- Con `onAction` se pueden tocar (Prueba tu asistente envía `{ text, actionId }`); sin él son de solo lectura (Conversaciones: el asesor no envía botones).
