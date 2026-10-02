import json
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse

from app.core.db import DbSession
from app.core.responses import ok
from app.core.schemas import RequestModel
from app.core.security import CurrentUser, require_roles
from app.core.validation import string, text
from app.modules.payments.connection_service import MercadoPagoConnectionService
from app.modules.payments.webhook_service import MercadoPagoWebhookService, as_dict

router = APIRouter(prefix="/payments/mercadopago", tags=["payments"])

OWNER = [require_roles("owner")]


class UpsertConnectionBody(RequestModel):
    access_token: Annotated[
        str, string("accessToken must be a string"), text(min_len=10, min_msg="Access Token inválido")
    ]
    public_key: Annotated[str | None, string("publicKey must be a string")] = None


@router.get("/connection", dependencies=OWNER)
async def get_connection(user: CurrentUser, session: DbSession) -> Any:
    return ok(await MercadoPagoConnectionService(session).get_connection(user.company_id))


@router.post("/oauth/start", status_code=201, dependencies=OWNER)
async def oauth_start(user: CurrentUser, session: DbSession) -> Any:
    return ok(MercadoPagoConnectionService(session).build_oauth_start_url(user.company_id, user.id))


@router.get("/oauth/callback")
async def oauth_callback(
    session: DbSession, code: str | None = None, state: str | None = None, error: str | None = None
) -> RedirectResponse:
    redirect_url = await MercadoPagoConnectionService(session).handle_oauth_callback(
        code=code, state=state, error=error
    )
    return RedirectResponse(redirect_url, status_code=302)


@router.put("/connection", dependencies=OWNER)
async def upsert_connection(body: UpsertConnectionBody, user: CurrentUser, session: DbSession) -> Any:
    connection = await MercadoPagoConnectionService(session).upsert_manual(
        user.company_id, access_token=body.access_token, public_key=body.public_key
    )
    return ok(connection, "Mercado Pago conectado")


@router.delete("/connection", dependencies=OWNER)
async def disconnect(user: CurrentUser, session: DbSession) -> Any:
    await MercadoPagoConnectionService(session).disconnect(user.company_id)
    return ok(None, "Mercado Pago desconectado. WhatsApp quedó desactivado hasta reconectar pagos.")


class WebhookQuery:
    def __init__(
        self,
        topic: str | None = None,
        id: str | None = None,  # noqa: A002
        type: str | None = None,  # noqa: A002
        data_id: Annotated[str | None, Query(alias="data.id")] = None,
        company_id: Annotated[str | None, Query(alias="companyId")] = None,
        pending_id: Annotated[str | None, Query(alias="pendingId")] = None,
        purpose: str | None = None,
    ) -> None:
        self.topic = topic
        self.id = id
        self.type = type
        self.data_id = data_id
        self.company_id = company_id
        self.pending_id = pending_id
        self.purpose = purpose


def _resolve_resource_id(query: WebhookQuery, body: dict[str, Any]) -> str | None:
    data = as_dict(body.get("data"))
    from_body = data.get("id")
    if from_body is None:
        from_body = body.get("id")
    if from_body is None and isinstance(body.get("resource"), str):
        from_body = body["resource"].split("/")[-1]
    candidate = query.data_id or query.id or from_body
    if candidate is None or candidate == "":
        return None
    return str(candidate)


async def _dispatch_webhook(session: DbSession, query: WebhookQuery, body: dict[str, Any]) -> None:
    def _str(value: Any) -> str:
        return value if isinstance(value, str) else ""

    event_type = (
        _str(body.get("type")) or _str(body.get("topic")) or query.type or query.topic or ""
    ).lower()
    resource_id = _resolve_resource_id(query, body)
    is_subscription_purpose = query.purpose == "subscription"
    is_preapproval = "preapproval" in event_type
    is_authorized_payment = "authorized_payment" in event_type
    service = MercadoPagoWebhookService(session)

    if is_preapproval and resource_id:
        await service.handle_subscription_preapproval_notification(resource_id)
        return
    if is_subscription_purpose:
        pending_id = (query.pending_id or "").strip() or None
        await service.handle_subscription_notification(resource_id, query.company_id, pending_id)
        return
    if is_authorized_payment and resource_id:
        await service.handle_subscription_notification(resource_id, query.company_id)
        return
    await service.handle_payment_notification(resource_id, query.company_id)


@router.post("/webhook", status_code=200)
async def webhook_post(
    request: Request, session: DbSession, query: Annotated[WebhookQuery, Depends()]
) -> dict[str, bool]:
    """Webhook moderno (JSON) + IPN por query."""
    try:
        parsed = json.loads(await request.body() or b"{}")
    except ValueError:
        parsed = {}
    await _dispatch_webhook(session, query, parsed if isinstance(parsed, dict) else {})
    return {"ok": True}


@router.get("/webhook", status_code=200)
async def webhook_get(session: DbSession, query: Annotated[WebhookQuery, Depends()]) -> dict[str, bool]:
    """Algunos flujos IPN usan GET."""
    await _dispatch_webhook(session, query, {})
    return {"ok": True}
