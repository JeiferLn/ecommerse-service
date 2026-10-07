import re
from typing import Any

from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.errors import bad_request, conflict, forbidden, not_found
from app.core.ids import iso, utcnow
from app.core.validation import is_unique_violation
from app.models import (
    Company,
    CompanyMembership,
    MercadoPagoConnection,
    Product,
    Subscription,
    WhatsAppConnection,
    WhatsAppNumberRequest,
)
from app.modules.billing.service import BillingService
from app.modules.companies.service import is_company_commerce_configured
from app.modules.payments.connection_service import is_company_payments_configured
from app.modules.whatsapp import twilio_client
from app.modules.whatsapp.phone import build_wa_me_link, normalize_whatsapp_e164

E164 = re.compile(r"^\+[1-9]\d{7,14}$", re.ASCII)
TWILIO_SANDBOX_NUMBER = "+14155238886"
NUMBER_TAKEN_MESSAGE = "Ese número de WhatsApp ya está registrado por otra empresa"
META_UNAVAILABLE_MESSAGE = (
    "La conexión con Meta aún no está disponible. Prueba el asistente en la app o escríbenos."
)


def connection_dto(connection: WhatsAppConnection) -> dict[str, Any]:
    return {
        "id": connection.id,
        "companyId": connection.company_id,
        "twilioWhatsAppNumber": connection.twilio_whatsapp_number,
        "displayPhoneNumber": connection.display_phone_number,
        "connectionKind": connection.connection_kind,
        "onboardingStatus": connection.onboarding_status,
        "onboardingError": connection.onboarding_error,
        "wabaId": connection.waba_id,
        "isActive": connection.is_active,
        "waMeLink": build_wa_me_link(connection.twilio_whatsapp_number)
        if connection.onboarding_status == "online" and connection.twilio_whatsapp_number
        else None,
        "createdAt": iso(connection.created_at),
        "updatedAt": iso(connection.updated_at),
    }


def number_request_dto(request: WhatsAppNumberRequest | None) -> dict[str, Any] | None:
    if request is None:
        return None
    return {
        "kind": request.kind,
        "phoneNumber": request.phone_number,
        "createdAt": iso(request.created_at),
    }


def connect_status_dto(connection: WhatsAppConnection | None) -> dict[str, Any]:
    settings = get_settings()
    return {
        "techProviderReady": settings.tech_provider_ready,
        "metaAppId": (settings.META_APP_ID or "").strip() or None,
        "metaEmbeddedSignupConfigId": (settings.META_EMBEDDED_SIGNUP_CONFIG_ID or "").strip() or None,
        "connection": connection_dto(connection) if connection else None,
    }


def _require_company(company_id: str | None) -> str:
    if not company_id:
        raise bad_request("No perteneces a una empresa")
    return company_id


def _e164(raw: str, message: str) -> str:
    number = normalize_whatsapp_e164(raw)
    if not E164.match(number):
        raise bad_request(message)
    return number


class WhatsAppConnectionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def assert_whatsapp_prerequisites(
        self, company_id: str | None, *, require_payments: bool = True
    ) -> None:
        """WhatsApp requiere un producto activo + envíos + Mercado Pago conectado."""
        await BillingService(self.session).assert_can(company_id, "connect_whatsapp")
        scoped = _require_company(company_id)
        company = await self.session.get(Company, scoped)
        active_products = (
            await self.session.scalar(
                select(func.count(Product.id)).where(Product.company_id == scoped, Product.status == "active")
            )
            or 0
        )
        if active_products == 0:
            raise bad_request(
                "Activa al menos un producto en Catálogo → Productos antes de usar el asistente."
            )
        if not company or not is_company_commerce_configured(company):
            raise bad_request(
                "Configura los envíos (país, cobertura y transportadoras) en Configuración → Envíos antes de "
                "usar WhatsApp. Solo el dueño de la empresa puede hacerlo."
            )
        if require_payments:
            mp_connection = await self.session.scalar(
                select(MercadoPagoConnection).where(MercadoPagoConnection.company_id == scoped)
            )
            if not is_company_payments_configured(mp_connection):
                raise bad_request(
                    "Conecta Mercado Pago en Configuración → Pagos antes de usar WhatsApp. El dinero de los "
                    "pedidos debe ir a la cuenta de tu empresa."
                )

    async def get(self, company_id: str | None) -> dict[str, Any] | None:
        scoped = _require_company(company_id)
        connection = await self._find(scoped)
        return connection_dto(connection) if connection else None

    async def get_connect_status(self, company_id: str | None) -> dict[str, Any]:
        scoped = _require_company(company_id)
        return connect_status_dto(await self._find(scoped))

    async def start_own_number_connect(self, company_id: str | None) -> dict[str, Any]:
        """Inicia el flujo BYO (Embedded Signup). Stub hasta completar Tech Provider."""
        await self.assert_whatsapp_prerequisites(company_id)
        scoped = _require_company(company_id)
        settings = get_settings()
        if not settings.tech_provider_ready:
            raise bad_request(META_UNAVAILABLE_MESSAGE)

        connection = await self._find(scoped)
        if connection and connection.onboarding_status == "online" and connection.is_active:
            raise conflict("Tu tienda ya tiene WhatsApp conectado.")

        if connection is None:
            connection = WhatsAppConnection(company_id=scoped)
            self.session.add(connection)
        connection.mode = "dedicated"
        connection.connection_kind = "own_number"
        connection.onboarding_status = "awaiting_meta"
        connection.onboarding_error = None
        connection.is_active = False
        connection.updated_at = utcnow()
        await self.session.commit()
        return {
            **connect_status_dto(connection),
            "message": "Abre Embedded Signup con el configId de Meta para continuar.",
        }

    async def complete_own_number_connect(
        self,
        company_id: str | None,
        *,
        code: str | None,
        waba_id: str | None,
        phone_number_id: str | None,
    ) -> dict[str, Any]:
        """Recibe el resultado de Embedded Signup. En Fase 1 solo persiste el estado; el registro
        del sender en Twilio (subcuenta + Senders API) queda para cuando Tech Provider esté listo."""
        await self.assert_whatsapp_prerequisites(company_id)
        scoped = _require_company(company_id)
        if not get_settings().tech_provider_ready:
            raise bad_request(META_UNAVAILABLE_MESSAGE)
        if not (waba_id or "").strip() and not (phone_number_id or "").strip() and not (code or "").strip():
            raise bad_request("Falta el resultado de Embedded Signup (code, wabaId o phoneNumberId).")

        connection = await self._find(scoped)
        if connection is None:
            connection = WhatsAppConnection(company_id=scoped)
            self.session.add(connection)
        connection.mode = "dedicated"
        connection.connection_kind = "own_number"
        connection.onboarding_status = "registering"
        connection.waba_id = (waba_id or "").strip() or connection.waba_id
        connection.meta_phone_number_id = (phone_number_id or "").strip() or connection.meta_phone_number_id
        connection.onboarding_error = (
            "Registro del sender en Twilio pendiente: completar Tech Provider "
            "(subcuenta + Senders API + webhook)."
        )
        connection.is_active = False
        connection.updated_at = utcnow()
        _ = code  # Se usará para intercambiar el token de Meta en una fase siguiente.
        await self.session.commit()
        return connection_dto(connection)

    async def get_number_request(self, company_id: str | None) -> dict[str, Any] | None:
        scoped = _require_company(company_id)
        return number_request_dto(await self._find_request(scoped))

    async def request_number(
        self, company_id: str | None, kind: str, phone_number: str | None
    ) -> dict[str, Any]:
        """Pide un número de plataforma (planes de pago). BYO va por `/whatsapp/connect/*`."""
        await self.assert_whatsapp_prerequisites(company_id)
        scoped = _require_company(company_id)
        if not await self._is_paid_plan(scoped):
            raise forbidden(
                "El número de la plataforma está disponible en los planes de pago. Mejora tu plan."
            )
        if kind != "platform_number":
            raise bad_request(
                "Para conectar tu propio número usa «Conectar WhatsApp». "
                "Aquí solo se solicita un número de la plataforma."
            )
        _ = phone_number

        request = await self._find_request(scoped)
        if request is None:
            request = WhatsAppNumberRequest(company_id=scoped)
            self.session.add(request)
        request.kind = "platform_number"
        request.phone_number = None
        request.updated_at = utcnow()
        try:
            await self.session.commit()
        except IntegrityError as error:
            await self.session.rollback()
            if is_unique_violation(error):
                raise conflict("Ya tienes una solicitud en curso. Recarga la página.") from error
            raise
        return number_request_dto(request) or {}

    async def cancel_number_request(self, company_id: str | None) -> None:
        scoped = _require_company(company_id)
        request = await self._find_request(scoped)
        if not request:
            raise not_found("No tienes una solicitud de número pendiente")
        await self.session.delete(request)
        await self.session.commit()

    async def upsert(
        self,
        company_id: str | None,
        *,
        twilio_whatsapp_number: str,
        display_phone_number: str | None,
        is_active: bool | None,
    ) -> dict[str, Any]:
        """Sender de plataforma asignado por el admin (reemplaza solicitud pendiente)."""
        active = True if is_active is None else is_active
        if active:
            await self.assert_whatsapp_prerequisites(company_id)
        scoped = _require_company(company_id)
        number = _e164(twilio_whatsapp_number, "Usa formato E.164 con +: +14155238886")
        display = normalize_whatsapp_e164(display_phone_number or "") or number
        if await self._number_taken_by_other(scoped, number) or (
            display != number and await self._number_taken_by_other(scoped, display)
        ):
            raise conflict(NUMBER_TAKEN_MESSAGE)
        await self._assert_sender_online(number)

        connection = await self._find(scoped)
        if connection is None:
            connection = WhatsAppConnection(company_id=scoped)
            self.session.add(connection)
        connection.twilio_whatsapp_number = number
        connection.display_phone_number = display
        connection.mode = "dedicated"
        connection.connection_kind = "platform_number"
        connection.onboarding_status = "online"
        connection.onboarding_error = None
        connection.is_active = active
        await self.session.execute(
            delete(WhatsAppNumberRequest).where(WhatsAppNumberRequest.company_id == scoped)
        )
        try:
            await self.session.commit()
        except IntegrityError as error:
            await self.session.rollback()
            if is_unique_violation(error):
                raise conflict("Ese número de WhatsApp ya está asignado a otra empresa") from error
            raise
        return connection_dto(connection)

    async def remove(self, company_id: str | None) -> None:
        scoped = _require_company(company_id)
        existing = await self._find(scoped)
        if not existing:
            raise not_found("Conexión WhatsApp no encontrada")
        await self.session.delete(existing)
        await self.session.commit()

    async def set_active(self, company_id: str | None, is_active: bool) -> dict[str, Any]:
        scoped = _require_company(company_id)
        existing = await self._find(scoped)
        if not existing:
            raise not_found("Tu tienda aún no tiene el canal de WhatsApp activado")
        if existing.onboarding_status != "online" or not existing.twilio_whatsapp_number:
            raise bad_request("El canal aún no está listo. Espera a que el sender quede en línea.")
        if is_active:
            await self.assert_whatsapp_prerequisites(scoped)
        existing.is_active = is_active
        existing.updated_at = utcnow()
        await self.session.commit()
        return connection_dto(existing)

    async def list_for_admin(self) -> list[dict[str, Any]]:
        companies = (
            await self.session.scalars(
                select(Company)
                .options(
                    selectinload(Company.owner),
                    selectinload(Company.mercado_pago_connection),
                    selectinload(Company.whatsapp_connection),
                    selectinload(Company.whatsapp_number_request),
                    selectinload(Company.subscription).selectinload(Subscription.plan),
                )
                .order_by(Company.created_at.desc())
            )
        ).all()
        active_by_company = dict(
            (
                await self.session.execute(
                    select(Product.company_id, func.count(Product.id))
                    .where(Product.status == "active")
                    .group_by(Product.company_id)
                )
            ).all()
        )
        products_by_company = dict(
            (
                await self.session.execute(
                    select(Product.company_id, func.count(Product.id)).group_by(Product.company_id)
                )
            ).all()
        )
        members_by_company = dict(
            (
                await self.session.execute(
                    select(CompanyMembership.company_id, func.count(CompanyMembership.id)).group_by(
                        CompanyMembership.company_id
                    )
                )
            ).all()
        )

        rows: list[dict[str, Any]] = []
        for company in companies:
            requirements = {
                "products": active_by_company.get(company.id, 0) > 0,
                "shipping": is_company_commerce_configured(company),
                "payments": is_company_payments_configured(company.mercado_pago_connection),
            }
            subscription = company.subscription
            whatsapp = company.whatsapp_connection
            number_request = company.whatsapp_number_request
            online = bool(whatsapp and whatsapp.onboarding_status == "online")
            rows.append(
                {
                    "id": company.id,
                    "name": company.name,
                    "type": company.type,
                    "ownerName": company.owner.name,
                    "ownerEmail": company.owner.email,
                    "membersCount": members_by_company.get(company.id, 0),
                    "productsCount": products_by_company.get(company.id, 0),
                    "createdAt": iso(company.created_at),
                    "planCode": subscription.plan.code if subscription else None,
                    "subscriptionStatus": subscription.status if subscription else None,
                    "requirements": requirements,
                    "awaitingNumber": all(requirements.values())
                    and (not online or bool(number_request)),
                    "whatsapp": connection_dto(whatsapp) if whatsapp else None,
                    "numberRequest": number_request_dto(number_request),
                }
            )
        return rows

    async def _find(self, company_id: str) -> WhatsAppConnection | None:
        return await self.session.scalar(
            select(WhatsAppConnection)
            .where(WhatsAppConnection.company_id == company_id)
            .options(selectinload(WhatsAppConnection.company))
            .execution_options(populate_existing=True)
        )

    async def _find_request(self, company_id: str) -> WhatsAppNumberRequest | None:
        return await self.session.scalar(
            select(WhatsAppNumberRequest).where(WhatsAppNumberRequest.company_id == company_id)
        )

    async def _is_paid_plan(self, company_id: str) -> bool:
        details = await BillingService(self.session).get_subscription_details(company_id)
        return details["planCode"] != "free"

    async def _assert_sender_online(self, sender: str) -> None:
        if await twilio_client.credentials() is None:
            return
        if sender == TWILIO_SANDBOX_NUMBER and not get_settings().is_production:
            return
        try:
            status = await twilio_client.find_whatsapp_sender_status(sender)
        except RuntimeError as error:
            raise bad_request(
                "No pudimos verificar el sender con Twilio. Inténtalo de nuevo en unos minutos."
            ) from error
        if status is None:
            raise bad_request("Ese sender no existe en la cuenta de Twilio de la plataforma.")
        if not status.upper().startswith("ONLINE"):
            raise bad_request(
                f"El sender aún no está activo en WhatsApp (estado: {status}). "
                "Inténtalo cuando esté en línea."
            )

    async def _number_taken_by_other(self, company_id: str, number: str) -> bool:
        taken = await self.session.scalar(
            select(WhatsAppConnection.id)
            .where(
                WhatsAppConnection.company_id != company_id,
                or_(
                    WhatsAppConnection.display_phone_number == number,
                    WhatsAppConnection.twilio_whatsapp_number == number,
                ),
            )
            .limit(1)
        )
        if taken is not None:
            return True
        requested = await self.session.scalar(
            select(WhatsAppNumberRequest.id)
            .where(
                WhatsAppNumberRequest.company_id != company_id,
                WhatsAppNumberRequest.phone_number == number,
            )
            .limit(1)
        )
        return requested is not None
