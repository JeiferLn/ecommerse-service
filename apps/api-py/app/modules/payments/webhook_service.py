import logging
from decimal import Decimal
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.ids import utcnow
from app.integrations import mercadopago
from app.models import Conversation, Message, Order
from app.modules.auth.service import AuthService
from app.modules.billing.service import BillingService, parse_subscription_external_ref
from app.modules.orders.service import OrdersService, format_payment_confirmed_whatsapp_message
from app.modules.payments.connection_service import MercadoPagoConnectionService
from app.modules.whatsapp import twilio_client

logger = logging.getLogger("app.payments.webhook")

AMOUNT_TOLERANCE = 0.05


def _text(value: Any) -> str | None:
    return value if isinstance(value, str) and value else None


def as_dict(value: Any) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def amounts_match(payment: dict[str, Any], *, total: Decimal, currency: str) -> bool:
    paid_amount = payment.get("transaction_amount")
    if not isinstance(paid_amount, int | float) or isinstance(paid_amount, bool):
        return False
    if abs(paid_amount - float(total)) > AMOUNT_TOLERANCE:
        return False
    paid_currency = str(payment.get("currency_id") or "").upper()
    order_currency = (currency or "").upper()
    return not (paid_currency and order_currency and paid_currency != order_currency)


class MercadoPagoWebhookService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def handle_subscription_notification(
        self,
        payment_id_raw: str | None,
        company_id_hint: str | None = None,
        pending_id_hint: str | None = None,
    ) -> None:
        """Activa plan SaaS tras pago aprobado a la cuenta de plataforma."""
        pending_id = (pending_id_hint or "").strip()
        if pending_id and await AuthService(self.session).try_complete_pending_from_return(
            pending_id=pending_id, preapproval_id=None
        ):
            logger.info("Registro pendiente completado por pendingId=%s", pending_id)

        if not payment_id_raw:
            if not pending_id:
                logger.warning("Webhook MP suscripción sin payment id")
            return
        payment_id = str(payment_id_raw)
        platform_token = (get_settings().MP_ACCESS_TOKEN or "").strip()
        if not platform_token:
            logger.warning("MP_ACCESS_TOKEN de plataforma no configurado; no se puede validar suscripción")
            return

        try:
            payment = await mercadopago.get_payment(platform_token, payment_id)
        except Exception:
            logger.exception("No se pudo consultar pago de suscripción %s", payment_id)
            return

        if payment.get("status") != "approved":
            logger.info("Suscripción pago %s status=%s", payment_id, payment.get("status"))
            return

        external = (_text(payment.get("external_reference")) or "").strip()
        if external.startswith("preg:"):
            ok = await AuthService(self.session).try_complete_pending_from_external_ref(external, payment_id)
            logger.info(
                "Registro pendiente completado por pago %s" if ok else "Pago %s preg sin pending aplicable",
                payment_id,
            )
            return

        metadata = as_dict(payment.get("metadata"))
        company_id = _text(metadata.get("companyId")) or (company_id_hint or "").strip() or None
        plan_code = _text(metadata.get("planCode"))
        meta_interval = _text(metadata.get("interval"))
        interval = meta_interval if meta_interval in ("year", "month") else None

        parsed = parse_subscription_external_ref(external)
        if parsed:
            company_id, plan_code, interval = parsed["companyId"], parsed["planCode"], parsed["interval"]

        if not company_id or plan_code not in ("pro", "business"):
            logger.warning("Pago suscripción %s sin company/plan válidos", payment_id)
            return

        await BillingService(self.session).handle_subscription_payment_approved(
            company_id, plan_code, payment_id, interval
        )
        logger.info("Suscripción cobro aplicado company=%s plan=%s", company_id, plan_code)

    async def handle_subscription_preapproval_notification(self, preapproval_id_raw: str | None) -> None:
        """Alta / autorización de preapproval (suscripción recurrente)."""
        if not preapproval_id_raw:
            logger.warning("Webhook MP preapproval sin id")
            return
        preapproval_id = str(preapproval_id_raw)
        try:
            if await AuthService(self.session).try_complete_pending_from_preapproval(preapproval_id):
                logger.info("Registro pendiente completado por preapproval id=%s", preapproval_id)
                return
            await BillingService(self.session).handle_preapproval_authorized(preapproval_id)
            logger.info("Preapproval procesado id=%s", preapproval_id)
        except Exception:
            logger.exception("Error procesando preapproval %s", preapproval_id)

    async def handle_payment_notification(
        self, payment_id_raw: str | None, company_id_hint: str | None
    ) -> None:
        """Procesa una notificación de pago (webhook o IPN).

        `company_id` viene en la query del notification_url (por empresa).
        """
        if not payment_id_raw:
            logger.warning("Webhook MP sin payment id")
            return
        payment_id = str(payment_id_raw)
        company_id = (company_id_hint or "").strip() or None
        if not company_id:
            company_id = await self.session.scalar(
                select(Order.company_id).where(Order.mp_payment_id == payment_id).limit(1)
            )
        if not company_id:
            logger.warning(
                "Pago %s: sin companyId en webhook ni pedido previo; no se puede consultar con token del comercio",
                payment_id,
            )
            return

        try:
            token = await MercadoPagoConnectionService(self.session).get_valid_access_token(company_id)
            payment = await mercadopago.get_payment(token, payment_id)
        except Exception:
            logger.exception("No se pudo consultar el pago %s", payment_id)
            return

        metadata = as_dict(payment.get("metadata"))
        order_id = (_text(payment.get("external_reference")) or "").strip() or _text(metadata.get("orderId"))
        if not order_id:
            logger.warning("Pago %s sin external_reference/orderId", payment_id)
            return
        if payment.get("status") != "approved":
            logger.info("Pago %s con status=%s; no se marca paid", payment_id, payment.get("status"))
            return

        order = await self.session.get(Order, order_id)
        if not order:
            logger.warning("Pago %s: pedido %s no encontrado", payment_id, order_id)
            return
        if order.company_id != company_id:
            logger.warning(
                "Pago %s: companyId del webhook (%s) no coincide con el pedido", payment_id, company_id
            )
            return
        if not amounts_match(payment, total=order.total, currency=order.currency):
            logger.error(
                "Pago %s rechazado: monto/moneda no coinciden con pedido %s (MP %s %s vs %s %s)",
                payment_id,
                order.number,
                payment.get("transaction_amount"),
                payment.get("currency_id"),
                order.total,
                order.currency,
            )
            return

        try:
            result = await OrdersService(self.session).mark_paid_from_mercadopago(
                order_id=order.id, mp_payment_id=payment_id
            )
            if not result.newly_paid:
                logger.info("Pedido %s ya estaba pagado/procesado", result.order.number)
                return
            logger.info("Pedido %s marcado como paid (MP %s)", result.order.number, payment_id)
            await self._send_payment_whatsapp(result.order)
        except Exception:
            logger.exception("Error al marcar paid el pedido %s", order_id)

    async def _send_payment_whatsapp(self, order: Order) -> None:
        if not order.conversation_id:
            return
        conversation = await self.session.scalar(
            select(Conversation)
            .where(Conversation.id == order.conversation_id, Conversation.company_id == order.company_id)
            .options(selectinload(Conversation.wa_connection))
        )
        connection = conversation.wa_connection if conversation else None
        if (
            not conversation
            or not connection
            or not connection.is_active
            or not connection.twilio_whatsapp_number
        ):
            logger.warning("Pedido %s: sin conversación/conexión WA activa para confirmar pago", order.number)
            return

        text = format_payment_confirmed_whatsapp_message(order)
        wamid: str | None = None
        status = "sent"
        try:
            result = await twilio_client.send_text(
                from_=connection.twilio_whatsapp_number, to=conversation.customer_wa_id, text=text
            )
            wamid = result.wamid
        except Exception as error:  # noqa: BLE001
            status = "failed"
            logger.warning("Pedido %s pagado pero falló WhatsApp: %s", order.number, error)

        self.session.add(
            Message(
                conversation_id=conversation.id,
                direction="outbound",
                wamid=wamid,
                type="text",
                body=text,
                status=status,
            )
        )
        conversation.last_message_at = utcnow()
        await self.session.commit()
