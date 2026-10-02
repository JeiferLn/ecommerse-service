import logging
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.errors import ApiError, bad_request, conflict, forbidden, not_found, unauthorized
from app.core.ids import new_id, utcnow
from app.core.security import hash_password, random_token, sha256_hex, sign_access_token, verify_password
from app.core.validation import is_unique_violation
from app.models import (
    Company,
    CompanyMembership,
    Invitation,
    PasswordResetToken,
    PendingRegistration,
    RefreshToken,
    User,
)
from app.modules.billing.service import BillingService, parse_pending_registration_external_ref
from app.modules.mail.service import MailService
from app.modules.users.service import UsersService

logger = logging.getLogger("app.auth")
PENDING_REGISTRATION_TTL = timedelta(hours=24)


def gone(message: str) -> ApiError:
    return ApiError(410, message)


@dataclass
class AuthSession:
    user: dict[str, Any]
    access_token: str
    refresh_token: str


@dataclass
class RegisterOutcome:
    session: AuthSession | None
    checkout_required: bool
    desired_plan_code: str | None
    init_point: str | None


class AuthService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session
        self.users = UsersService(session)
        self.billing = BillingService(session)

    async def forgot_password(self, email: str) -> None:
        user = await self.users.find_by_email(email)
        if not user:
            return
        token = random_token()
        await self.session.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user.id))
        self.session.add(
            PasswordResetToken(
                token_hash=sha256_hex(token),
                user_id=user.id,
                expires_at=utcnow() + timedelta(seconds=get_settings().RESET_TOKEN_TTL_SECONDS),
            )
        )
        await self.session.commit()
        frontend_url = get_settings().FRONTEND_URL
        await MailService().send_password_reset(
            to=user.email, reset_url=f"{frontend_url}/reset-password?token={token}"
        )

    async def register(self, dto: Any) -> RegisterOutcome:
        password_hash = hash_password(dto.password)
        email = dto.email.strip().lower()

        invitation = await self.session.scalar(select(Invitation).where(Invitation.email == email))
        if invitation:
            if invitation.expires_at <= utcnow():
                await self.session.delete(invitation)
                await self.session.commit()
            else:
                session = await self._register_invited_member(dto.name, password_hash, invitation)
                return RegisterOutcome(session, False, None, None)

        desired_plan_code = dto.plan_code or "free"
        if desired_plan_code in ("pro", "business"):
            return await self._register_paid_pending(dto, email, password_hash, desired_plan_code)

        await self.billing.ensure_plans_seeded()
        await self.session.execute(delete(PendingRegistration).where(PendingRegistration.email == email))
        try:
            user = User(name=dto.name, email=email, password_hash=password_hash, role="owner")
            self.session.add(user)
            await self.session.flush()
            company = Company(
                name=dto.company_name,
                type=dto.company_type,
                country_code=dto.country_code.strip().upper(),
                owner_id=user.id,
            )
            self.session.add(company)
            await self.session.flush()
            self.session.add(CompanyMembership(user_id=user.id, company_id=company.id, role="owner"))
            await self.billing.start_trial_for_company(company.id, None, None)
            await self.session.commit()
        except IntegrityError as error:
            await self.session.rollback()
            if is_unique_violation(error):
                raise conflict("Ya existe una cuenta con ese email") from error
            raise
        session = await self._create_session(user, company.id, "owner")
        return RegisterOutcome(session, False, None, None)

    async def _register_paid_pending(
        self, dto: Any, email: str, password_hash: str, plan_code: str
    ) -> RegisterOutcome:
        if await self.users.find_by_email(email):
            raise conflict("Ya existe una cuenta con ese email")
        interval = dto.billing_interval or "month"
        if interval not in ("month", "year"):
            raise bad_request("Intervalo de facturación inválido")

        await self.billing.ensure_plans_seeded()
        expires_at = utcnow() + PENDING_REGISTRATION_TTL
        values = {
            "name": dto.name,
            "password_hash": password_hash,
            "company_name": dto.company_name,
            "company_type": dto.company_type,
            "country_code": dto.country_code.strip().upper(),
            "plan_code": plan_code,
            "billing_interval": interval,
            "expires_at": expires_at,
        }
        table = PendingRegistration.__table__
        column_names = {attr: PendingRegistration.__mapper__.c[attr].name for attr in values}
        stmt = (
            insert(PendingRegistration)
            .values(id=new_id(), email=email, created_at=utcnow(), **values)
            .on_conflict_do_update(
                index_elements=["email"],
                set_={
                    **{column_names[attr]: value for attr, value in values.items()},
                    table.c.completedAt.name: None,
                    table.c.mpPreapprovalId.name: None,
                },
            )
            .returning(table.c.id)
        )
        try:
            pending_id = (await self.session.execute(stmt)).scalar_one()
            await self.session.commit()
        except IntegrityError as error:
            await self.session.rollback()
            if is_unique_violation(error):
                raise conflict("Ya existe una cuenta con ese email") from error
            raise

        try:
            result = await self.billing.create_pending_registration_checkout(
                pending_id=pending_id, payer_email=email, plan_code=plan_code, interval=interval
            )
            if result["mpPreapprovalId"]:
                await self.session.execute(
                    update(PendingRegistration)
                    .where(PendingRegistration.id == pending_id)
                    .values(mp_preapproval_id=result["mpPreapprovalId"])
                )
                await self.session.commit()
            return RegisterOutcome(None, True, plan_code, result["initPoint"])
        except Exception:
            await self.session.rollback()
            await self.session.execute(
                delete(PendingRegistration).where(PendingRegistration.id == pending_id)
            )
            await self.session.commit()
            raise

    async def complete_pending_registration(
        self, pending_id: str, *, mp_preapproval_id: str | None = None, mp_payment_id: str | None = None
    ) -> bool:
        """Completa un registro pendiente tras autorización/cobro de MP. Idempotente."""
        pending = await self.session.get(PendingRegistration, pending_id)
        if not pending:
            return False
        if pending.completed_at:
            return True
        if pending.expires_at <= utcnow():
            await self.session.delete(pending)
            await self.session.commit()
            return False

        preapproval = mp_preapproval_id or pending.mp_preapproval_id
        if await self.users.find_by_email(pending.email):
            pending.completed_at = utcnow()
            pending.mp_preapproval_id = preapproval
            await self.session.commit()
            return True

        await self.billing.ensure_plans_seeded()
        try:
            user = User(
                name=pending.name, email=pending.email, password_hash=pending.password_hash, role="owner"
            )
            self.session.add(user)
            await self.session.flush()
            company = Company(
                name=pending.company_name,
                type=pending.company_type,
                country_code=pending.country_code,
                owner_id=user.id,
            )
            self.session.add(company)
            await self.session.flush()
            self.session.add(CompanyMembership(user_id=user.id, company_id=company.id, role="owner"))
            await self.billing.create_active_paid_subscription(
                company.id, pending.plan_code, pending.billing_interval, preapproval, mp_payment_id
            )
            pending.completed_at = utcnow()
            pending.mp_preapproval_id = preapproval
            await self.session.commit()
            return True
        except IntegrityError as error:
            await self.session.rollback()
            if not is_unique_violation(error):
                raise
            await self.session.execute(
                update(PendingRegistration)
                .where(PendingRegistration.id == pending_id)
                .values(completed_at=utcnow())
            )
            await self.session.commit()
            return True

    async def try_complete_pending_from_preapproval(self, preapproval_id: str) -> bool:
        parsed = await self.billing.resolve_pending_from_preapproval(preapproval_id)
        if parsed:
            return await self.complete_pending_registration(
                parsed["pendingId"], mp_preapproval_id=preapproval_id
            )
        by_mp = await self.session.scalar(
            select(PendingRegistration).where(
                PendingRegistration.mp_preapproval_id == preapproval_id,
                PendingRegistration.completed_at.is_(None),
            )
        )
        if not by_mp or not await self.billing.is_preapproval_authorized(preapproval_id):
            return False
        return await self.complete_pending_registration(by_mp.id, mp_preapproval_id=preapproval_id)

    async def try_complete_pending_from_return(
        self, *, pending_id: str | None, preapproval_id: str | None
    ) -> bool:
        preapproval_id = (preapproval_id or "").strip() or None
        if preapproval_id and await self.try_complete_pending_from_preapproval(preapproval_id):
            return True
        pending_id = (pending_id or "").strip() or None
        if not pending_id:
            return False
        pending = await self.session.get(PendingRegistration, pending_id)
        if not pending:
            return False
        if pending.completed_at:
            return True
        if not pending.mp_preapproval_id:
            return False
        if not await self.billing.is_preapproval_authorized(pending.mp_preapproval_id):
            return False
        return await self.complete_pending_registration(
            pending.id, mp_preapproval_id=pending.mp_preapproval_id
        )

    async def try_complete_pending_from_external_ref(
        self, external: str, payment_id: str | None = None
    ) -> bool:
        parsed = parse_pending_registration_external_ref(external)
        if not parsed:
            return False
        return await self.complete_pending_registration(parsed["pendingId"], mp_payment_id=payment_id)

    async def _register_invited_member(
        self, name: str, password_hash: str, invitation: Invitation
    ) -> AuthSession:
        company_id = invitation.company_id
        invitation_email = invitation.email
        try:
            user = User(name=name, email=invitation_email, password_hash=password_hash, role="user")
            self.session.add(user)
            await self.session.flush()
            self.session.add(CompanyMembership(user_id=user.id, company_id=company_id, role="user"))
            await self.session.execute(delete(Invitation).where(Invitation.email == invitation_email))
            await self.session.commit()
        except IntegrityError as error:
            await self.session.rollback()
            if is_unique_violation(error):
                raise conflict("Ya existe una cuenta con ese email") from error
            raise
        return await self._create_session(user, company_id, "user")

    async def _valid_invitation(self, token: str) -> Invitation:
        invitation = await self.session.scalar(
            select(Invitation).where(Invitation.token == token).options(selectinload(Invitation.company))
        )
        if not invitation:
            raise not_found("Invitación no encontrada")
        if invitation.expires_at <= utcnow():
            await self.session.delete(invitation)
            await self.session.commit()
            raise gone("La invitación expiró")
        return invitation

    async def get_invitation(self, token: str) -> dict[str, Any]:
        invitation = await self._valid_invitation(token)
        account = await self.users.find_by_email(invitation.email)
        return {
            "email": invitation.email,
            "companyName": invitation.company.name,
            "hasAccount": account is not None,
        }

    async def register_invited(self, *, name: str, password: str, token: str) -> AuthSession:
        invitation = await self._valid_invitation(token)
        if await self.users.find_by_email(invitation.email):
            raise conflict("Ya existe una cuenta con ese email. Inicia sesión para aceptar la invitación")
        return await self._register_invited_member(name, hash_password(password), invitation)

    async def accept_invitation(self, user_id: str, token: str) -> AuthSession:
        invitation = await self._valid_invitation(token)
        user = await self.users.find_by_id(user_id)
        if not user:
            raise unauthorized("Usuario no encontrado")
        if user.role == "admin":
            raise bad_request("Un administrador de la plataforma no puede unirse a una empresa")
        if user.email != invitation.email:
            raise forbidden("Esta invitación es para otro email")

        company_id = invitation.company_id
        await self.session.execute(
            insert(CompanyMembership)
            .values(id=new_id(), user_id=user_id, company_id=company_id, role="user", created_at=utcnow())
            .on_conflict_do_nothing(index_elements=["userId", "companyId"])
        )
        await self.session.delete(invitation)
        await self.session.commit()
        role = await self.session.scalar(
            select(CompanyMembership.role).where(
                CompanyMembership.user_id == user_id, CompanyMembership.company_id == company_id
            )
        )
        return await self._create_session(user, company_id, role or "user")

    async def login(self, email: str, password: str) -> AuthSession:
        user = await self.users.find_by_email(email)
        if not user or not verify_password(password, user.password_hash):
            raise unauthorized("Credenciales inválidas")
        memberships = (
            await self.session.scalars(
                select(CompanyMembership)
                .where(CompanyMembership.user_id == user.id)
                .order_by(CompanyMembership.created_at)
            )
        ).all()
        active = next((m for m in memberships if m.role == "owner"), memberships[0] if memberships else None)
        return await self._create_session(
            user, active.company_id if active else None, active.role if active else user.role
        )

    async def refresh(self, refresh_token: str | None) -> AuthSession:
        expired = "Sesión expirada, inicia sesión nuevamente"
        if not refresh_token:
            raise unauthorized(expired)
        record = await self.session.scalar(
            select(RefreshToken).where(RefreshToken.token_hash == sha256_hex(refresh_token))
        )
        if not record or record.revoked_at is not None or record.expires_at < utcnow():
            raise unauthorized(expired)
        record.revoked_at = utcnow()
        await self.session.commit()

        user = await self.users.find_by_id(record.user_id)
        if not user:
            raise unauthorized(expired)
        role = await self._effective_role(user.id, record.company_id, user.role)
        return await self._create_session(user, record.company_id, role)

    async def logout(self, refresh_token: str | None) -> None:
        if not refresh_token:
            return
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.token_hash == sha256_hex(refresh_token), RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )
        await self.session.commit()

    async def get_me(self, user_id: str, company_id: str | None) -> dict[str, Any]:
        user = await self.users.to_auth_user(user_id, company_id)
        if not user:
            raise unauthorized("Usuario no encontrado")
        return user

    async def switch_company(self, user_id: str, company_id: str) -> AuthSession:
        membership = await self.session.scalar(
            select(CompanyMembership).where(
                CompanyMembership.user_id == user_id, CompanyMembership.company_id == company_id
            )
        )
        if not membership:
            raise bad_request("No eres miembro de esa empresa")
        user = await self.users.find_by_id(user_id)
        if not user:
            raise unauthorized("Usuario no encontrado")
        return await self._create_session(user, company_id, membership.role)

    async def reset_password(self, token: str, password: str) -> None:
        record = await self.session.scalar(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == sha256_hex(token))
        )
        if not record or record.expires_at < utcnow():
            raise bad_request("El enlace es inválido o ha expirado")
        user_id = record.user_id
        await self.session.execute(
            update(User).where(User.id == user_id).values(password_hash=hash_password(password))
        )
        await self.session.execute(delete(PasswordResetToken).where(PasswordResetToken.user_id == user_id))
        await self.session.execute(
            update(RefreshToken)
            .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
            .values(revoked_at=utcnow())
        )
        await self.session.commit()

    async def _effective_role(self, user_id: str, company_id: str | None, fallback_role: str) -> str:
        if not company_id:
            return fallback_role
        role = await self.session.scalar(
            select(CompanyMembership.role).where(
                CompanyMembership.user_id == user_id, CompanyMembership.company_id == company_id
            )
        )
        return role or fallback_role

    async def _create_session(self, user: User, company_id: str | None, role: str) -> AuthSession:
        access_token = sign_access_token(user.id, role, company_id)
        refresh_token = random_token()
        self.session.add(
            RefreshToken(
                token_hash=sha256_hex(refresh_token),
                user_id=user.id,
                company_id=company_id,
                expires_at=utcnow() + timedelta(seconds=get_settings().REFRESH_TOKEN_TTL_SECONDS),
            )
        )
        await self.session.commit()
        auth_user = await self.users.to_auth_user(user.id, company_id) or {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": role,
            "companyId": company_id,
            "companies": [],
        }
        return AuthSession(auth_user, access_token, refresh_token)
