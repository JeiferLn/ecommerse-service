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

- Es un sender de la plataforma que comparten todas las tiendas sin número propio. Se configura en `/admin/settings` (tabla `PlatformSettings`); `TWILIO_SHARED_WHATSAPP_NUMBER` del `.env` queda como respaldo si el panel está vacío. Al cambiarlo, las conexiones `shared` pasan al número nuevo en la misma transacción, y no se puede vaciar mientras haya tiendas usándolo.
- Siempre leerlo con `await shared_number()` (`connection_service.py`), nunca directamente del `.env`.
- La tienda lo activa sola con `POST /whatsapp/connection/shared` y `{ phoneNumber }` (solo `owner`, exige los [prerrequisitos](#prerrequisitos)). Se crea una conexión `shared` con `storeCode` único (slug del nombre, `-2`, `-3`… si choca).
- `phoneNumber` es el WhatsApp de contacto de la tienda (`displayPhoneNumber`), obligatorio. No puede ser el número compartido ni usarlo otra empresa como su WhatsApp, su número propio o en una solicitud pendiente (`_number_taken_by_other`). Lo respalda el índice único parcial `WhatsAppConnection_displayPhoneNumber_key`. Se cambia con `PUT /whatsapp/connection/phone`. No recibe al bot.
- Enlace de la tienda: `<FRONTEND_URL>/w/<storeCode>`. La ruta `app/w/[code]/route.ts` del panel consulta `GET /whatsapp/store-links/:code` (público, sin límite por IP porque llega desde el servidor de Next) y redirige a `wa.me/<compartido>?text=Hola <Tienda> #<storeCode>` con el número vigente. Así los enlaces publicados sobreviven a un cambio del número compartido.
- La tienda no ve el número compartido: `connection_dto` devuelve `twilioWhatsAppNumber: null` en modo `shared`. Solo el panel de plataforma lo recibe (`expose_shared_number=True`). El cliente final sí lo ve al abrir el chat; WhatsApp no permite ocultarlo.

### Enrutamiento del inbound

1. Conexión `dedicated` cuyo `twilioWhatsAppNumber` = `To`.
2. Si `To` es el compartido, `#codigo` del mensaje → tienda. Se guarda/actualiza `SharedNumberSession` (1 por cliente) y el primer mensaje del bot lleva "Estás hablando con _Tienda_.".
3. Sin código, la tienda de la sesión del cliente.
4. Si no hay ninguna, respuesta genérica desde el compartido y **no** se crea conversación.

El código se quita del texto guardado. Un cliente solo está en una tienda a la vez en el compartido: el último código manda.

## Número propio

- Lo asigna la plataforma (`PUT /admin/companies/:id/whatsapp-connection`): pasa la conexión a `dedicated`, borra `storeCode` y sesiones compartidas, cierra la solicitud pendiente y rechaza el número compartido.
- Antes de asignarlo valida que el sender exista en la cuenta de Twilio y que su estado empiece por `ONLINE` (`find_whatsapp_sender_status` en `twilio_client.py`, Senders API v2). Se omite si los envíos están simulados; el sandbox `+14155238886` se acepta fuera de production.
- El enlace `wa.me` de una tienda con número propio siempre va al sender: un mensaje a `displayPhoneNumber` llegaría al teléfono de la tienda, nunca a Twilio.
- Las tiendas de planes de pago lo piden con `POST /whatsapp/number-request` (solo `owner`): `{ kind: "platform_number" }` para un número empresarial nuestro o `{ kind: "own_number", phoneNumber }` para conectar el suyo por Meta. La solicitud vive en `WhatsAppNumberRequest` (1 por empresa, solo mientras está pendiente); `GET` la devuelve y `DELETE` la cancela. En `/admin/companies` aparece en "Pendientes" con `numberRequest`.
- `twilioWhatsAppNumber` no es único por sí solo: la unicidad entre dedicados es un índice único **parcial** (`WhatsAppConnection_dedicated_number_key`, `WHERE mode = 'dedicated'`) declarado en `app/models.py`; no lo quites.

## Envío

- `twilio_client.py` (`send_text`, `send_media`, `send_content`) → Messages API: texto, imagen con `MediaUrl` y contenido con `ContentSid`.
- No llama a Twilio si el modo simulado está activo o el SID/token es dummy/`test-`. El modo simulado se elige en `/admin/settings` (solo fuera de production) o con `WHATSAPP_SIMULATE_SEND`; `await credentials()` ya combina ambos.
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

## Configuración de plataforma (`/admin/settings`)

- `GET|PATCH /api/v1/admin/platform-settings` (solo `admin`). Edita el número compartido y el modo simulado; `null` vuelve al valor del `.env`.
- Muestra en solo lectura si hay credenciales, la URL del webhook para pegar en Twilio, la validación de firma, los interactivos y la plantilla de pago. El SID y el token nunca salen del `.env`.
- Los valores se leen con una caché de 10 s (`app/modules/platform/overrides.py`), así un cambio llega a todas las réplicas.

## Fuera de alcance por ahora

- Subcuentas Twilio por empresa.
- Mensajes fuera de la ventana de 24 h (solo existe la plantilla de pago).
- **Imágenes entrantes**: el webhook aún no lee `NumMedia` / `MediaUrl0` (Fase 13).
