import logging
import re
from typing import Annotated, Any
from urllib.parse import unquote

from fastapi import APIRouter, Request, Response
from fastapi.responses import RedirectResponse

from app.core.db import DbSession
from app.core.rate_limit import limiter
from app.core.responses import ok
from app.core.schemas import RequestModel
from app.core.security import (
    REFRESH_TOKEN_COOKIE,
    CurrentUser,
    clear_session_cookies,
    set_session_cookies,
)
from app.core.shared_data import company_country_codes
from app.core.validation import email, one_of, text
from app.models import CompanyTypeEnum
from app.modules.auth.service import AuthService
from app.modules.billing.service import frontend_billing_return_url

logger = logging.getLogger("app.auth")
router = APIRouter(prefix="/auth", tags=["auth"])

AUTH_LIMIT = "10/minute"
"""Límite estricto para endpoints públicos sensibles (por IP / minuto)."""

PASSWORD_MIN = "La contraseña debe tener al menos 8 caracteres"
PASSWORD_MAX = "La contraseña no puede exceder 72 caracteres"
NAME_MIN = "El nombre debe tener al menos 2 caracteres"
NAME_MAX = "El nombre no puede exceder 100 caracteres"
Password = Annotated[str, text(min_len=8, max_len=72, min_msg=PASSWORD_MIN, max_msg=PASSWORD_MAX)]
PersonName = Annotated[str, text(min_len=2, max_len=100, min_msg=NAME_MIN, max_msg=NAME_MAX)]
Email = Annotated[str, email()]
InvitationToken = Annotated[str, text(min_len=16, min_msg="Token de invitación inválido")]


class RegisterBody(RequestModel):
    name: PersonName
    email: Email
    password: Password
    company_name: Annotated[
        str,
        text(
            min_len=2,
            max_len=100,
            min_msg="El nombre de la empresa debe tener al menos 2 caracteres",
            max_msg="El nombre de la empresa no puede exceder 100 caracteres",
        ),
    ]
    company_type: Annotated[str, one_of(CompanyTypeEnum.enums, "Selecciona un tipo de empresa válido")]
    country_code: Annotated[
        str, one_of(company_country_codes(), "Selecciona un país con soporte de Mercado Pago")
    ]
    plan_code: Annotated[str, one_of(["free", "pro", "business"], "Plan inválido")] | None = None
    billing_interval: Annotated[str, one_of(["month", "year"], "Intervalo inválido")] | None = None


class RegisterInvitedBody(RequestModel):
    name: PersonName
    password: Password
    token: InvitationToken


class AcceptInvitationBody(RequestModel):
    token: InvitationToken


class LoginBody(RequestModel):
    email: Email
    password: Annotated[str, text(min_len=8, min_msg=PASSWORD_MIN)]


class ForgotPasswordBody(RequestModel):
    email: Email


class ResetPasswordBody(RequestModel):
    token: Annotated[
        str, text(min_len=64, max_len=64, min_msg="El enlace es inválido", max_msg="El enlace es inválido")
    ]
    password: Password


@router.post("/register", status_code=201)
@limiter.limit(AUTH_LIMIT)
async def register(request: Request, response: Response, body: RegisterBody, session: DbSession) -> Any:
    outcome = await AuthService(session).register(body)
    if outcome.session:
        set_session_cookies(response, outcome.session.access_token, outcome.session.refresh_token)
    return ok(
        {
            "user": outcome.session.user if outcome.session else None,
            "checkoutRequired": outcome.checkout_required,
            "desiredPlanCode": outcome.desired_plan_code,
            "initPoint": outcome.init_point,
        }
    )


def _sanitize_mp_return_value(value: str | None) -> str | None:
    """MP a veces deja `valor?otra=cosa` dentro de un query param."""
    if not value or not value.strip():
        return None
    return value.split("?")[0].strip() or None


def _extract_embedded_query_param(raw: str | None, key: str) -> str | None:
    if not raw:
        return None
    match = re.search(rf"[?&]{key}=([^&]+)", raw, re.IGNORECASE)
    return unquote(match[1]) if match else None


async def _handle_mp_register_return(
    session: DbSession, pending_id_raw: str | None, status: str | None, preapproval_raw: str | None
) -> RedirectResponse:
    pending_id = _sanitize_mp_return_value(pending_id_raw)
    preapproval = (
        _sanitize_mp_return_value(preapproval_raw)
        or _extract_embedded_query_param(pending_id_raw, "preapproval_id")
        or None
    )
    try:
        completed = await AuthService(session).try_complete_pending_from_return(
            pending_id=pending_id, preapproval_id=preapproval
        )
        if completed:
            logger.info("mp-return: cuenta creada pendingId=%s", pending_id or "-")
        else:
            logger.warning(
                "mp-return: registro no completado pendingId=%s preapproval=%s",
                pending_id or "-",
                preapproval or "-",
            )
    except Exception:
        logger.exception("mp-return: error completando registro pendingId=%s", pending_id or "-")
    status_raw = _sanitize_mp_return_value(status) or "success"
    return RedirectResponse(frontend_billing_return_url(status_raw, "register"), status_code=302)


@router.get("/mp-return/{pending_id}")
async def mp_return_with_pending(pending_id: str, request: Request, session: DbSession) -> RedirectResponse:
    """Retorno HTTPS tras pago de registro: el pendingId va en el path porque MP corrompe la query."""
    params = request.query_params
    return await _handle_mp_register_return(
        session,
        pending_id,
        params.get("status"),
        params.get("preapproval_id") or params.get("preapprovalId"),
    )


@router.get("/mp-return")
async def mp_return(request: Request, session: DbSession) -> RedirectResponse:
    params = request.query_params
    return await _handle_mp_register_return(
        session,
        params.get("pendingId"),
        params.get("status"),
        params.get("preapproval_id") or params.get("preapprovalId"),
    )


@router.post("/register-invited", status_code=201)
@limiter.limit(AUTH_LIMIT)
async def register_invited(
    request: Request, response: Response, body: RegisterInvitedBody, session: DbSession
) -> Any:
    auth = await AuthService(session).register_invited(
        name=body.name, password=body.password, token=body.token
    )
    set_session_cookies(response, auth.access_token, auth.refresh_token)
    return ok(auth.user)


@router.get("/invitation")
async def invitation(session: DbSession, token: str = "") -> Any:
    return ok(await AuthService(session).get_invitation(token))


@router.post("/invitations/accept")
async def accept_invitation(
    response: Response, body: AcceptInvitationBody, user: CurrentUser, session: DbSession
) -> Any:
    auth = await AuthService(session).accept_invitation(user.id, body.token)
    set_session_cookies(response, auth.access_token, auth.refresh_token)
    return ok(auth.user)


@router.post("/login")
@limiter.limit(AUTH_LIMIT)
async def login(request: Request, response: Response, body: LoginBody, session: DbSession) -> Any:
    auth = await AuthService(session).login(body.email, body.password)
    set_session_cookies(response, auth.access_token, auth.refresh_token)
    return ok(auth.user)


@router.post("/refresh")
async def refresh(request: Request, response: Response, session: DbSession) -> Any:
    auth = await AuthService(session).refresh(request.cookies.get(REFRESH_TOKEN_COOKIE))
    set_session_cookies(response, auth.access_token, auth.refresh_token)
    return ok(auth.user)


@router.post("/forgot-password")
@limiter.limit(AUTH_LIMIT)
async def forgot_password(request: Request, body: ForgotPasswordBody, session: DbSession) -> Any:
    await AuthService(session).forgot_password(body.email)
    return ok(None, "Si existe una cuenta con ese email, recibirás un enlace para restablecer tu contraseña")


@router.post("/reset-password")
@limiter.limit(AUTH_LIMIT)
async def reset_password(request: Request, body: ResetPasswordBody, session: DbSession) -> Any:
    await AuthService(session).reset_password(body.token, body.password)
    return ok(None, "Contraseña actualizada, inicia sesión nuevamente")


@router.post("/logout")
async def logout(request: Request, response: Response, session: DbSession) -> Any:
    await AuthService(session).logout(request.cookies.get(REFRESH_TOKEN_COOKIE))
    clear_session_cookies(response)
    return ok(None)


@router.get("/me")
async def me(user: CurrentUser, session: DbSession) -> Any:
    return ok(await AuthService(session).get_me(user.id, user.company_id))
