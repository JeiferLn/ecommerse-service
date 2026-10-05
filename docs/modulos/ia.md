# IA (Fase 6 — prototipo cerrado)

Código en `app/modules/ai/`.

## Proveedores

- Abstraídos detrás de `AiChatProvider` (`providers.py`, `get_chat_provider()`); nunca acoplar lógica de negocio a un SDK de proveedor.
- Por defecto **OpenRouter** (`AI_PROVIDER=openrouter`) vía HTTP compatible con chat completions. `AI_PROVIDER=gemini` usa la API de Gemini (`GEMINI_API_KEY`; sin key vuelve a OpenRouter). `AI_PROVIDER=mock` para tests.

## Flujo

1. Inbound de WhatsApp → routing del handler.
2. Las intenciones de carrito y los botones se resuelven **antes** de llamar al modelo (ver [Pedidos](pedidos.md#bot) e [Interactivos](interactivos.md)).
3. `generate_reply` (`reply.py`): catálogo `active` + [RAG](conocimiento.md) + historial + bloque de envíos.
4. Outbound.

- Si falla, devuelve basura, responde `[HANDOFF]` o no hay productos: se envía `AI_FALLBACK_TEXT` y el hilo queda en el inbox.
- `GenerateReplyResult` incluye `suggested_product_ids` (máx. 10) cuando la pregunta es de producto o de catálogo; el webhook los convierte en tarjeta (1) o lista (varios).
- Comercio: país, alcances y transportadoras en `Company` (UI `/settings/shipping`). El pago va por [Mercado Pago](pagos.md); el bot no inventa otros medios de pago.

## Prompts

Separados del servicio: `prompts.py` (`build_sales_assistant_system_prompt`) y `commerce_prompt.py` (bloque de envíos).

## Configuración

`AI_ENABLED`, `AI_PROVIDER` (`openrouter` | `openai` | `gemini` | `mock`), `OPENROUTER_API_KEY`, `GEMINI_API_KEY`, `AI_BASE_URL`, `AI_MODEL` (demo típico `openrouter/free`; con Gemini, `gemini-2.5-flash` si el modelo configurado no empieza por `gemini`), `AI_MAX_PRODUCTS`, `AI_HISTORY_LIMIT`, `AI_FALLBACK_TEXT`, `AI_HTTP_REFERER`, `AI_APP_TITLE`.

## Pendiente

- Prod: modelo de pago + key real y Twilio WhatsApp real; no asumir la calidad del modelo free.
- Sin UI de settings de IA por empresa.
