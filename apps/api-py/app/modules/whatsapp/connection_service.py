import re
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.errors import bad_request, conflict, not_found
from app.core.ids import iso, utcnow
from app.core.validation import is_unique_violation
from app.models import (
    Company,
    CompanyMembership,
    MercadoPagoConnection,
    Product,
    SharedNumberSession,
    Subscription,
    WhatsAppConnection,
)
from app.modules.billing.service import BillingService
from app.modules.companies.service import is_company_commerce_configured
from app.modules.payments.connection_service import is_company_payments_configured
from app.modules.platform.overrides import platform_overrides
from app.modules.whatsapp.phone import normalize_whatsapp_e164
from app.modules.whatsapp.store_code import build_store_link, build_wa_me_link, slugify_store_code

E164 = re.compile(r"^\+[1-9]\d{7,14}$", re.ASCII)


def normalize_shared_number(raw: str | None) -> str | None:
    value = (raw or "").strip()
    if not value:
        return None
    normalized = normalize_whatsapp_e164(value)
    return normalized if E164.match(normalized) else None


async def shared_number() -> str | None:
    """Número que comparten las tiendas sin número propio: el del panel de plataforma o, si no hay,
    el del `.env`. None si no está configurado."""
    saved = (await platform_overrides()).shared_whatsapp_number
    return normalize_shared_number(saved) or normalize_shared_number(
        get_settings().TWILIO_SHARED_WHATSAPP_NUMBER
    )


def connection_dto(
    connection: WhatsAppConnection, store_name: str | None = None, *, expose_shared_number: bool = False
) -> dict[str, Any]:
    """`expose_shared_number` solo para el panel de plataforma: las tiendas no ven el número compartido."""
    shared = connection.mode == "shared" and bool(connection.store_code)
    link: str | None
    if shared:
        link = build_store_link(get_settings().FRONTEND_URL, connection.store_code or "")
    else:
        link = build_wa_me_link(number=connection.display_phone_number or connection.twilio_whatsapp_number)
    return {
        "id": connection.id,
        "companyId": connection.company_id,
        "twilioWhatsAppNumber": None
        if shared and not expose_shared_number
        else connection.twilio_whatsapp_number,
        "displayPhoneNumber": connection.display_phone_number,
        "mode": connection.mode,
        "storeCode": connection.store_code,
        "isActive": connection.is_active,
        "waMeLink": link,
        "createdAt": iso(connection.created_at),
        "updatedAt": iso(connection.updated_at),
    }


def _require_company(company_id: str | None) -> str:
    if not company_id:
        raise bad_request("No perteneces a una empresa")
    return company_id


class WhatsAppConnectionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def assert_whatsapp_prerequisites(
        self, company_id: str | None, *, require_payments: bool = True
    ) -> None:
        """WhatsApp requiere un producto activo + envíos + Mercado Pago conectado.

        Los documentos de conocimiento son opcionales. "Prueba tu asistente" no cobra, así que puede
        omitir Mercado Pago.
        """
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
        return connection_dto(connection, connection.company.name) if connection else None

    async def activate_shared(self, company_id: str | None) -> dict[str, Any]:
        """Activa el canal con el número de la plataforma, sin intervención del admin.

        Si la tienda ya tiene conexión (compartida o propia), la devuelve tal cual.
        """
        scoped = _require_company(company_id)
        existing = await self._find(scoped)
        if existing:
            return connection_dto(existing, existing.company.name)

        await self.assert_whatsapp_prerequisites(scoped)
        number = await shared_number()
        if not number:
            raise bad_request(
                "El número compartido de la plataforma no está configurado. Escríbenos para activar tu canal."
            )

        store_name = await self.session.scalar(select(Company.name).where(Company.id == scoped)) or ""
        base = slugify_store_code(store_name)
        for _ in range(5):
            connection = WhatsAppConnection(
                company_id=scoped,
                twilio_whatsapp_number=number,
                display_phone_number=None,
                mode="shared",
                store_code=await self._next_free_store_code(base),
                is_active=True,
            )
            self.session.add(connection)
            try:
                await self.session.commit()
                return connection_dto(connection, store_name)
            except IntegrityError as error:
                await self.session.rollback()
                if not is_unique_violation(error):
                    raise
                raced = await self._find(scoped)
                if raced:
                    return connection_dto(raced, store_name)
        raise conflict("No se pudo generar el código de tu tienda. Inténtalo de nuevo.")

    async def upsert(
        self,
        company_id: str | None,
        *,
        twilio_whatsapp_number: str,
        display_phone_number: str | None,
        is_active: bool | None,
    ) -> dict[str, Any]:
        """Número propio asignado por la plataforma (reemplaza la conexión compartida si la había)."""
        active = True if is_active is None else is_active
        if active:
            await self.assert_whatsapp_prerequisites(company_id)
        scoped = _require_company(company_id)
        number = normalize_whatsapp_e164(twilio_whatsapp_number)
        if not E164.match(number):
            raise bad_request("Usa formato E.164 con +: +14155238886")
        if number == await shared_number():
            raise bad_request(
                "Ese es el número compartido de la plataforma; asígnale a la tienda un número propio."
            )
        display = (display_phone_number or "").strip() or number

        connection = await self._find(scoped)
        if connection:
            await self.session.execute(
                delete(SharedNumberSession).where(SharedNumberSession.connection_id == connection.id)
            )
            connection.store_code = None
        else:
            connection = WhatsAppConnection(company_id=scoped)
            self.session.add(connection)
        connection.twilio_whatsapp_number = number
        connection.display_phone_number = display
        connection.mode = "dedicated"
        connection.is_active = active
        try:
            await self.session.commit()
        except IntegrityError as error:
            await self.session.rollback()
            if is_unique_violation(error):
                raise conflict("Ese número de WhatsApp ya está asignado a otra empresa") from error
            raise
        store_name = await self.session.scalar(select(Company.name).where(Company.id == scoped))
        return connection_dto(connection, store_name, expose_shared_number=True)

    async def resolve_store_link(self, store_code: str) -> str:
        """URL de wa.me para el enlace público `/w/<código>`, con el número compartido vigente."""
        row = (
            await self.session.execute(
                select(WhatsAppConnection.twilio_whatsapp_number, Company.name)
                .join(Company, Company.id == WhatsAppConnection.company_id)
                .where(
                    WhatsAppConnection.store_code == store_code.strip().lower(),
                    WhatsAppConnection.mode == "shared",
                )
            )
        ).first()
        link = (
            build_wa_me_link(number=row[0], store_code=store_code.strip().lower(), store_name=row[1])
            if row
            else None
        )
        if not link:
            raise not_found("Este enlace de WhatsApp no existe o ya no está disponible")
        return link

    async def remove(self, company_id: str | None) -> None:
        scoped = _require_company(company_id)
        existing = await self._find(scoped)
        if not existing:
            raise not_found("Conexión WhatsApp no encontrada")
        await self.session.delete(existing)
        await self.session.commit()

    async def set_active(self, company_id: str | None, is_active: bool) -> dict[str, Any]:
        """Pausa o reactiva el asistente sin tocar el número asignado."""
        scoped = _require_company(company_id)
        existing = await self._find(scoped)
        if not existing:
            raise not_found("Tu tienda aún no tiene el canal de WhatsApp activado")
        if is_active:
            await self.assert_whatsapp_prerequisites(scoped)
        existing.is_active = is_active
        existing.updated_at = utcnow()
        await self.session.commit()
        return connection_dto(existing, existing.company.name)

    async def list_for_admin(self) -> list[dict[str, Any]]:
        """Empresas con el estado de sus requisitos y de su número, para el panel de plataforma."""
        companies = (
            await self.session.scalars(
                select(Company)
                .options(
                    selectinload(Company.owner),
                    selectinload(Company.mercado_pago_connection),
                    selectinload(Company.whatsapp_connection),
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
                    "awaitingNumber": all(requirements.values()) and not whatsapp,
                    "whatsapp": connection_dto(whatsapp, company.name, expose_shared_number=True)
                    if whatsapp
                    else None,
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

    async def _next_free_store_code(self, base: str) -> str:
        """Primer código libre a partir de `base`: base, base-2, base-3…"""
        taken = (
            await self.session.scalars(
                select(WhatsAppConnection.store_code).where(WhatsAppConnection.store_code.startswith(base))
            )
        ).all()
        used = set(taken)
        if base not in used:
            return base
        suffix = 2
        while f"{base}-{suffix}" in used:
            suffix += 1
        return f"{base}-{suffix}"
