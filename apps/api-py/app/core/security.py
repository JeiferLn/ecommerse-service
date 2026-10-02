import hashlib
import secrets
import time
from dataclasses import dataclass
from typing import Annotated

import bcrypt
import jwt
from fastapi import Depends, Request, Response

from app.core.config import get_settings
from app.core.errors import forbidden, unauthorized
from app.core.shared_data import has_capability

ACCESS_TOKEN_COOKIE = "access_token"
REFRESH_TOKEN_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = "/api/v1/auth"


@dataclass(frozen=True)
class AuthenticatedUser:
    id: str
    role: str
    company_id: str | None


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode(), password_hash.encode())
    except ValueError:
        return False


def sha256_hex(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def random_token(num_bytes: int = 32) -> str:
    return secrets.token_hex(num_bytes)


def sign_access_token(user_id: str, role: str, company_id: str | None) -> str:
    settings = get_settings()
    now = int(time.time())
    payload = {
        "sub": user_id,
        "role": role,
        "companyId": company_id,
        "type": "access",
        "iat": now,
        "exp": now + settings.ACCESS_TOKEN_TTL_SECONDS,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def set_session_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    settings = get_settings()
    response.set_cookie(
        ACCESS_TOKEN_COOKIE,
        access_token,
        max_age=settings.ACCESS_TOKEN_TTL_SECONDS,
        path="/",
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )
    response.set_cookie(
        REFRESH_TOKEN_COOKIE,
        refresh_token,
        max_age=settings.REFRESH_TOKEN_TTL_SECONDS,
        path=REFRESH_COOKIE_PATH,
        httponly=True,
        samesite="lax",
        secure=settings.COOKIE_SECURE,
    )


def clear_session_cookies(response: Response) -> None:
    response.delete_cookie(ACCESS_TOKEN_COOKIE, path="/")
    response.delete_cookie(REFRESH_TOKEN_COOKIE, path=REFRESH_COOKIE_PATH)


def get_current_user(request: Request) -> AuthenticatedUser:
    token = request.cookies.get(ACCESS_TOKEN_COOKIE)
    if not token:
        raise unauthorized("No autenticado")
    try:
        payload = jwt.decode(token, get_settings().JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise unauthorized("Token inválido o expirado") from exc
    return AuthenticatedUser(
        id=str(payload["sub"]), role=str(payload["role"]), company_id=payload.get("companyId")
    )


CurrentUser = Annotated[AuthenticatedUser, Depends(get_current_user)]


def require_roles(*roles: str):  # noqa: ANN201
    """Exige que el rol de la sesión esté en `roles` (403 si no)."""

    def dependency(user: CurrentUser) -> AuthenticatedUser:
        if user.role not in roles:
            raise forbidden()
        return user

    return Depends(dependency)


def require_capability(capability: str):  # noqa: ANN201
    def dependency(user: CurrentUser) -> AuthenticatedUser:
        if not has_capability(user.role, capability):
            raise forbidden()
        return user

    return Depends(dependency)


def require_company(user: AuthenticatedUser) -> str:
    if not user.company_id:
        raise forbidden("Necesitas una empresa activa")
    return user.company_id
