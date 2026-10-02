import contextlib
import math
import re
from datetime import datetime, timedelta
from typing import Any, Literal
from urllib.parse import quote, urlencode

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.errors import ApiError, bad_request, forbidden, not_found, service_unavailable
from app.core.ids import iso, new_id, utcnow
from app.integrations import mercadopago as mp
from app.models import (
    CompanyMembership,
    KnowledgeDocument,
    Plan,
    Product,
    ProductVariant,
    Subscription,
    UsageCounter,
    User,
)

TRIAL_DAYS = 15
MONTH_PERIOD_DAYS = 30
YEAR_PERIOD_DAYS = 365
USD_TO_COP = 4000
"""1 USD ≈ 4000 COP (aprox. sandbox / display local)."""
MP_MIN_AMOUNT_COP = 1600
"""MP Colombia rechaza suscripciones por debajo de este monto."""

EntitlementAction = Literal[
    "use_whatsapp",
    "use_ai",
    "create_product",
    "create_variant",
    "invite_member",
    "upload_knowledge",
    "connect_whatsapp",
]

PLAN_DEFS: list[dict[str, Any]] = [
    {
        "code": "free",
        "name": "Free",
        "price_usd_cents": 0,
        "max_members": 2,
        "max_products": 30,
        "max_variants": 80,
        "max_wa_messages_month": 100,
        "max_ai_replies_month": 50,
        "max_knowledge_docs": 4,
        "sort_order": 0,
    },
    {
        "code": "pro",
        "name": "Pro",
        "price_usd_cents": 3900,
        "max_members": 5,
        "max_products": 300,
        "max_variants": 1000,
        "max_wa_messages_month": 2000,
        "max_ai_replies_month": 1500,
        "max_knowledge_docs": 4,
        "sort_order": 1,
    },
    {
        "code": "business",
        "name": "Business",
        "price_usd_cents": 9900,
        "max_members": 25,
        "max_products": 2000,
        "max_variants": 8000,
        "max_wa_messages_month": 10000,
        "max_ai_replies_month": 8000,
        "max_knowledge_docs": 4,
        "sort_order": 2,
    },
]

_LOCKED_ACTIONS = {
    "use_whatsapp",
    "use_ai",
    "connect_whatsapp",
    "create_product",
    "create_variant",
    "invite_member",
    "upload_knowledge",
}


def price_year_usd_cents(monthly_usd_cents: int) -> int:
    """Precio anual = 10 × mensual (2 meses gratis)."""
    return 0 if monthly_usd_cents <= 0 else monthly_usd_cents * 10


def current_period_key(date: datetime | None = None) -> str:
    date = date or utcnow()
    return f"{date.year}-{date.month:02d}"


def parse_pending_registration_external_ref(external: str) -> dict[str, str] | None:
    match = re.fullmatch(r"preg:([^:]+):(pro|business):(month|year)", external.strip())
    if not match:
        return None
    return {"pendingId": match[1], "planCode": match[2], "interval": match[3]}


def parse_subscription_external_ref(external: str) -> dict[str, str] | None:
    match = re.fullmatch(r"sub:([^:]+):(pro|business):(month|year)", external.strip())
    if match:
        return {"companyId": match[1], "planCode": match[2], "interval": match[3]}
    legacy = re.fullmatch(r"sub:([^:]+):(pro|business)", external.strip())
    if legacy:
        return {"companyId": legacy[1], "planCode": legacy[2], "interval": "month"}
    return None


def map_mercadopago_error(error: Exception) -> str:
    message = str(error)
    lower = message.lower()
    if "back_url" in lower:
        return (
            "Mercado Pago exige una back_url HTTPS válida. En local define API_PUBLIC_URL (ngrok) "
            "o FRONTEND_URL con https://"
        )
    if "real or test" in lower or "payer and collector" in lower:
        return (
            "Mercado Pago exige que el pagador sea un usuario de prueba cuando usas credenciales de prueba. "
            "Define MP_TEST_PAYER_EMAIL con el email del comprador de prueba "
            "(formato test_user_…@testuser.com, visible en /users/me del comprador) "
            "o regístrate usando ese email. En el checkout de MP inicia sesión con el usuario Comprador "
            "de prueba."
        )
    if "cannot be the same user" in lower:
        return (
            "El pagador no puede ser el mismo usuario vendedor de prueba. "
            "Usa el comprador de prueba (otra cuenta)."
        )
    if "lower than" in lower:
        return f"Mercado Pago: el monto mínimo de suscripción no se cumple ({message})."
    return f"Mercado Pago: {message}"


def resolve_payer_email_for_checkout(account_email: str) -> str:
    test_payer = (get_settings().MP_TEST_PAYER_EMAIL or "").strip()
    return test_payer.lower() if test_payer else account_email.strip().lower()


def _build_frontend_return_path(frontend: str, status: str, flow: str) -> str:
    if flow == "register":
        return f"{frontend}/login?registered=1&status={status}"
    return f"{frontend}/billing?status={status}"


def frontend_billing_return_url(status: str, flow: str | None = None) -> str:
    """Destino local tras el retorno HTTPS del API (ngrok)."""
    frontend = get_settings().FRONTEND_URL.rstrip("/")
    safe = status if status in ("success", "failure", "pending") else "success"
    return _build_frontend_return_path(frontend, safe, "register" if flow == "register" else "billing")


def resolve_mercadopago_back_url(status: str, *, flow: str = "billing", pending_id: str | None = None) -> str:
    """MP Preapproval rechaza http://localhost: usa FRONTEND_URL HTTPS o API_PUBLIC_URL."""
    settings = get_settings()
    frontend = settings.FRONTEND_URL.rstrip("/")
    api_public = (settings.API_PUBLIC_URL or "").strip().rstrip("/") or None

    query: dict[str, str] = {"status": status, "flow": flow}
    if pending_id:
        query["pendingId"] = pending_id

    if flow == "register":
        if not pending_id:
            raise bad_request("pendingId requerido para retorno de registro")
        path = f"/api/v1/auth/mp-return/{quote(pending_id, safe='')}"
        if api_public and api_public.startswith("https://"):
            return f"{api_public}{path}"
        if frontend.startswith("https://"):
            return f"{frontend}{path}"
        raise bad_request(
            "Mercado Pago exige HTTPS para volver del pago. Define API_PUBLIC_URL con https:// (ngrok)."
        )

    if frontend.startswith("https://"):
        return _build_frontend_return_path(frontend, status, flow)
    if api_public and api_public.startswith("https://"):
        return f"{api_public}/api/v1/billing/mp-return?{urlencode(query)}"
    raise bad_request(
        "Mercado Pago exige HTTPS para volver del pago. Define FRONTEND_URL o API_PUBLIC_URL con https:// "
        "(ngrok)."
    )


def plan_view(plan: Plan) -> dict[str, Any]:
    return {
        "code": plan.code,
        "name": plan.name,
        "priceUsdCents": plan.price_usd_cents,
        "priceYearUsdCents": price_year_usd_cents(plan.price_usd_cents),
        "maxMembers": plan.max_members,
        "maxProducts": plan.max_products,
        "maxVariants": plan.max_variants,
        "maxWaMessagesMonth": plan.max_wa_messages_month,
        "maxAiRepliesMonth": plan.max_ai_replies_month,
        "maxKnowledgeDocs": plan.max_knowledge_docs,
        "sortOrder": plan.sort_order,
        "highlighted": plan.code == "pro",
    }


def _platform_token() -> str | None:
    return (get_settings().MP_ACCESS_TOKEN or "").strip() or None


class BillingService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def ensure_plans_seeded(self) -> None:
        count = await self.session.scalar(select(func.count()).select_from(Plan))
        if (count or 0) >= 3:
            return
        now = utcnow()
        for plan in PLAN_DEFS:
            stmt = (
                insert(Plan)
                .values(id=new_id(), created_at=now, updated_at=now, **plan)
                .on_conflict_do_nothing(index_elements=["code"])
            )
            await self.session.execute(stmt)
        await self.session.commit()

    async def list_public_plans(self) -> list[dict[str, Any]]:
        await self.ensure_plans_seeded()
        plans = (
            await self.session.scalars(select(Plan).where(Plan.is_public.is_(True)).order_by(Plan.sort_order))
        ).all()
        return [plan_view(plan) for plan in plans]

    async def _plan_by_code(self, code: str) -> Plan | None:
        return await self.session.scalar(select(Plan).where(Plan.code == code))

    async def start_trial_for_company(
        self,
        company_id: str,
        desired_plan_code: str | None = None,
        desired_billing_interval: str | None = None,
    ) -> None:
        """Se ejecuta dentro de la transacción del registro (no hace commit)."""
        free = await self._plan_by_code("free")
        if not free:
            raise service_unavailable("Planes no inicializados; ejecuta el seed")
        desired_plan_id: str | None = None
        interval: str | None = None
        if desired_plan_code and desired_plan_code != "free":
            desired = await self._plan_by_code(desired_plan_code)
            desired_plan_id = desired.id if desired else None
            interval = desired_billing_interval or "month"
        self.session.add(
            Subscription(
                company_id=company_id,
                plan_id=free.id,
                status="trialing",
                trial_ends_at=utcnow() + timedelta(days=TRIAL_DAYS),
                desired_plan_id=desired_plan_id,
                desired_billing_interval=interval,
            )
        )
        await self.session.flush()

    async def create_active_paid_subscription(
        self,
        company_id: str,
        plan_code: str,
        interval: str,
        mp_preapproval_id: str | None,
        mp_payment_id: str | None,
    ) -> None:
        plan = await self._plan_by_code(plan_code)
        if not plan:
            raise not_found("Plan no encontrado")
        now = utcnow()
        period_days = YEAR_PERIOD_DAYS if interval == "year" else MONTH_PERIOD_DAYS
        self.session.add(
            Subscription(
                company_id=company_id,
                plan_id=plan.id,
                status="active",
                billing_interval=interval,
                cancel_at_period_end=False,
                current_period_start=now,
                current_period_end=now + timedelta(days=period_days),
                mp_preapproval_id=mp_preapproval_id,
                mp_payment_id=mp_payment_id,
            )
        )
        await self.session.flush()

    def _amount_cop(self, plan: Plan, interval: str) -> int:
        usd_cents = price_year_usd_cents(plan.price_usd_cents) if interval == "year" else plan.price_usd_cents
        return max(MP_MIN_AMOUNT_COP, round((usd_cents / 100) * USD_TO_COP))

    async def create_pending_registration_checkout(
        self, *, pending_id: str, payer_email: str, plan_code: str, interval: str
    ) -> dict[str, str | None]:
        plan = await self._plan_by_code(plan_code)
        if not plan or not plan.is_public:
            raise not_found("Plan no encontrado")
        platform_token = _platform_token()
        if not platform_token:
            raise service_unavailable("Cobro de suscripción no configurado (MP_ACCESS_TOKEN de plataforma)")

        back_url = resolve_mercadopago_back_url("success", flow="register", pending_id=pending_id)
        base = mp.webhook_notification_url()
        notification_url = (
            f"{base}?purpose=subscription&pendingId={quote(pending_id, safe='')}" if base else None
        )
        interval_label = "anual" if interval == "year" else "mensual"
        try:
            preapproval = await mp.create_preapproval(
                platform_token,
                reason=f"Commerce AI — {plan.name} ({interval_label})",
                payer_email=resolve_payer_email_for_checkout(payer_email),
                external_reference=f"preg:{pending_id}:{plan_code}:{interval}",
                back_url=back_url,
                transaction_amount=self._amount_cop(plan, interval),
                currency_id="COP",
                frequency=12 if interval == "year" else 1,
                frequency_type="months",
                notification_url=notification_url,
            )
        except mp.MercadoPagoError as error:
            raise bad_request(map_mercadopago_error(error)) from error

        init_point = preapproval.get("init_point")
        if not init_point:
            raise service_unavailable("No se pudo iniciar la suscripción de Mercado Pago")
        preapproval_id = preapproval.get("id")
        return {"initPoint": init_point, "mpPreapprovalId": str(preapproval_id) if preapproval_id else None}

    async def resolve_pending_from_preapproval(self, preapproval_id: str) -> dict[str, str] | None:
        platform_token = _platform_token()
        if not platform_token:
            return None
        preapproval = await mp.get_preapproval(platform_token, preapproval_id)
        status = str(preapproval.get("status") or "").lower()
        if status not in ("authorized", "paused"):
            return None
        return parse_pending_registration_external_ref(str(preapproval.get("external_reference") or ""))

    async def is_preapproval_authorized(self, preapproval_id: str) -> bool:
        platform_token = _platform_token()
        if not platform_token:
            return False
        preapproval = await mp.get_preapproval(platform_token, preapproval_id)
        return str(preapproval.get("status") or "").lower() in ("authorized", "paused")

    async def get_subscription_summary(self, company_id: str | None) -> dict[str, Any] | None:
        if not company_id:
            return None
        details = await self.get_subscription_details(company_id)
        keys = (
            "planCode",
            "planName",
            "status",
            "trialEndsAt",
            "trialDaysLeft",
            "desiredPlanCode",
            "checkoutRequired",
            "featuresLocked",
            "billingInterval",
            "cancelAtPeriodEnd",
            "currentPeriodEnd",
        )
        return {key: details[key] for key in keys}

    async def get_subscription_details(self, company_id: str) -> dict[str, Any]:
        await self.ensure_plans_seeded()
        sub = await self._refresh_subscription_status(company_id)
        period_key = current_period_key()
        members = await self.session.scalar(
            select(func.count())
            .select_from(CompanyMembership)
            .where(CompanyMembership.company_id == company_id)
        )
        products = await self.session.scalar(
            select(func.count()).select_from(Product).where(Product.company_id == company_id)
        )
        variants = await self.session.scalar(
            select(func.count())
            .select_from(ProductVariant)
            .join(Product, Product.id == ProductVariant.product_id)
            .where(Product.company_id == company_id)
        )
        knowledge_docs = await self.session.scalar(
            select(func.count())
            .select_from(KnowledgeDocument)
            .where(
                KnowledgeDocument.company_id == company_id,
                KnowledgeDocument.status == "active",
                KnowledgeDocument.file_key.is_not(None),
            )
        )
        usage = await self.session.scalar(
            select(UsageCounter).where(
                UsageCounter.company_id == company_id, UsageCounter.period_key == period_key
            )
        )

        plan = sub.plan
        status = sub.status
        features_locked = status in ("trial_expired", "canceled", "past_due")
        trial_days_left = None
        if status == "trialing" and sub.trial_ends_at:
            remaining = (sub.trial_ends_at - utcnow()).total_seconds() / 86400
            trial_days_left = max(0, math.ceil(remaining))
        desired = sub.desired_plan

        return {
            "planCode": plan.code,
            "planName": plan.name,
            "status": status,
            "trialEndsAt": iso(sub.trial_ends_at),
            "trialDaysLeft": trial_days_left,
            "desiredPlanCode": desired.code if desired else None,
            "checkoutRequired": bool(desired and desired.code != "free" and status == "trialing"),
            "featuresLocked": features_locked,
            "billingInterval": sub.billing_interval,
            "cancelAtPeriodEnd": sub.cancel_at_period_end,
            "priceUsdCents": plan.price_usd_cents,
            "priceYearUsdCents": price_year_usd_cents(plan.price_usd_cents),
            "limits": {
                "maxMembers": plan.max_members,
                "maxProducts": plan.max_products,
                "maxVariants": plan.max_variants,
                "maxWaMessagesMonth": plan.max_wa_messages_month,
                "maxAiRepliesMonth": plan.max_ai_replies_month,
                "maxKnowledgeDocs": plan.max_knowledge_docs,
            },
            "usage": {
                "members": members or 0,
                "products": products or 0,
                "variants": variants or 0,
                "knowledgeDocs": knowledge_docs or 0,
                "waInbound": usage.wa_inbound_count if usage else 0,
                "aiReplies": usage.ai_reply_count if usage else 0,
                "periodKey": period_key,
            },
            "currentPeriodStart": iso(sub.current_period_start),
            "currentPeriodEnd": iso(sub.current_period_end),
            "desiredBillingInterval": sub.desired_billing_interval,
        }

    async def assert_can(self, company_id: str | None, action: EntitlementAction) -> None:
        if not company_id:
            raise bad_request("Selecciona una empresa activa")
        details = await self.get_subscription_details(company_id)
        if details["featuresLocked"] and action in _LOCKED_ACTIONS:
            raise forbidden("Tu plan no está activo. Elige un plan en Facturación para continuar.")

        limits = details["limits"]
        usage = details["usage"]
        if action == "create_product" and usage["products"] >= limits["maxProducts"]:
            raise forbidden(f"Límite de productos del plan ({limits['maxProducts']}). Mejora tu plan.")
        if action == "create_variant" and usage["variants"] >= limits["maxVariants"]:
            raise forbidden(f"Límite de variantes del plan ({limits['maxVariants']}). Mejora tu plan.")
        if action == "invite_member" and usage["members"] >= limits["maxMembers"]:
            raise forbidden(f"Límite de miembros del plan ({limits['maxMembers']}). Mejora tu plan.")
        if action == "upload_knowledge" and usage["knowledgeDocs"] >= limits["maxKnowledgeDocs"]:
            raise forbidden(
                f"Límite de documentos de conocimiento ({limits['maxKnowledgeDocs']}). Mejora tu plan."
            )
        if action == "use_whatsapp" and usage["waInbound"] >= limits["maxWaMessagesMonth"]:
            raise forbidden("Cupo mensual de mensajes WhatsApp agotado.")
        if action == "use_ai" and usage["aiReplies"] >= limits["maxAiRepliesMonth"]:
            raise forbidden("Cupo mensual de respuestas IA agotado.")

    async def record_wa_inbound(self, company_id: str) -> dict[str, Any]:
        try:
            await self.assert_can(company_id, "use_whatsapp")
        except ApiError as error:
            return {"allowed": False, "reason": error.message}
        await self._increment_usage(company_id, "wa_inbound_count")
        return {"allowed": True}

    async def record_ai_reply(self, company_id: str) -> dict[str, Any]:
        try:
            await self.assert_can(company_id, "use_ai")
        except ApiError as error:
            return {"allowed": False, "reason": error.message}
        await self._increment_usage(company_id, "ai_reply_count")
        return {"allowed": True}

    async def checkout(
        self, company_id: str | None, plan_code: str, interval: str, payer_user_id: str
    ) -> dict[str, Any]:
        if not company_id:
            raise bad_request("Selecciona una empresa activa")
        if plan_code == "free":
            raise bad_request("El plan Free no requiere pago")
        if interval not in ("month", "year"):
            raise bad_request("Intervalo de facturación inválido")
        payer_email = await self.session.scalar(select(User.email).where(User.id == payer_user_id))
        email = (payer_email or "").strip().lower()
        if not email:
            raise bad_request("Email del pagador requerido")

        await self.ensure_plans_seeded()
        plan = await self._plan_by_code(plan_code)
        if not plan or not plan.is_public:
            raise not_found("Plan no encontrado")

        sub = await self._subscription(company_id)
        if not sub:
            raise not_found("Suscripción no encontrada")
        sub.desired_plan_id = plan.id
        sub.desired_billing_interval = interval
        await self.session.commit()

        settings = get_settings()
        allow_dev = settings.NODE_ENV == "development" or settings.BILLING_ALLOW_DEV_UPGRADE
        platform_token = _platform_token()
        if not platform_token:
            if allow_dev:
                await self.activate_paid_plan(company_id, plan_code, interval, None)
                return {
                    "initPoint": None,
                    "activatedWithoutPayment": True,
                    "planCode": plan_code,
                    "interval": interval,
                }
            raise service_unavailable("Cobro de suscripción no configurado (MP_ACCESS_TOKEN de plataforma)")

        back_url = resolve_mercadopago_back_url("success")
        base = mp.webhook_notification_url()
        notification_url = (
            f"{base}?purpose=subscription&companyId={quote(company_id, safe='')}" if base else None
        )
        interval_label = "anual" if interval == "year" else "mensual"
        try:
            preapproval = await mp.create_preapproval(
                platform_token,
                reason=f"Commerce AI — {plan.name} ({interval_label})",
                payer_email=resolve_payer_email_for_checkout(email),
                external_reference=f"sub:{company_id}:{plan.code}:{interval}",
                back_url=back_url,
                transaction_amount=self._amount_cop(plan, interval),
                currency_id="COP",
                frequency=12 if interval == "year" else 1,
                frequency_type="months",
                notification_url=notification_url,
            )
        except mp.MercadoPagoError as error:
            raise bad_request(map_mercadopago_error(error)) from error

        if preapproval.get("id"):
            sub.mp_preapproval_id = str(preapproval["id"])
            await self.session.commit()

        init_point = preapproval.get("init_point")
        if not init_point and allow_dev:
            await self.activate_paid_plan(company_id, plan_code, interval, None)
            return {
                "initPoint": None,
                "activatedWithoutPayment": True,
                "planCode": plan_code,
                "interval": interval,
            }
        if not init_point:
            raise service_unavailable("No se pudo iniciar la suscripción de Mercado Pago")
        return {
            "initPoint": init_point,
            "activatedWithoutPayment": False,
            "planCode": plan_code,
            "interval": interval,
        }

    async def cancel_at_period_end(self, company_id: str | None) -> dict[str, Any]:
        if not company_id:
            raise bad_request("Selecciona una empresa activa")
        sub = await self._subscription(company_id)
        if not sub:
            raise not_found("Suscripción no encontrada")
        if sub.status not in ("active", "past_due"):
            raise bad_request("Solo puedes cancelar una suscripción activa o en mora")
        platform_token = _platform_token()
        if sub.mp_preapproval_id and platform_token:
            # Seguimos marcando cancelAtPeriodEnd localmente; MP puede ya estar cancelled.
            with contextlib.suppress(Exception):
                await mp.cancel_preapproval(platform_token, sub.mp_preapproval_id)
        sub.cancel_at_period_end = True
        await self.session.commit()
        return {"cancelAtPeriodEnd": True, "currentPeriodEnd": iso(sub.current_period_end)}

    async def activate_paid_plan(
        self, company_id: str, plan_code: str, interval: str, mp_payment_id: str | None
    ) -> None:
        plan = await self._plan_by_code(plan_code)
        if not plan:
            raise not_found("Plan no encontrado")
        sub = await self._subscription(company_id)
        if not sub:
            raise not_found("Suscripción no encontrada")
        now = utcnow()
        period_days = YEAR_PERIOD_DAYS if interval == "year" else MONTH_PERIOD_DAYS
        sub.plan_id = plan.id
        sub.status = "active"
        sub.desired_plan_id = None
        sub.desired_billing_interval = None
        sub.trial_ends_at = None
        sub.billing_interval = interval
        sub.cancel_at_period_end = False
        sub.current_period_start = now
        sub.current_period_end = now + timedelta(days=period_days)
        sub.mp_payment_id = mp_payment_id
        await self.session.commit()

    async def handle_subscription_payment_approved(
        self, company_id: str, plan_code: str, payment_id: str, interval: str | None = None
    ) -> None:
        """Activa o extiende el periodo tras un cobro aprobado. Idempotente por `mpPaymentId`."""
        sub = await self._subscription(company_id)
        if not sub:
            raise not_found("Suscripción no encontrada")
        if sub.mp_payment_id and sub.mp_payment_id == payment_id:
            return
        resolved = interval or sub.desired_billing_interval or sub.billing_interval or "month"
        if sub.status == "active" and not sub.cancel_at_period_end:
            now = utcnow()
            base = sub.current_period_end if sub.current_period_end and sub.current_period_end > now else now
            period_days = YEAR_PERIOD_DAYS if resolved == "year" else MONTH_PERIOD_DAYS
            plan = await self._plan_by_code(plan_code)
            if plan:
                sub.plan_id = plan.id
            sub.status = "active"
            sub.cancel_at_period_end = False
            sub.billing_interval = resolved
            sub.current_period_end = base + timedelta(days=period_days)
            sub.mp_payment_id = payment_id
            sub.desired_plan_id = None
            sub.desired_billing_interval = None
            sub.trial_ends_at = None
            await self.session.commit()
            return
        await self.activate_paid_plan(company_id, plan_code, resolved, payment_id)

    async def handle_preapproval_authorized(self, preapproval_id: str) -> None:
        platform_token = _platform_token()
        if not platform_token:
            return
        preapproval = await mp.get_preapproval(platform_token, preapproval_id)
        if str(preapproval.get("status") or "").lower() not in ("authorized", "paused"):
            return
        parsed = parse_subscription_external_ref(str(preapproval.get("external_reference") or ""))
        if not parsed:
            return
        sub = await self._subscription(parsed["companyId"])
        if not sub:
            raise not_found("Suscripción no encontrada")
        sub.mp_preapproval_id = preapproval_id
        await self.session.commit()
        if sub.status != "active":
            await self.activate_paid_plan(parsed["companyId"], parsed["planCode"], parsed["interval"], None)

    async def _subscription(self, company_id: str) -> Subscription | None:
        return await self.session.scalar(select(Subscription).where(Subscription.company_id == company_id))

    async def _refresh_subscription_status(self, company_id: str) -> Subscription:
        query = (
            select(Subscription)
            .where(Subscription.company_id == company_id)
            .options(selectinload(Subscription.plan), selectinload(Subscription.desired_plan))
            .execution_options(populate_existing=True)
        )
        sub = await self.session.scalar(query)
        if not sub:
            await self.ensure_plans_seeded()
            free = await self._plan_by_code("free")
            if not free:
                raise service_unavailable("Planes no inicializados; ejecuta el seed")
            self.session.add(
                Subscription(
                    company_id=company_id,
                    plan_id=free.id,
                    status="trialing",
                    trial_ends_at=utcnow() + timedelta(days=TRIAL_DAYS),
                )
            )
            await self.session.commit()
            sub = await self.session.scalar(query)
            assert sub is not None

        now = utcnow()
        new_status: str | None = None
        if sub.status == "trialing" and sub.trial_ends_at and sub.trial_ends_at < now:
            new_status = "trial_expired"
        elif sub.status == "active" and sub.current_period_end and sub.current_period_end < now:
            new_status = "canceled" if sub.cancel_at_period_end else "past_due"
        if new_status:
            sub.status = new_status
            await self.session.commit()
        return sub

    async def _increment_usage(self, company_id: str, field: str) -> None:
        period_key = current_period_key()
        now = utcnow()
        column = UsageCounter.__table__.c["waInboundCount" if field == "wa_inbound_count" else "aiReplyCount"]
        stmt = insert(UsageCounter).values(
            id=new_id(),
            company_id=company_id,
            period_key=period_key,
            wa_inbound_count=1 if field == "wa_inbound_count" else 0,
            ai_reply_count=1 if field == "ai_reply_count" else 0,
            created_at=now,
            updated_at=now,
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=["companyId", "periodKey"],
            set_={column.name: column + 1, "updatedAt": now},
        )
        await self.session.execute(stmt)
        await self.session.commit()
