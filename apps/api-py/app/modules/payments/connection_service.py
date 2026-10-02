import base64
import hashlib
import hmac
import json
import logging
import time
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

import httpx
from sqlalchemy import select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import bad_request, not_found, service_unavailable
from app.core.ids import iso, new_id, utcnow
from app.integrations.mercadopago import MercadoPagoError, mp_request
from app.models import MercadoPagoConnection, WhatsAppConnection

logger = logging.getLogger("app.payments.connection")

OAUTH_STATE_TTL_MS = 15 * 60 * 1000
REFRESH_IF_WITHIN = timedelta(days=7)
"""Renovar si quedan menos de 7 días (token OAuth dura ~180 días)."""


def is_company_payments_configured(connection: MercadoPagoConnection | None) -> bool:
    return bool(connection and (connection.access_token or "").strip())


def is_oauth_configured() -> bool:
    settings = get_settings()
    return bool(
        (settings.MP_CLIENT_ID or "").strip() and (settings.MP_CLIENT_SECRET or "").strip() and redirect_uri()
    )


def redirect_uri() -> str | None:
    settings = get_settings()
    explicit = (settings.MP_REDIRECT_URI or "").strip()
    if explicit:
        return explicit.rstrip("/")
    api_public = (settings.API_PUBLIC_URL or "").strip()
    if not api_public:
        return None
    return f"{api_public.rstrip('/')}/api/v1/payments/mercadopago/oauth/callback"


def connection_view(connection: MercadoPagoConnection, oauth_available: bool | None = None) -> dict[str, Any]:
    return {
        "isConnected": True,
        "mpUserId": connection.mp_user_id,
        "mpNickname": connection.mp_nickname,
        "mpEmail": connection.mp_email,
        "mpFirstName": connection.mp_first_name,
        "mpLastName": connection.mp_last_name,
        "mpSiteId": connection.mp_site_id,
        "publicKey": connection.public_key,
        "source": connection.source,
        "liveMode": connection.live_mode,
        "connectedAt": iso(connection.connected_at),
        "tokenExpiresAt": iso(connection.token_expires_at),
        "oauthAvailable": is_oauth_configured() if oauth_available is None else oauth_available,
    }


def payments_settings(connection: MercadoPagoConnection | None) -> dict[str, Any]:
    oauth_available = is_oauth_configured()
    if not connection or not is_company_payments_configured(connection):
        return {"isConfigured": False, "connection": None, "oauthAvailable": oauth_available}
    return {
        "isConfigured": True,
        "connection": connection_view(connection, oauth_available),
        "oauthAvailable": oauth_available,
    }


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def sign_state(payload: dict[str, Any]) -> str:
    secret = get_settings().JWT_SECRET.encode()
    body = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64url(hmac.new(secret, body.encode(), hashlib.sha256).digest())
    return f"{body}.{sig}"


def verify_state(state: str) -> dict[str, Any]:
    body, _, sig = state.partition(".")
    if not body or not sig:
        raise ValueError("state inválido")
    secret = get_settings().JWT_SECRET.encode()
    expected = _b64url(hmac.new(secret, body.encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(sig, expected):
        raise ValueError("state firmado inválido")
    payload = json.loads(_b64url_decode(body).decode())
    if not payload.get("companyId") or not payload.get("userId") or not payload.get("exp"):
        raise ValueError("state incompleto")
    if payload["exp"] < time.time() * 1000:
        raise ValueError("state expirado")
    return payload


async def fetch_seller_profile(access_token: str) -> dict[str, Any]:
    """Perfil público del vendedor vía GET /users/me (Mercado Libre/Pago)."""
    empty: dict[str, Any] = {
        "mp_user_id": None,
        "mp_nickname": None,
        "mp_email": None,
        "mp_first_name": None,
        "mp_last_name": None,
        "mp_site_id": None,
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                "https://api.mercadolibre.com/users/me",
                headers={"Authorization": f"Bearer {access_token}", "Accept": "application/json"},
            )
        if response.status_code >= 400:
            logger.warning("users/me respondió %s", response.status_code)
            return empty
        data = response.json()
    except Exception as error:  # noqa: BLE001
        logger.warning("No se pudo obtener perfil MP: %s", error)
        return empty

    def clean(key: str) -> str | None:
        value = data.get(key)
        return value.strip() or None if isinstance(value, str) else None

    tags = data.get("tags") or []
    return {
        "mp_user_id": str(data["id"]) if data.get("id") is not None else None,
        "mp_nickname": clean("nickname"),
        "mp_email": clean("email"),
        "mp_first_name": clean("first_name"),
        "mp_last_name": clean("last_name"),
        "mp_site_id": clean("site_id"),
        "live_mode_hint": "test_user" not in tags,
    }


async def post_oauth_token(body: dict[str, str]) -> dict[str, Any]:
    try:
        return await mp_request("POST", "/oauth/token", json=body)
    except MercadoPagoError as error:
        raise RuntimeError(str(error) or f"OAuth HTTP {error.status}") from error


class MercadoPagoConnectionService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    @staticmethod
    def _require_company(company_id: str | None) -> str:
        if not company_id:
            raise bad_request("No perteneces a una empresa")
        return company_id

    async def get_raw_connection(self, company_id: str) -> MercadoPagoConnection | None:
        return await self.session.scalar(
            select(MercadoPagoConnection).where(MercadoPagoConnection.company_id == company_id)
        )

    async def get_connection(self, company_id: str | None) -> dict[str, Any]:
        scoped = self._require_company(company_id)
        connection = await self.get_raw_connection(scoped)
        if connection and connection.access_token and not connection.mp_nickname and not connection.mp_email:
            connection = await self._refresh_seller_profile(connection)
        return payments_settings(connection)

    async def get_valid_access_token(self, company_id: str) -> str:
        """Access token usable (refrescado si hace falta). Lanza si la empresa no tiene MP conectado."""
        connection = await self.get_raw_connection(company_id)
        if not connection or not (connection.access_token or "").strip():
            raise bad_request(
                "La tienda aún no conectó Mercado Pago. El dueño debe hacerlo en Configuración → Pagos."
            )
        if (
            connection.refresh_token
            and connection.token_expires_at
            and connection.token_expires_at - utcnow() < REFRESH_IF_WITHIN
        ):
            try:
                return await self._refresh_access_token(connection)
            except Exception as error:  # noqa: BLE001
                logger.warning("No se pudo refrescar token MP de empresa %s: %s", company_id, error)
        return connection.access_token

    async def _upsert(self, company_id: str, values: dict[str, Any]) -> None:
        now = utcnow()
        table = MercadoPagoConnection.__table__
        mapper = MercadoPagoConnection.__mapper__
        update_values = {mapper.c[key].name: value for key, value in values.items()}
        update_values[table.c.updatedAt.name] = now
        stmt = (
            insert(MercadoPagoConnection)
            .values(id=new_id(), company_id=company_id, created_at=now, updated_at=now, **values)
            .on_conflict_do_update(index_elements=["companyId"], set_=update_values)
        )
        await self.session.execute(stmt)
        await self.session.commit()

    async def upsert_manual(
        self, company_id: str | None, *, access_token: str, public_key: str | None
    ) -> dict[str, Any]:
        scoped = self._require_company(company_id)
        token = access_token.strip()
        if not token:
            raise bad_request("El Access Token es obligatorio")
        profile = await fetch_seller_profile(token)
        live_hint = profile.pop("live_mode_hint", None)
        await self._upsert(
            scoped,
            {
                "access_token": token,
                "public_key": (public_key or "").strip() or None,
                "refresh_token": None,
                **profile,
                "token_expires_at": None,
                "source": "manual",
                "live_mode": live_hint if live_hint is not None else "TEST" not in token,
                "connected_at": utcnow(),
            },
        )
        return await self.get_connection(scoped)

    async def disconnect(self, company_id: str | None) -> None:
        scoped = self._require_company(company_id)
        existing = await self.get_raw_connection(scoped)
        if not existing:
            raise not_found("Mercado Pago no está conectado")
        await self.session.delete(existing)
        await self.session.execute(
            update(WhatsAppConnection).where(WhatsAppConnection.company_id == scoped).values(is_active=False)
        )
        await self.session.commit()

    def build_oauth_start_url(self, company_id: str | None, user_id: str) -> dict[str, str]:
        scoped = self._require_company(company_id)
        if not is_oauth_configured():
            raise service_unavailable(
                "OAuth de Mercado Pago no está configurado en la plataforma "
                "(MP_CLIENT_ID / MP_CLIENT_SECRET / MP_REDIRECT_URI)."
            )
        settings = get_settings()
        state = sign_state(
            {"companyId": scoped, "userId": user_id, "exp": int(time.time() * 1000) + OAUTH_STATE_TTL_MS}
        )
        query = urlencode(
            {
                "client_id": (settings.MP_CLIENT_ID or "").strip(),
                "response_type": "code",
                "platform_id": "mp",
                "state": state,
                "redirect_uri": redirect_uri(),
            }
        )
        return {"authorizationUrl": f"https://auth.mercadopago.com/authorization?{query}"}

    async def handle_oauth_callback(self, *, code: str | None, state: str | None, error: str | None) -> str:
        frontend = (get_settings().FRONTEND_URL or "http://localhost:3000").rstrip("/")
        settings_base = f"{frontend}/settings/payments"
        if error:
            logger.warning("OAuth MP denegado: %s", error)
            return f"{settings_base}?mp=error"
        if not (code or "").strip() or not (state or "").strip():
            return f"{settings_base}?mp=error"
        try:
            payload = verify_state(state or "")
        except Exception:  # noqa: BLE001
            return f"{settings_base}?mp=error"

        try:
            settings = get_settings()
            token = await post_oauth_token(
                {
                    "client_id": (settings.MP_CLIENT_ID or "").strip(),
                    "client_secret": (settings.MP_CLIENT_SECRET or "").strip(),
                    "grant_type": "authorization_code",
                    "code": (code or "").strip(),
                    "redirect_uri": redirect_uri() or "",
                }
            )
            access_token = token.get("access_token")
            if not access_token:
                raise RuntimeError("Respuesta OAuth sin access_token")
            expires_in = token.get("expires_in")
            expires_at = utcnow() + timedelta(seconds=expires_in) if isinstance(expires_in, int) else None
            profile = await fetch_seller_profile(access_token)
            profile.pop("live_mode_hint", None)
            if not profile["mp_user_id"] and token.get("user_id") is not None:
                profile["mp_user_id"] = str(token["user_id"])
            await self._upsert(
                payload["companyId"],
                {
                    "access_token": access_token,
                    "refresh_token": token.get("refresh_token"),
                    "public_key": token.get("public_key"),
                    **profile,
                    "token_expires_at": expires_at,
                    "source": "oauth",
                    "live_mode": bool(token.get("live_mode")),
                    "connected_at": utcnow(),
                },
            )
            return f"{settings_base}?mp=connected"
        except Exception:
            logger.exception("Error canjeando code OAuth MP")
            return f"{settings_base}?mp=error"

    async def _refresh_access_token(self, connection: MercadoPagoConnection) -> str:
        if not connection.refresh_token:
            return connection.access_token
        settings = get_settings()
        client_id = (settings.MP_CLIENT_ID or "").strip()
        client_secret = (settings.MP_CLIENT_SECRET or "").strip()
        if not client_id or not client_secret:
            return connection.access_token
        token = await post_oauth_token(
            {
                "client_id": client_id,
                "client_secret": client_secret,
                "grant_type": "refresh_token",
                "refresh_token": connection.refresh_token,
            }
        )
        access_token = token.get("access_token")
        if not access_token:
            raise RuntimeError("Refresh sin access_token")
        expires_in = token.get("expires_in")
        connection.access_token = access_token
        connection.refresh_token = token.get("refresh_token") or connection.refresh_token
        connection.token_expires_at = (
            utcnow() + timedelta(seconds=expires_in) if isinstance(expires_in, int) else None
        )
        connection.public_key = token.get("public_key") or connection.public_key
        if token.get("user_id") is not None:
            connection.mp_user_id = str(token["user_id"])
        await self.session.commit()
        return access_token

    async def _refresh_seller_profile(self, connection: MercadoPagoConnection) -> MercadoPagoConnection:
        profile = await fetch_seller_profile(connection.access_token)
        if not profile["mp_user_id"] and not profile["mp_nickname"] and not profile["mp_email"]:
            return connection
        connection.mp_user_id = profile["mp_user_id"] or connection.mp_user_id
        connection.mp_nickname = profile["mp_nickname"]
        connection.mp_email = profile["mp_email"]
        connection.mp_first_name = profile["mp_first_name"]
        connection.mp_last_name = profile["mp_last_name"]
        connection.mp_site_id = profile["mp_site_id"]
        await self.session.commit()
        return connection
