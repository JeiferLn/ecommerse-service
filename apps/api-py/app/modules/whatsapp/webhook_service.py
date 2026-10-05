import base64
import hashlib
import hmac
import logging
import re
import time
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ApiError, bad_request, forbidden, unauthorized
from app.core.ids import new_id, utcnow
from app.core.storage import get_storage
from app.core.text import strip_accents
from app.models import Company, Conversation, Message, SharedNumberSession, WhatsAppConnection
from app.modules.ai.reply import GenerateReplyResult, generate_reply
from app.modules.billing.service import BillingService
from app.modules.orders.order_intent import (
    bot_offered_add_to_cart,
    detects_affirmative_cart_confirm,
    extract_tracked_order_number,
    is_direct_product_inquiry,
    resolve_order_chat_intent,
)
from app.modules.orders.service import OrdersService, format_cart_message
from app.modules.whatsapp import twilio_client
from app.modules.whatsapp.connection_service import WhatsAppConnectionService, shared_number
from app.modules.whatsapp.conversation_handler import (
    detects_bot_choice,
    detects_human_request,
    extract_residual_after_bot_choice,
)
from app.modules.whatsapp.interactive import (
    Interactive,
    add_confirm_buttons,
    cart_action_buttons,
    checkout_link_button,
    handler_choice_buttons,
    parse_action_id,
    product_card_interactive,
    product_list_interactive,
    render_as_fallback_text,
    resolve_typed_action,
)
from app.modules.whatsapp.message_dto import parse_interactive
from app.modules.whatsapp.phone import normalize_whatsapp_e164
from app.modules.whatsapp.store_code import extract_store_code
from app.modules.whatsapp.twilio_client import SendResult
from app.modules.whatsapp.twilio_content import TwilioContentService

logger = logging.getLogger("app.whatsapp.webhook")

SHARED_NUMBER_UNROUTED_TEXT = (
    "Hola, este es el WhatsApp de Commerce AI. Para hablar con una tienda, abre el enlace que te compartió."
)
HANDLER_CHOICE_BUTTONS_TEXT = "¡Hola! ¿Quién prefieres que te atienda?"
CONTINUE_SHOPPING_TEXT = "¡Claro! Elige otro producto de la lista o cuéntame qué buscas."
ADD_DECLINED_TEXT = "Perfecto. ¿Te ayudo con algo más?"
# Por encima, el texto va en un mensaje aparte y los botones con un cuerpo corto (WhatsApp: 1024).
INTERACTIVE_BODY_MAX = 1000
PLAYGROUND_CHECKOUT_TEXT = (
    "Modo prueba: aquí tu cliente recibiría el enlace de pago de Mercado Pago para confirmar el pedido. "
    "En la prueba no se crea el pedido ni se descuenta stock."
)
ORDER_GENERIC_ERROR = "No pude actualizar el carrito. Intenta de nuevo o pide un asesor."
GREETING_ONLY = re.compile(
    r"^(hola|buenas|buenos\s+dias|buenas\s+tardes|buenas\s+noches|hey|saludos|que\s+tal|hi|hello)[!?.\s]*$",
    re.IGNORECASE,
)
SENT_STATUSES = {"sent", "delivered", "read", "queued", "sending", "received"}


@dataclass
class InboundMessage:
    # Número Twilio al que escribió el cliente (E.164): el propio de una tienda o el compartido.
    twilio_whatsapp_number: str
    from_: str
    text: str
    # Id del botón u opción que tocó el cliente (ButtonPayload / ListId).
    action_id: str | None = None
    customer_name: str | None = None
    wamid: str | None = None
    raw_payload: Any = None


@dataclass
class OutboundMessage:
    """Mensaje que arma el bot: texto y, si aplica, botones, lista, tarjeta o enlace."""

    text: str
    interactive: Interactive | None = None
    # Texto para WhatsApp si lo interactivo no se puede enviar; por defecto `render_as_fallback_text`.
    fallback_text: str | None = None


@dataclass
class ReplyChannel:
    """Sin número Twilio = "Prueba tu asistente": no se envía nada fuera."""

    company_id: str
    twilio_whatsapp_number: str | None


@dataclass
class ResolvedInbound:
    connection: WhatsAppConnection
    # Texto del cliente sin el `#codigo` de la tienda.
    text: str
    # "Estás hablando con …" cuando el cliente entra a una tienda por el número compartido.
    store_greeting: str | None = None


@dataclass
class _ReplyState:
    outbound: list[OutboundMessage] = field(default_factory=list)
    image_urls: list[str] = field(default_factory=list)
    next_handler: str | None = None


def twilio_signature(auth_token: str, url: str, params: dict[str, str]) -> str:
    data = url + "".join(key + params[key] for key in sorted(params))
    digest = hmac.new(auth_token.encode("utf-8"), data.encode("utf-8"), hashlib.sha1).digest()
    return base64.b64encode(digest).decode("ascii")


def assert_twilio_signature(signature: str | None, params: dict[str, str]) -> None:
    """Valida X-Twilio-Signature. Requiere TWILIO_WEBHOOK_URL (URL pública exacta)
    salvo TWILIO_SKIP_SIGNATURE fuera de production."""
    settings = get_settings()
    if settings.TWILIO_SKIP_SIGNATURE and not settings.is_production:
        return
    auth_token = (settings.TWILIO_AUTH_TOKEN or "").strip()
    webhook_url = (settings.TWILIO_WEBHOOK_URL or "").strip()
    if not auth_token:
        raise unauthorized("TWILIO_AUTH_TOKEN no configurado")
    if not webhook_url:
        raise unauthorized("TWILIO_WEBHOOK_URL no configurado")
    if not signature:
        raise unauthorized("Firma de webhook Twilio ausente")
    expected = twilio_signature(auth_token, webhook_url, params)
    if not hmac.compare_digest(expected.encode("utf-8"), signature.encode("utf-8")):
        raise unauthorized("Firma de webhook Twilio inválida")


def assert_development_only() -> None:
    """Herramientas de desarrollo que no deben existir en producción."""
    if get_settings().is_production:
        raise forbidden("No disponible en producción")


def is_only_greeting(text: str) -> bool:
    return bool(GREETING_ONLY.match(strip_accents(text.lower()).strip()))


def order_error_message(error: Exception) -> str:
    if isinstance(error, ApiError) and error.status_code == 400:
        return error.message
    return ORDER_GENERIC_ERROR


class WhatsAppWebhookService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.orders = OrdersService(session)
        self.billing = BillingService(session)
        self.connections = WhatsAppConnectionService(session)

    async def handle_twilio_webhook(self, params: dict[str, str]) -> int:
        """Devuelve cuántos mensajes entrantes se procesaron (0 o 1)."""
        message_sid = params.get("MessageSid") or params.get("SmsSid") or None
        status = params.get("MessageStatus") or params.get("SmsStatus")

        # Status callback (sin Body): actualizar mensaje existente.
        if status and message_sid and not params.get("Body"):
            await self._apply_status(message_sid, status)
            return 0

        from_raw = params.get("From")
        to_raw = params.get("To")
        # Botón (quick-reply) o lista: Twilio manda el título en Body y el id en ButtonPayload / ListId.
        action_id = (
            (params.get("ButtonPayload") or "").strip() or (params.get("ListId") or "").strip() or None
        )
        body = (params.get("Body") or params.get("ButtonText") or params.get("ListTitle") or "").strip()
        if not from_raw or not to_raw or not body:
            # Puede ser un evento que no nos interesa.
            return 0

        number = normalize_whatsapp_e164(to_raw)
        customer = normalize_whatsapp_e164(from_raw)
        if not number or not customer:
            logger.warning("Twilio webhook con números inválidos To=%s From=%s", to_raw, from_raw)
            return 0

        try:
            await self.ingest_inbound(
                InboundMessage(
                    twilio_whatsapp_number=number,
                    from_=customer,
                    text=body,
                    action_id=action_id,
                    customer_name=(params.get("ProfileName") or "").strip() or None,
                    wamid=message_sid,
                    raw_payload=params,
                )
            )
        except Exception as error:  # noqa: BLE001
            # Twilio reintenta 4xx/5xx; si falta comercio o conexión, acusamos recibo sin procesar.
            await self.session.rollback()
            logger.warning("Twilio inbound no procesado: %s", error)
            return 0
        return 1

    async def simulate_inbound(
        self, company_id: str | None, *, from_: str, text: str, customer_name: str | None
    ) -> dict[str, str]:
        assert_development_only()
        if not company_id:
            raise bad_request("No perteneces a una empresa")
        await self.connections.assert_whatsapp_prerequisites(company_id)

        connection = await self.session.scalar(
            select(WhatsAppConnection).where(WhatsAppConnection.company_id == company_id)
        )
        if not connection or not connection.is_active:
            raise bad_request("Configura una conexión WhatsApp activa primero")
        customer = normalize_whatsapp_e164(from_)
        if not customer:
            raise bad_request("Número del cliente inválido (usa E.164, ej. +573001112233)")

        clean = text.strip()
        return await self._ingest_for_connection(
            ResolvedInbound(connection=connection, text=clean),
            InboundMessage(
                twilio_whatsapp_number=connection.twilio_whatsapp_number,
                from_=customer,
                text=clean,
                customer_name=(customer_name or "").strip() or None,
                wamid=f"SM_sim_in_{int(time.time() * 1000)}",
                raw_payload={"simulated": True, "from": from_, "text": text},
            ),
        )

    async def reply_in_playground(
        self, company_id: str, conversation_id: str, customer_text: str, action_id: str | None = None
    ) -> None:
        """Responde a un mensaje de "Prueba tu asistente" sin enviar nada por WhatsApp."""
        await self._maybe_auto_reply(
            ReplyChannel(company_id=company_id, twilio_whatsapp_number=None),
            conversation_id,
            "",
            customer_text,
            None,
            action_id,
        )

    async def ingest_inbound(self, message: InboundMessage) -> dict[str, str] | None:
        """Resuelve la tienda de un mensaje entrante y lo procesa.

        En el número compartido, sin código ni sesión, responde cómo llegar a una tienda y no crea
        conversación.
        """
        resolved = await self._resolve_inbound_connection(
            message.twilio_whatsapp_number, message.from_, message.text
        )
        if not resolved:
            if message.twilio_whatsapp_number == await shared_number():
                await self._reply_unrouted_shared_message(message.twilio_whatsapp_number, message.from_)
                return None
            logger.warning(
                "No active WhatsApp connection for twilioWhatsAppNumber=%s", message.twilio_whatsapp_number
            )
            raise bad_request("Conexión WhatsApp no encontrada o inactiva")
        return await self._ingest_for_connection(resolved, message)

    async def _resolve_inbound_connection(self, to: str, customer: str, text: str) -> ResolvedInbound | None:
        """Número propio → su tienda. Número compartido → tienda del `#codigo` del mensaje
        (y se recuerda para ese cliente) o, sin código, la tienda de su sesión."""
        dedicated = await self.session.scalar(
            select(WhatsAppConnection)
            .where(WhatsAppConnection.twilio_whatsapp_number == to, WhatsAppConnection.mode == "dedicated")
            .limit(1)
        )
        if dedicated:
            return ResolvedInbound(connection=dedicated, text=text)

        number = await shared_number()
        if not number or number != to:
            return None

        code, rest = extract_store_code(text)
        if code:
            target = await self.session.scalar(
                select(WhatsAppConnection)
                .where(WhatsAppConnection.store_code == code, WhatsAppConnection.mode == "shared")
                .limit(1)
            )
            if target:
                previous = await self.session.scalar(
                    select(SharedNumberSession.connection_id).where(
                        SharedNumberSession.customer_wa_id == customer
                    )
                )
                now = utcnow()
                await self.session.execute(
                    insert(SharedNumberSession)
                    .values(
                        id=new_id(),
                        customer_wa_id=customer,
                        connection_id=target.id,
                        created_at=now,
                        updated_at=now,
                    )
                    .on_conflict_do_update(
                        index_elements=["customerWaId"], set_={"connectionId": target.id, "updatedAt": now}
                    )
                )
                await self.session.commit()
                company_name = await self.session.scalar(
                    select(Company.name).where(Company.id == target.company_id)
                )
                return ResolvedInbound(
                    connection=target,
                    text=rest or text,
                    store_greeting=None if previous == target.id else f"Estás hablando con *{company_name}*.",
                )

        session_connection = await self.session.scalar(
            select(WhatsAppConnection)
            .join(SharedNumberSession, SharedNumberSession.connection_id == WhatsAppConnection.id)
            .where(SharedNumberSession.customer_wa_id == customer)
        )
        if session_connection and session_connection.mode == "shared":
            return ResolvedInbound(connection=session_connection, text=text)
        return None

    async def _reply_unrouted_shared_message(self, number: str, customer: str) -> None:
        try:
            await twilio_client.send_text(from_=number, to=customer, text=SHARED_NUMBER_UNROUTED_TEXT)
        except Exception as error:  # noqa: BLE001
            logger.error("Respuesta del número compartido falló: %s", error)

    async def _ingest_for_connection(
        self, resolved: ResolvedInbound, message: InboundMessage
    ) -> dict[str, str]:
        connection = resolved.connection
        text = resolved.text
        if not connection.is_active:
            logger.warning(
                "No active WhatsApp connection for twilioWhatsAppNumber=%s", message.twilio_whatsapp_number
            )
            raise bad_request("Conexión WhatsApp no encontrada o inactiva")

        try:
            await self.connections.assert_whatsapp_prerequisites(connection.company_id)
        except Exception as error:
            logger.warning("Inbound ignorado: empresa %s sin envíos configurados", connection.company_id)
            raise bad_request(
                "Configura envíos (país, cobertura y transportadoras) en Configuración antes de usar WhatsApp. "
                "Solo el dueño de la empresa puede hacerlo."
            ) from error

        now = utcnow()
        update_values: dict[str, Any] = {"lastMessageAt": now, "updatedAt": now}
        if message.customer_name:
            update_values["customerName"] = message.customer_name
        conversation_id = await self.session.scalar(
            insert(Conversation)
            .values(
                id=new_id(),
                company_id=connection.company_id,
                wa_connection_id=connection.id,
                customer_wa_id=message.from_,
                customer_name=message.customer_name,
                handler="pending",
                is_playground=False,
                last_message_at=now,
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_update(index_elements=["waConnectionId", "customerWaId"], set_=update_values)
            .returning(Conversation.id)
        )
        assert conversation_id is not None

        inbound = Message(
            conversation_id=conversation_id,
            direction="inbound",
            wamid=message.wamid,
            type="text",
            body=text,
            status="received",
            interactive={"kind": "reply", "actionId": message.action_id} if message.action_id else None,
            raw_payload=message.raw_payload,
        )
        self.session.add(inbound)
        await self.session.commit()

        await self._maybe_auto_reply(
            ReplyChannel(
                company_id=connection.company_id, twilio_whatsapp_number=connection.twilio_whatsapp_number
            ),
            conversation_id,
            message.from_,
            text,
            resolved.store_greeting,
            message.action_id,
        )
        return {"conversationId": conversation_id, "messageId": inbound.id}

    async def _apply_status(self, message_sid: str, status: str) -> None:
        if status in ("failed", "undelivered"):
            mapped = "failed"
        elif status in SENT_STATUSES:
            mapped = "sent"
        else:
            return
        await self.session.execute(update(Message).where(Message.wamid == message_sid).values(status=mapped))
        await self.session.commit()

    async def _maybe_auto_reply(
        self,
        channel: ReplyChannel,
        conversation_id: str,
        customer_wa_id: str,
        customer_text: str,
        store_greeting: str | None = None,
        action_id: str | None = None,
    ) -> None:
        settings = get_settings()
        playground = channel.twilio_whatsapp_number is None
        if not settings.WHATSAPP_AUTO_REPLY_ENABLED and not playground:
            return

        handler = await self.session.scalar(
            select(Conversation.handler).where(Conversation.id == conversation_id)
        )
        if handler is None:
            return

        action = await self._resolve_action(conversation_id, customer_text, action_id)
        action_type = action["type"] if action else None
        chose_bot = action_type == "handler_bot" or (not action and detects_bot_choice(customer_text))
        chose_human = action_type == "handler_human" or (not action and detects_human_request(customer_text))

        if handler == "human" and not chose_bot:
            if store_greeting:
                await self._send_outbound(
                    channel, conversation_id, customer_wa_id, OutboundMessage(store_greeting)
                )
            return

        state = _ReplyState()
        ai_enabled = settings.AI_ENABLED
        bot_confirm = settings.WHATSAPP_HANDLER_BOT_CONFIRM_TEXT
        human_confirm = settings.WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT

        async def push_bot_follow_up() -> None:
            follow_up = await self._build_bot_follow_up_after_choice(
                channel.company_id, conversation_id, "" if action else customer_text, ai_enabled
            )
            if not follow_up:
                return
            if follow_up.requested_handoff:
                state.next_handler = "human"
                state.outbound.append(OutboundMessage(human_confirm))
            else:
                await self._append_ai_reply(state, follow_up, channel.company_id)

        if handler == "human":
            state.next_handler = "bot"
            state.outbound.append(OutboundMessage(bot_confirm))
            await push_bot_follow_up()
        elif handler == "pending":
            if chose_human:
                state.next_handler = "human"
                state.outbound.append(OutboundMessage(human_confirm))
            elif chose_bot or (not action and is_direct_product_inquiry(customer_text)):
                state.next_handler = "bot"
                state.outbound.append(OutboundMessage(bot_confirm))
                await push_bot_follow_up()
            else:
                state.outbound.append(
                    OutboundMessage(
                        HANDLER_CHOICE_BUTTONS_TEXT,
                        handler_choice_buttons(),
                        settings.WHATSAPP_HANDLER_CHOICE_TEXT,
                    )
                )
        elif handler == "bot":
            if chose_human:
                state.next_handler = "human"
                state.outbound.append(OutboundMessage(human_confirm))
            else:
                wa_quota = (
                    {"allowed": True}
                    if playground
                    else await self.billing.record_wa_inbound(channel.company_id)
                )
                if not wa_quota["allowed"]:
                    state.outbound.append(
                        OutboundMessage(
                            "El negocio no puede atender por bot en este momento. Un asesor te contactará pronto."
                        )
                    )
                else:
                    commerce_reply = (
                        await self._handle_action(
                            action, channel.company_id, conversation_id, customer_text, playground
                        )
                        if action
                        else await self._try_handle_order_intent(
                            channel.company_id, conversation_id, customer_text, playground
                        )
                    )
                    if commerce_reply:
                        state.outbound.extend(commerce_reply)
                    elif ai_enabled:
                        ai_quota = await self.billing.record_ai_reply(channel.company_id)
                        if not ai_quota["allowed"]:
                            state.outbound.append(OutboundMessage(settings.WHATSAPP_AUTO_REPLY_TEXT))
                        else:
                            reply = await generate_reply(
                                self.session,
                                company_id=channel.company_id,
                                conversation_id=conversation_id,
                                customer_text=customer_text,
                            )
                            if reply.requested_handoff:
                                state.next_handler = "human"
                                state.outbound.append(OutboundMessage(human_confirm))
                            else:
                                await self._append_ai_reply(state, reply, channel.company_id)
                    else:
                        state.outbound.append(OutboundMessage(settings.WHATSAPP_AUTO_REPLY_TEXT))

        if store_greeting:
            if state.outbound:
                first = state.outbound[0]
                first.text = f"{store_greeting}\n\n{first.text}"
                if first.fallback_text:
                    first.fallback_text = f"{store_greeting}\n\n{first.fallback_text}"
            else:
                state.outbound.append(OutboundMessage(store_greeting))

        if not state.outbound and not state.image_urls:
            return

        if state.next_handler:
            await self.session.execute(
                update(Conversation)
                .where(Conversation.id == conversation_id)
                .values(handler=state.next_handler, updated_at=utcnow())
            )
            await self.session.commit()

        for message in state.outbound:
            await self._send_outbound(channel, conversation_id, customer_wa_id, message)
        for media_url in state.image_urls[:3]:
            await self._send_outbound_media(channel, conversation_id, customer_wa_id, media_url)

        await self.session.execute(
            update(Conversation)
            .where(Conversation.id == conversation_id)
            .values(last_message_at=utcnow(), updated_at=utcnow())
        )
        await self.session.commit()

    async def _resolve_action(
        self, conversation_id: str, customer_text: str, action_id: str | None
    ) -> dict[str, str] | None:
        """Acción del botón tocado; o, si escribió "2" o el título de una opción, la de esa opción."""
        direct = parse_action_id(action_id)
        if direct or len(customer_text) > 40:
            return direct
        last_interactive = await self.session.scalar(
            select(Message.interactive)
            .where(Message.conversation_id == conversation_id, Message.direction == "outbound")
            .order_by(Message.created_at.desc())
            .limit(1)
        )
        return parse_action_id(resolve_typed_action(customer_text, parse_interactive(last_interactive)))

    async def _handle_action(
        self,
        action: dict[str, str],
        company_id: str,
        conversation_id: str,
        customer_text: str,
        playground: bool,
    ) -> list[OutboundMessage] | None:
        """Respuesta determinista a un botón u opción del bot."""
        try:
            kind = action["type"]
            if kind == "handler_bot":
                return [OutboundMessage(get_settings().WHATSAPP_HANDLER_BOT_CONFIRM_TEXT)]
            if kind == "handler_human":
                return None
            if kind == "cart_view":
                return [
                    self._cart_outbound(
                        await self.orders.get_cart_for_conversation(company_id, conversation_id)
                    )
                ]
            if kind == "cart_clear":
                return [self._cart_outbound(await self.orders.clear_cart(company_id, conversation_id))]
            if kind == "cart_checkout":
                cart = await self.orders.get_cart_for_conversation(company_id, conversation_id)
                return [await self._checkout_outbound(company_id, conversation_id, cart, playground)]
            if kind == "cart_continue":
                products = await self.orders.get_suggested_products(company_id)
                listing = product_list_interactive(products)  # type: ignore[arg-type]
                return [
                    OutboundMessage(CONTINUE_SHOPPING_TEXT, listing)
                    if listing
                    else OutboundMessage("¡Claro! Cuéntame qué producto buscas.")
                ]
            if kind == "add_yes":
                handled = await self._try_handle_order_intent(
                    company_id, conversation_id, customer_text, playground, force_add=True
                )
                return handled or [OutboundMessage("No identifiqué qué producto agregar. ¿Cuál quieres?")]
            if kind == "add_no":
                return [OutboundMessage(ADD_DECLINED_TEXT)]
            if kind == "variant":
                variant_id = action["variantId"]
                updated = await self.orders.add_cart_item(company_id, conversation_id, variant_id, 1)
                item = next((entry for entry in updated["items"] if entry["variantId"] == variant_id), None)
                label = f"{item['productName']} ({item['variantName']})" if item else "el producto"
                return [self._cart_outbound(updated, f"Agregué {label} x1.")]
            if kind == "product":
                products = await self.orders.get_suggested_products(
                    company_id, product_ids=[action["productId"]]
                )
                product = products[0] if products else None
                listing = product_list_interactive([product], "Ver opciones") if product else None  # type: ignore[list-item]
                return [
                    OutboundMessage(f"Elige la opción de {product['name']} que quieres:", listing)
                    if product and listing
                    else OutboundMessage("Ese producto ya no está disponible. ¿Te muestro otros?")
                ]
            return None
        except Exception as error:  # noqa: BLE001
            await self.session.rollback()
            logger.warning("Interactive action failed: %s", error)
            return [OutboundMessage(order_error_message(error))]

    async def _append_ai_reply(self, state: _ReplyState, reply: GenerateReplyResult, company_id: str) -> None:
        """Respuesta de la IA + tarjeta (1 producto), lista (varios) o "¿lo agrego?"."""
        interactive: Interactive | None = None
        ids = reply.suggested_product_ids or []
        if ids:
            try:
                products = await self.orders.get_suggested_products(company_id, product_ids=ids)
                interactive = (
                    product_card_interactive(products[0])  # type: ignore[arg-type]
                    if len(products) == 1
                    else product_list_interactive(products)  # type: ignore[arg-type]
                )
            except Exception as error:  # noqa: BLE001
                logger.warning("Suggested products failed: %s", error)
        if not interactive and bot_offered_add_to_cart(reply.text):
            interactive = add_confirm_buttons()
        state.outbound.append(OutboundMessage(reply.text, interactive))
        if not interactive or interactive.get("kind") != "product_card":
            state.image_urls.extend(reply.image_urls or [])

    def _cart_outbound(self, cart: dict[str, Any], prefix: str | None = None) -> OutboundMessage:
        def join(cart_text: str) -> str:
            return "\n\n".join(part for part in (prefix, cart_text) if part)

        if not cart["items"]:
            return OutboundMessage(join(format_cart_message(cart)))
        return OutboundMessage(
            join(format_cart_message(cart, with_instructions=False)), cart_action_buttons()
        )

    async def _checkout_outbound(
        self, company_id: str, conversation_id: str, cart: dict[str, Any], playground: bool
    ) -> OutboundMessage:
        if playground:
            return OutboundMessage(
                f"{PLAYGROUND_CHECKOUT_TEXT}\n\n{format_cart_message(cart, with_instructions=False)}",
                checkout_link_button(None) if cart["items"] else None,
            )
        result = await self.orders.begin_checkout(company_id, conversation_id)
        if result.checkout_url:
            return OutboundMessage(result.summary, checkout_link_button(result.checkout_url), result.message)
        return OutboundMessage(result.message)

    async def _try_handle_order_intent(
        self,
        company_id: str,
        conversation_id: str,
        customer_text: str,
        playground: bool = False,
        *,
        force_add: bool = False,
    ) -> list[OutboundMessage] | None:
        try:
            cart = await self.orders.get_cart_for_conversation(company_id, conversation_id)
            intent = "add_to_cart" if force_add else resolve_order_chat_intent(customer_text)

            # "sí / dale" tras oferta del bot de agregar → tratar como add_to_cart.
            if not intent and detects_affirmative_cart_confirm(customer_text):
                last_bot = await self.session.scalar(
                    select(Message.body)
                    .where(Message.conversation_id == conversation_id, Message.direction == "outbound")
                    .order_by(Message.created_at.desc())
                    .limit(1)
                )
                if last_bot and bot_offered_add_to_cart(last_bot):
                    intent = "add_to_cart"

            if not intent:
                return None
            if intent == "view_cart":
                return [self._cart_outbound(cart)]
            if intent == "clear_cart":
                return [self._cart_outbound(await self.orders.clear_cart(company_id, conversation_id))]
            if intent == "checkout":
                return [await self._checkout_outbound(company_id, conversation_id, cart, playground)]
            if intent == "track_order":
                return [
                    OutboundMessage(
                        await self.orders.conversation_order_tracking(
                            company_id, conversation_id, extract_tracked_order_number(customer_text)
                        )
                    )
                ]

            match = await self.orders.find_variant_for_add_intent(company_id, customer_text)
            if not match:
                # Frases como "me gustaría pedir una" / "sí" / "quiero 2": usar historial + oferta del bot.
                recent = (
                    await self.session.scalars(
                        select(Message.body)
                        .where(Message.conversation_id == conversation_id)
                        .order_by(Message.created_at.desc())
                        .limit(10)
                    )
                ).all()
                history = [body.strip() for body in recent if body.strip()]
                history.reverse()
                match = await self.orders.find_variant_for_add_intent(
                    company_id, " ".join([*history, customer_text])
                )
            if not match:
                # Sin producto claro → IA responde; no FAQ por defecto.
                return None
            updated = await self.orders.add_cart_item(
                company_id, conversation_id, match.variant_id, match.quantity
            )
            return [self._cart_outbound(updated, f"Agregué {match.label} x{match.quantity}.")]
        except Exception as error:  # noqa: BLE001
            await self.session.rollback()
            logger.warning("Order intent failed: %s", error)
            return [OutboundMessage(order_error_message(error))]

    async def _build_bot_follow_up_after_choice(
        self, company_id: str, conversation_id: str, customer_text: str, ai_enabled: bool
    ) -> GenerateReplyResult | None:
        """Si el cliente eligió bot tras (o junto a) una pregunta real, genera la respuesta para enviarla
        como 2º mensaje."""
        if not ai_enabled:
            return None
        question = await self._find_question_for_bot_follow_up(conversation_id, customer_text)
        if not question:
            return None
        return await generate_reply(
            self.session, company_id=company_id, conversation_id=conversation_id, customer_text=question
        )

    async def _find_question_for_bot_follow_up(self, conversation_id: str, customer_text: str) -> str | None:
        """Pregunta del mismo mensaje (bot + pregunta) o del inbound previo."""
        from_current = extract_residual_after_bot_choice(customer_text)
        if from_current and not is_only_greeting(from_current):
            return from_current
        stripped = customer_text.strip()
        if stripped and is_direct_product_inquiry(stripped) and not is_only_greeting(stripped):
            return stripped
        return await self._find_prior_customer_question(conversation_id)

    async def _find_prior_customer_question(self, conversation_id: str) -> str | None:
        """Último inbound con intención real, ignorando elecciones bot/asesor y saludos sueltos."""
        recent = (
            await self.session.execute(
                select(Message.body, Message.interactive)
                .where(Message.conversation_id == conversation_id, Message.direction == "inbound")
                .order_by(Message.created_at.desc())
                .limit(8)
            )
        ).all()
        for raw_body, raw_interactive in recent:
            body = raw_body.strip()
            interactive = parse_interactive(raw_interactive)
            if not body or (interactive and interactive.get("kind") == "reply"):
                continue
            if detects_human_request(body):
                continue
            if detects_bot_choice(body):
                residual = extract_residual_after_bot_choice(body)
                if residual and not is_only_greeting(residual):
                    return residual
                continue
            if is_only_greeting(body):
                continue
            return body
        return None

    async def _send_outbound(
        self, channel: ReplyChannel, conversation_id: str, customer_wa_id: str, message: OutboundMessage
    ) -> None:
        """Guarda el mensaje tal como lo ve el cliente y, fuera del playground, lo envía por WhatsApp."""
        interactive = message.interactive
        result = SendResult(simulated=True, wamid=None)
        status = "sent"
        if channel.twilio_whatsapp_number:
            try:
                result = await self._deliver_to_whatsapp(
                    channel.twilio_whatsapp_number, customer_wa_id, message
                )
            except Exception as error:  # noqa: BLE001
                logger.error("Auto-reply failed: %s", error)
                result = SendResult(simulated=False, wamid=None)
                status = "failed"

        self.session.add(
            Message(
                conversation_id=conversation_id,
                direction="outbound",
                wamid=result.wamid,
                type="interactive" if interactive else "text",
                body=message.text,
                status=status,
                interactive=interactive,
            )
        )
        await self.session.commit()

    async def _deliver_to_whatsapp(self, from_: str, to: str, message: OutboundMessage) -> SendResult:
        """Interactivo vía Twilio Content API; si está desactivado, no aplica o Twilio falla,
        el mismo mensaje sale como texto con las opciones numeradas."""
        interactive = message.interactive
        if not interactive:
            return await twilio_client.send_text(from_=from_, to=to, text=message.text)
        fallback = message.fallback_text or render_as_fallback_text(message.text, interactive)
        if not get_settings().WHATSAPP_INTERACTIVE_ENABLED:
            return await twilio_client.send_text(from_=from_, to=to, text=fallback)

        try:
            body = message.text
            if interactive.get("kind") == "product_card":
                caption = f"*{interactive['title']}*\n{interactive['subtitle']}"
                if interactive.get("imageUrl"):
                    await twilio_client.send_media(
                        from_=from_,
                        to=to,
                        media_url=get_storage().external_url(interactive["imageUrl"]),
                        caption=caption,
                    )
                else:
                    body = f"{body}\n\n{caption}"
            # La plantilla de pago tiene cuerpo fijo: el resumen del pedido va antes, como texto.
            text_first = interactive.get("kind") == "link_button" or len(body) > INTERACTIVE_BODY_MAX
            content = await TwilioContentService(self.session).resolve(
                interactive, "Elige una opción:" if text_first else body
            )
            if not content:
                return await twilio_client.send_text(from_=from_, to=to, text=fallback)
            if text_first:
                await twilio_client.send_text(from_=from_, to=to, text=body)
            return await twilio_client.send_content(
                from_=from_, to=to, content_sid=content.content_sid, variables=content.variables
            )
        except Exception as error:  # noqa: BLE001
            logger.warning("Mensaje interactivo no enviado; se envía como texto: %s", error)
            return await twilio_client.send_text(from_=from_, to=to, text=fallback)

    async def _send_outbound_media(
        self, channel: ReplyChannel, conversation_id: str, customer_wa_id: str, media_url: str
    ) -> None:
        status = "sent"
        try:
            result = (
                SendResult(simulated=True, wamid=None)
                if not channel.twilio_whatsapp_number
                else await twilio_client.send_media(
                    from_=channel.twilio_whatsapp_number,
                    to=customer_wa_id,
                    media_url=get_storage().external_url(media_url),
                )
            )
        except Exception as error:  # noqa: BLE001
            logger.error("Media auto-reply failed: %s", error)
            result = SendResult(simulated=False, wamid=None)
            status = "failed"

        self.session.add(
            Message(
                conversation_id=conversation_id,
                direction="outbound",
                wamid=result.wamid,
                type="image",
                body=media_url,
                status=status,
                raw_payload={"mediaUrl": media_url},
            )
        )
        await self.session.commit()


__all__ = [
    "HANDLER_CHOICE_BUTTONS_TEXT",
    "PLAYGROUND_CHECKOUT_TEXT",
    "SHARED_NUMBER_UNROUTED_TEXT",
    "InboundMessage",
    "WhatsAppWebhookService",
    "assert_development_only",
    "assert_twilio_signature",
]
