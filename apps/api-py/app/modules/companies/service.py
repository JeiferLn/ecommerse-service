import re
from datetime import timedelta
from typing import Any

from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import bad_request, conflict, not_found, unauthorized
from app.core.ids import iso, utcnow
from app.core.security import random_token
from app.core.shared_data import is_supported_company_country
from app.models import (
    Company,
    CompanyMembership,
    Conversation,
    Invitation,
    MercadoPagoConnection,
    Product,
    RefreshToken,
    User,
    WhatsAppConnection,
)
from app.modules.billing.service import BillingService
from app.modules.knowledge.service import KnowledgeService
from app.modules.mail.service import MailService
from app.modules.payments.connection_service import payments_settings
from app.modules.users.service import UsersService

INVITATION_TTL_SECONDS = 3600


def _require_company(company_id: str | None) -> str:
    if not company_id:
        raise bad_request("No perteneces a una empresa")
    return company_id


def _nullable_text(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def _normalize_string_list(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        trimmed = re.sub(r"\s+", " ", value.strip())
        if not trimmed or trimmed.lower() in seen:
            continue
        seen.add(trimmed.lower())
        result.append(trimmed)
    return result


def is_company_commerce_configured(company: Company) -> bool:
    if not (company.country_code or "").strip():
        return False
    if not company.shipping_scopes or not company.shipping_carriers:
        return False
    return "local" not in company.shipping_scopes or bool(
        (company.shipping_region or "").strip() and (company.shipping_city or "").strip()
    )


class CompaniesService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_members(self, company_id: str | None) -> list[dict[str, Any]]:
        scoped = _require_company(company_id)
        rows = (
            await self.session.execute(
                select(CompanyMembership, User)
                .join(User, User.id == CompanyMembership.user_id)
                .where(CompanyMembership.company_id == scoped)
                .order_by(CompanyMembership.created_at)
            )
        ).all()
        return [
            {"id": user.id, "name": user.name, "email": user.email, "role": membership.role}
            for membership, user in rows
        ]

    async def _load_company(self, company_id: str) -> Company:
        company = await self.session.get(Company, company_id)
        if not company:
            raise not_found("Empresa no encontrada")
        return company

    async def get_company(self, company_id: str | None) -> dict[str, Any]:
        company = await self._load_company(_require_company(company_id))
        return await self._to_company_details(company)

    async def update_company(self, company_id: str | None, data: Any) -> dict[str, Any]:
        company = await self._load_company(_require_company(company_id))
        company.name = data.name
        company.type = data.company_type
        company.phone = _nullable_text(data.phone)
        contact_email = _nullable_text(data.contact_email)
        company.contact_email = contact_email.lower() if contact_email else None
        company.website = _nullable_text(data.website)
        company.address = _nullable_text(data.address)
        company.description = _nullable_text(data.description)
        await self.session.commit()
        return await self._to_company_details(company)

    async def update_commerce_settings(self, company_id: str | None, data: Any) -> dict[str, Any]:
        company = await self._load_company(_require_company(company_id))
        shipping_carriers = _normalize_string_list(data.shipping_carriers)
        shipping_region = _nullable_text(data.shipping_region)
        shipping_city = _nullable_text(data.shipping_city)

        # País se fija en el registro; solo se puede completar si aún es null (empresas legacy).
        country_code = company.country_code
        if not country_code:
            incoming = (data.country_code or "").strip().upper() or None
            if incoming and not is_supported_company_country(incoming):
                raise bad_request("Selecciona un país con soporte de Mercado Pago (LatAm)")
            country_code = incoming

        if data.shipping_scopes and not shipping_carriers:
            raise bad_request("Indica al menos una empresa de transporte / transportadora")
        if "local" in data.shipping_scopes and (not shipping_region or not shipping_city):
            raise bad_request("Indica departamento y municipio base de la tienda para validar envíos locales")

        company.country_code = country_code
        company.shipping_region = shipping_region
        company.shipping_city = shipping_city
        company.shipping_scopes = list(data.shipping_scopes)
        company.shipping_carriers = shipping_carriers
        # El pago lo maneja la pasarela (Fase 9); no lo configura la tienda en el chat.
        company.payment_methods = []
        company.banks = []
        await self.session.commit()
        return await self._to_company_details(company)

    async def _to_company_details(self, company: Company) -> dict[str, Any]:
        knowledge = await KnowledgeService(self.session).get_settings(company.id)
        active_products = await self.session.scalar(
            select(func.count(Product.id)).where(Product.company_id == company.id, Product.status == "active")
        )
        playground = await self.session.scalar(
            select(Conversation.id)
            .where(Conversation.company_id == company.id, Conversation.is_playground.is_(True))
            .limit(1)
        )
        whatsapp_active = await self.session.scalar(
            select(WhatsAppConnection.is_active).where(WhatsAppConnection.company_id == company.id)
        )
        connection = await self.session.scalar(
            select(MercadoPagoConnection).where(MercadoPagoConnection.company_id == company.id)
        )
        return {
            "id": company.id,
            "name": company.name,
            "type": company.type,
            "phone": company.phone,
            "contactEmail": company.contact_email,
            "website": company.website,
            "address": company.address,
            "description": company.description,
            "commerce": {
                "countryCode": company.country_code,
                "shippingRegion": company.shipping_region,
                "shippingCity": company.shipping_city,
                "shippingScopes": company.shipping_scopes,
                "shippingCarriers": company.shipping_carriers,
                "isConfigured": is_company_commerce_configured(company),
            },
            "knowledge": knowledge,
            "payments": payments_settings(connection),
            "onboarding": {
                "activeProducts": active_products or 0,
                "playgroundTried": playground is not None,
                "whatsappAssigned": whatsapp_active is not None,
                "whatsappActive": bool(whatsapp_active),
            },
            "createdAt": iso(company.created_at),
        }

    async def list_pending_invitations(self, company_id: str | None) -> list[dict[str, Any]]:
        scoped = _require_company(company_id)
        await self.session.execute(
            delete(Invitation).where(Invitation.company_id == scoped, Invitation.expires_at <= utcnow())
        )
        await self.session.commit()
        invitations = (
            await self.session.scalars(
                select(Invitation)
                .where(Invitation.company_id == scoped)
                .order_by(Invitation.created_at.desc())
            )
        ).all()
        return [
            {"id": invitation.id, "email": invitation.email, "createdAt": iso(invitation.created_at)}
            for invitation in invitations
        ]

    async def cancel_invitation(self, company_id: str | None, invitation_id: str) -> dict[str, Any]:
        scoped = _require_company(company_id)
        invitation = await self.session.get(Invitation, invitation_id)
        if not invitation or invitation.company_id != scoped:
            raise not_found("Invitación no encontrada")
        await self.session.delete(invitation)
        await self.session.commit()
        return {"status": "cancelled", "message": "Invitación cancelada"}

    async def create_company(self, user_id: str, data: Any) -> Company:
        user = await UsersService(self.session).find_by_id(user_id)
        if not user:
            raise unauthorized("Usuario no encontrado")
        if user.role == "admin":
            raise bad_request("Un administrador de la plataforma no puede crear una empresa")
        owner_membership = await self.session.scalar(
            select(CompanyMembership.id).where(
                CompanyMembership.user_id == user_id, CompanyMembership.role == "owner"
            )
        )
        if owner_membership:
            raise conflict("Ya eres dueño de una empresa")

        company = Company(
            name=data.name,
            type=data.company_type,
            country_code=data.country_code.strip().upper(),
            owner_id=user_id,
        )
        self.session.add(company)
        await self.session.flush()
        self.session.add(CompanyMembership(user_id=user_id, company_id=company.id, role="owner"))
        await BillingService(self.session).start_trial_for_company(company.id, None)
        await self.session.commit()
        return company

    async def _find_membership(self, company_id: str, user_id: str) -> CompanyMembership | None:
        return await self.session.scalar(
            select(CompanyMembership).where(
                CompanyMembership.user_id == user_id, CompanyMembership.company_id == company_id
            )
        )

    async def update_member_role(
        self, company_id: str | None, member_user_id: str, role: str
    ) -> dict[str, Any]:
        scoped = _require_company(company_id)
        membership = await self._find_membership(scoped, member_user_id)
        if not membership:
            raise not_found("Ese usuario no es miembro de esta empresa")
        if membership.role == "owner":
            raise bad_request("No puedes cambiar el rol del dueño de la empresa")
        user = await self.session.get(User, member_user_id)
        membership.role = role
        await self.session.commit()
        assert user is not None
        return {"id": user.id, "name": user.name, "email": user.email, "role": role}

    async def remove_member(
        self, company_id: str | None, actor_user_id: str, member_user_id: str
    ) -> dict[str, Any]:
        scoped = _require_company(company_id)
        if actor_user_id == member_user_id:
            raise bad_request("No puedes eliminarte a ti mismo de la empresa")
        membership = await self._find_membership(scoped, member_user_id)
        if not membership:
            raise not_found("Ese usuario no es miembro de esta empresa")
        if membership.role == "owner":
            raise bad_request("No puedes eliminar al dueño de la empresa")
        await self.session.delete(membership)
        await self.session.execute(
            update(RefreshToken)
            .where(
                RefreshToken.user_id == member_user_id,
                RefreshToken.company_id == scoped,
                RefreshToken.revoked_at.is_(None),
            )
            .values(revoked_at=utcnow())
        )
        await self.session.commit()
        return {"message": "Miembro eliminado de la empresa"}

    async def invite(self, company_id: str | None, email: str) -> dict[str, Any]:
        scoped = _require_company(company_id)
        await BillingService(self.session).assert_can(scoped, "invite_member")

        normalized = email.lower()
        existing = await UsersService(self.session).find_by_email(normalized)
        if existing and existing.role == "admin":
            raise bad_request("No se puede invitar a un administrador de la plataforma")
        if existing and await self._find_membership(scoped, existing.id):
            raise conflict("Ese usuario ya es miembro de esta empresa")

        pending = await self.session.scalar(
            select(Invitation).where(Invitation.company_id == scoped, Invitation.email == normalized)
        )
        if pending:
            if pending.expires_at > utcnow():
                raise conflict("Ya existe una invitación pendiente para ese email")
            await self.session.delete(pending)
            await self.session.flush()

        invitation = Invitation(
            token=random_token(),
            company_id=scoped,
            email=normalized,
            expires_at=utcnow() + timedelta(seconds=INVITATION_TTL_SECONDS),
        )
        self.session.add(invitation)
        await self.session.commit()

        try:
            company = await self._load_company(scoped)
            frontend = get_settings().FRONTEND_URL
            await MailService().send_company_invitation(
                to=invitation.email,
                company_name=company.name,
                register_url=f"{frontend}/register/invitation?token={invitation.token}",
            )
        except Exception:
            await self.session.delete(invitation)
            await self.session.commit()
            raise

        return {"status": "pending", "message": "Invitación enviada: revisa el correo para aceptarla"}
