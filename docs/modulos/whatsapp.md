# WhatsApp (Twilio + preparación Tech Provider)

Código en `app/modules/whatsapp/`. Los botones y listas están en [Mensajes interactivos](interactivos.md).

## Arquitectura

- 1 cuenta Twilio de plataforma (`TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` en `apps/api-py/.env`). Más adelante, subcuenta por empresa vía Tech Provider.
- 1 `WhatsAppConnection` por empresa con:
  - `connectionKind`: `own_number` (BYO / Free) o `platform_number` (planes de pago).
  - `onboardingStatus`: `pending` | `awaiting_meta` | `registering` | `online` | `failed`.
  - `twilioWhatsAppNumber`: sender E.164 cuando el canal está `online`.
- El enum legacy `mode` sigue en Postgres (`dedicated` en filas nuevas); no forma parte del contrato público.

## Planes

| Plan | Flujo |
|------|--------|
| Free | Playground en la app + «Conectar WhatsApp» (número propio vía Embedded Signup cuando Meta/Tech Provider esté listo). |
| Pro / Business | Solicitan un **número de la plataforma** (`POST /whatsapp/number-request` con `kind=platform_number`). En Fase 1 el admin lo asigna a mano. |

El número compartido con código de tienda (`/w/[code]`) **ya no existe**. Las tiendas que lo usaban deben reconectar con el flujo nuevo.

## Webhook

- Único: `POST /api/v1/whatsapp/webhook` (público), body form-urlencoded; responde TwiML vacío (`text/xml`).
- Valida `X-Twilio-Signature` salvo `TWILIO_SKIP_SIGNATURE=true` fuera de production (requiere `TWILIO_WEBHOOK_URL`).
- Enrutamiento: `To` debe coincidir con `WhatsAppConnection.twilioWhatsAppNumber` de una conexión `online`. Sin match → error controlado (no se crea conversación).

## Conectar número propio (Free / BYO)

- `POST /whatsapp/connect/start` (owner): inicia onboarding `own_number` → `awaiting_meta`.
- `POST /whatsapp/connect/complete` (owner): recibe el resultado de Embedded Signup; en Fase 1 persiste `registering` y deja documentado el camino a subcuenta + Senders API + `online`.
- `GET /whatsapp/connect/status`: estado + flags públicas de Meta (`techProviderReady`, `metaAppId`, configId).
- Si faltan `TWILIO_TECH_PROVIDER_ENABLED` + `META_APP_ID` + `META_APP_SECRET` + `META_EMBEDDED_SIGNUP_CONFIG_ID`, el backend responde *«La conexión con Meta aún no está disponible»*.

## Número de plataforma (pago)

- La tienda pide con `POST /whatsapp/number-request` `{ kind: "platform_number" }` (solo si `planCode != free`). `GET` / `DELETE` consultan o cancelan.
- El admin asigna con `PUT /admin/companies/:id/whatsapp-connection`: valida Senders API (`ONLINE`), marca `connectionKind=platform_number`, `onboardingStatus=online` y cierra la solicitud.
- El enlace `wa.me` siempre apunta al **sender** (`twilioWhatsAppNumber`), no a un teléfono de contacto de la tienda.
- Unicidad del sender dedicado: índice único parcial sobre `twilioWhatsAppNumber` (declarado en `app/models.py`).

## Envío

- `twilio_client.py` (`send_text`, `send_media`, `send_content`) → Messages API.
- `credentials_for_connection(connection)` hoy usa la cuenta global; mañana usará la subcuenta de la conexión.
- No llama a Twilio si el modo simulado está activo o el SID/token es dummy/`test-`. El modo simulado se elige en `/admin/settings` (solo fuera de production) o con `WHATSAPP_SIMULATE_SEND`.
- Las fotos salen con `storage.external_url` (ver [Catálogo](catalogo.md#imágenes)).

## Simulación

`POST /api/v1/whatsapp/webhook/simulate` (owner/manager, solo fuera de production) inyecta el mismo flujo de ingestión. Ojo: si la tienda tiene un número real, la respuesta sí sale por Twilio.

## Inbox

- Conversaciones y mensajes aislados por `companyId` (excluye `isPlayground`).
- Respuesta automática fija o con [IA](ia.md) según `AI_ENABLED`.
- Handler `pending` | `bot` | `human`; el asesor puede tomar el chat o devolverlo al bot.
- Capacidades `canManageWhatsapp` / `canViewWhatsapp`. Admin: `/whatsapp` (canal) y `/whatsapp/inbox` (Conversaciones).

## Prerrequisitos

Para activar el canal: un producto activo, envíos configurados y Mercado Pago conectado (`assert_whatsapp_prerequisites`). Los documentos de [conocimiento](conocimiento.md) no bloquean. El admin muestra todos los pendientes juntos con `SetupRequirements`.

## Prueba tu asistente (playground)

- `GET|POST|DELETE /api/v1/assistant/playground[/messages]` (owner/manager). Una `Conversation` con `isPlayground: true` y `waConnectionId: null` por empresa; no aparece en Conversaciones.
- Reutiliza `WhatsAppWebhookService.reply_in_playground` (mismo routing, IA, carrito e interactivos), pero no llama a Twilio ni consume cupo de WhatsApp (sí el de IA).
- Exige productos y envíos, no Mercado Pago.

## Configuración de plataforma (`/admin/settings`)

- `GET|PATCH /api/v1/admin/platform-settings` (solo `admin`): modo simulado de envío; `null` vuelve al valor del `.env`.
- Solo lectura: si hay credenciales, URL del webhook, validación de firma, interactivos y plantilla de pago. El SID y el token nunca salen del `.env`.
- Caché de 10 s en `app/modules/platform/overrides.py`.

## Meta Tech Provider (checklist externo)

Pendiente fuera de Fase 1 (código ya deja el espacio):

1. App Meta + Embedded Signup config (`META_*`).
2. Twilio como Tech Provider (`TWILIO_TECH_PROVIDER_ENABLED=true`).
3. Exchange del `code` de Embedded Signup → token Meta.
4. Subcuenta Twilio por empresa + registro del sender (Senders API) + webhook.
5. Compra automática de número para planes de pago.
6. Plantillas Content SID por subcuenta.

## Fuera de alcance por ahora

- Diferenciación Pro vs Business en WhatsApp (mismo flujo de número de plataforma).
- Widget webchat público (sigue el playground interno).
- Mensajes fuera de la ventana de 24 h (solo existe la plantilla de pago).
- **Imágenes entrantes**: el webhook aún no lee `NumMedia` / `MediaUrl0` (Fase 13).
