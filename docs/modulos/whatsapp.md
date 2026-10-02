# WhatsApp (Fase 5 — Twilio)

Código en `app/modules/whatsapp/`. Los botones y listas están en [Mensajes interactivos](interactivos.md).

## Arquitectura

- 1 cuenta Twilio de plataforma (`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` en `apps/api-py/.env`).
- 1 `WhatsAppConnection` por empresa con `mode` `shared` | `dedicated`.

## Webhook

- Único: `POST /api/v1/whatsapp/webhook` (público), body form-urlencoded; responde TwiML vacío (`text/xml`).
- Valida `X-Twilio-Signature` salvo `TWILIO_SKIP_SIGNATURE=true` fuera de production (requiere `TWILIO_WEBHOOK_URL`).
- El tenant se resuelve en `_resolve_inbound_connection` de `webhook_service.py` (ver enrutamiento).

## Número compartido (plan Free / arranque)

- `TWILIO_SHARED_WHATSAPP_NUMBER` es un sender de la plataforma que comparten todas las tiendas sin número propio.
- La tienda lo activa sola con `POST /whatsapp/connection/shared` (solo `owner`, exige los [prerrequisitos](#prerrequisitos)). Se crea una conexión `shared` con `storeCode` único (slug del nombre, `-2`, `-3`… si choca).
- Enlace de la tienda: `wa.me/<compartido>?text=Hola <Tienda> #<storeCode>`.

### Enrutamiento del inbound

1. Conexión `dedicated` cuyo `twilioWhatsAppNumber` = `To`.
2. Si `To` es el compartido, `#codigo` del mensaje → tienda. Se guarda/actualiza `SharedNumberSession` (1 por cliente) y el primer mensaje del bot lleva "Estás hablando con _Tienda_.".
3. Sin código, la tienda de la sesión del cliente.
4. Si no hay ninguna, respuesta genérica desde el compartido y **no** se crea conversación.

El código se quita del texto guardado. Un cliente solo está en una tienda a la vez en el compartido: el último código manda.

## Número propio

- Lo asigna la plataforma (`PUT /admin/companies/:id/whatsapp-connection`): pasa la conexión a `dedicated`, borra `storeCode` y sesiones compartidas, y rechaza el número compartido.
- `twilioWhatsAppNumber` no es único por sí solo: la unicidad entre dedicados es un índice único **parcial** (`WhatsAppConnection_dedicated_number_key`, `WHERE mode = 'dedicated'`) declarado en `app/models.py`; no lo quites.

## Envío

- `twilio_client.py` (`send_text`, `send_media`, `send_content`) → Messages API: texto, imagen con `MediaUrl` y contenido con `ContentSid`.
- No llama a Twilio si `WHATSAPP_SIMULATE_SEND=true` o el SID/token es dummy/`test-`.
- Las fotos salen con `storage.external_url` (ver [Catálogo](catalogo.md#imágenes)).

## Simulación

`POST /api/v1/whatsapp/webhook/simulate` (owner/manager, solo fuera de production) inyecta el mismo flujo de ingestión. Ojo: si la tienda tiene un número real, la respuesta sí sale por Twilio.

## Inbox

- Conversaciones y mensajes aislados por `companyId` (excluye `isPlayground`).
- Respuesta automática fija o con [IA](ia.md) según `AI_ENABLED`.
- Handler `pending` | `bot` | `human`; el asesor puede tomar el chat o devolverlo al bot.
- En el chat, el cliente va a la derecha y el bot/asesor a la izquierda.
- Capacidades `canManageWhatsapp` / `canViewWhatsapp`. Admin: `/whatsapp` (canal) y `/whatsapp/inbox` (Conversaciones).

## Prerrequisitos

Para activar el canal: un producto activo, envíos configurados y Mercado Pago conectado (`assert_whatsapp_prerequisites` en `connection_service.py`). Los documentos de [conocimiento](conocimiento.md) no bloquean. El admin muestra todos los pendientes juntos con `SetupRequirements`.

## Prueba tu asistente (playground)

- `GET|POST|DELETE /api/v1/assistant/playground[/messages]` (owner/manager). Una `Conversation` con `isPlayground: true` y `waConnectionId: null` por empresa; no aparece en Conversaciones.
- Reutiliza `WhatsAppWebhookService.reply_in_playground` (mismo routing, IA, carrito e interactivos), pero:
  - no llama a Twilio;
  - no consume cupo de WhatsApp (sí el de IA);
  - al confirmar pedido no crea la orden ni descuenta stock (responde `PLAYGROUND_CHECKOUT_TEXT` y el botón de pago sale deshabilitado como "Modo prueba").
- Exige productos y envíos, no Mercado Pago. "Reiniciar" borra mensajes y carrito y vuelve a `pending`.

## Fuera de alcance por ahora

- Subcuentas Twilio por empresa.
- Mensajes fuera de la ventana de 24 h (solo existe la plantilla de pago).
- **Imágenes entrantes**: el webhook aún no lee `NumMedia` / `MediaUrl0` (Fase 13).
