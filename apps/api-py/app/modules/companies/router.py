from typing import Annotated, Any

from fastapi import APIRouter, Response
from pydantic import field_validator

from app.core.db import DbSession
from app.core.responses import ok
from app.core.schemas import RequestModel
from app.core.security import CurrentUser, require_roles, set_session_cookies
from app.core.shared_data import company_country_codes
from app.core.validation import email, is_email, one_of, text
from app.models import CompanyTypeEnum
from app.modules.auth.service import AuthService
from app.modules.companies.service import CompaniesService

router = APIRouter(prefix="/company", tags=["company"])

SHIPPING_SCOPES = ("local", "national", "international")

CompanyName = Annotated[
    str,
    text(
        min_len=2,
        max_len=100,
        min_msg="El nombre de la empresa debe tener al menos 2 caracteres",
        max_msg="El nombre de la empresa no puede exceder 100 caracteres",
    ),
]
CompanyType = Annotated[str, one_of(CompanyTypeEnum.enums, "Selecciona un tipo de empresa válido")]
CountryCode = Annotated[
    str, one_of(company_country_codes(), "Selecciona un país con soporte de Mercado Pago")
]


class CreateCompanyBody(RequestModel):
    name: CompanyName
    company_type: CompanyType
    country_code: CountryCode


class UpdateCompanyBody(RequestModel):
    name: CompanyName
    company_type: CompanyType
    phone: Annotated[str, text(max_len=30, max_msg="El teléfono no puede exceder 30 caracteres")] | None = (
        None
    )
    contact_email: str | None = None
    website: (
        Annotated[str, text(max_len=255, max_msg="El sitio web no puede exceder 255 caracteres")] | None
    ) = None
    address: (
        Annotated[str, text(max_len=255, max_msg="La dirección no puede exceder 255 caracteres")] | None
    ) = None
    description: (
        Annotated[str, text(max_len=1000, max_msg="La descripción no puede exceder 1000 caracteres")] | None
    ) = None

    @field_validator("contact_email")
    @classmethod
    def _contact_email(cls, value: str | None) -> str | None:
        if value in (None, ""):
            return value
        if not is_email(value):
            raise ValueError("Ingresa un email de contacto válido")
        if len(value) > 255:
            raise ValueError("El email no puede exceder 255 caracteres")
        return value


class UpdateCommerceBody(RequestModel):
    country_code: str | None = None
    shipping_region: str | None = None
    shipping_city: str | None = None
    shipping_scopes: list[str]
    shipping_carriers: list[str]

    @field_validator("country_code")
    @classmethod
    def _country(cls, value: str | None) -> str | None:
        if value not in (None, "") and value not in company_country_codes():
            raise ValueError("Selecciona un país con soporte de Mercado Pago")
        return value

    @field_validator("shipping_region")
    @classmethod
    def _region(cls, value: str | None) -> str | None:
        if value and len(value) > 120:
            raise ValueError("Departamento máx. 120 caracteres")
        return value

    @field_validator("shipping_city")
    @classmethod
    def _city(cls, value: str | None) -> str | None:
        if value and len(value) > 120:
            raise ValueError("Municipio máx. 120 caracteres")
        return value

    @field_validator("shipping_scopes")
    @classmethod
    def _scopes(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("Hay alcances de envío duplicados")
        if any(scope not in SHIPPING_SCOPES for scope in value):
            raise ValueError("Alcance de envío inválido")
        return value

    @field_validator("shipping_carriers")
    @classmethod
    def _carriers(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("Hay transportadoras duplicadas")
        if len(value) > 20:
            raise ValueError("Máximo 20 transportadoras")
        if any(len(carrier) > 80 for carrier in value):
            raise ValueError("Cada transportadora máx. 80 caracteres")
        return value


class UpdateMemberRoleBody(RequestModel):
    role: Annotated[str, one_of(["user", "manager"], "El rol debe ser usuario o manager")]


class InviteBody(RequestModel):
    email: Annotated[str, email()]


class SwitchCompanyBody(RequestModel):
    company_id: Annotated[str, text(min_len=1, min_msg="Selecciona una empresa")]


@router.post("", status_code=201)
async def create_company(
    body: CreateCompanyBody, response: Response, user: CurrentUser, session: DbSession
) -> Any:
    company = await CompaniesService(session).create_company(user.id, body)
    auth = await AuthService(session).switch_company(user.id, company.id)
    set_session_cookies(response, auth.access_token, auth.refresh_token)
    return ok(auth.user)


@router.get("")
async def get_company(user: CurrentUser, session: DbSession) -> Any:
    return ok(await CompaniesService(session).get_company(user.company_id))


@router.patch("", dependencies=[require_roles("owner")])
async def update_company(body: UpdateCompanyBody, user: CurrentUser, session: DbSession) -> Any:
    return ok(await CompaniesService(session).update_company(user.company_id, body), "Empresa actualizada")


@router.patch("/commerce", dependencies=[require_roles("owner")])
async def update_commerce(body: UpdateCommerceBody, user: CurrentUser, session: DbSession) -> Any:
    details = await CompaniesService(session).update_commerce_settings(user.company_id, body)
    return ok(details, "Envíos actualizados")


@router.get("/members")
async def members(user: CurrentUser, session: DbSession) -> Any:
    return ok(await CompaniesService(session).list_members(user.company_id))


@router.patch("/members/{member_user_id}", dependencies=[require_roles("owner")])
async def update_member_role(
    member_user_id: str, body: UpdateMemberRoleBody, user: CurrentUser, session: DbSession
) -> Any:
    return ok(await CompaniesService(session).update_member_role(user.company_id, member_user_id, body.role))


@router.delete("/members/{member_user_id}", dependencies=[require_roles("owner")])
async def remove_member(member_user_id: str, user: CurrentUser, session: DbSession) -> Any:
    return ok(await CompaniesService(session).remove_member(user.company_id, user.id, member_user_id))


@router.post("/invitations", status_code=201, dependencies=[require_roles("owner")])
async def invite(body: InviteBody, user: CurrentUser, session: DbSession) -> Any:
    return ok(await CompaniesService(session).invite(user.company_id, body.email))


@router.get("/invitations", dependencies=[require_roles("owner")])
async def pending_invitations(user: CurrentUser, session: DbSession) -> Any:
    return ok(await CompaniesService(session).list_pending_invitations(user.company_id))


@router.delete("/invitations/{invitation_id}", dependencies=[require_roles("owner")])
async def cancel_invitation(invitation_id: str, user: CurrentUser, session: DbSession) -> Any:
    return ok(await CompaniesService(session).cancel_invitation(user.company_id, invitation_id))


@router.post("/switch")
async def switch(body: SwitchCompanyBody, response: Response, user: CurrentUser, session: DbSession) -> Any:
    auth = await AuthService(session).switch_company(user.id, body.company_id)
    set_session_cookies(response, auth.access_token, auth.refresh_token)
    return ok(auth.user)
