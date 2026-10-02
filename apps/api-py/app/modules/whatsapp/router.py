import json
import re
from typing import Annotated, Any

from fastapi import APIRouter, Path, Query, Request, Response
from pydantic import Field

from app.core.db import DbSession
from app.core.errors import ApiError, unauthorized
from app.core.rate_limit import limiter
from app.core.responses import ok
from app.core.schemas import QueryModel, RequestModel
from app.core.security import CurrentUser, require_roles
from app.core.validation import boolean, integer, matches, one_of, string
from app.core.validation import text as length
from app.modules.whatsapp.connection_service import WhatsAppConnectionService
from app.modules.whatsapp.inbox_service import WhatsAppInboxService
from app.modules.whatsapp.playground_service import AssistantPlaygroundService
from app.modules.whatsapp.webhook_service import (
    WhatsAppWebhookService,
    assert_development_only,
    assert_twilio_signature,
)

# TwiML vacío: Twilio exige text/xml en la respuesta del webhook (error 12300 si es JSON).
EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'

router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])
inbox_router = APIRouter(prefix="/whatsapp/conversations", tags=["whatsapp"])
playground_router = APIRouter(
    prefix="/assistant/playground", tags=["whatsapp"], dependencies=[require_roles("owner", "manager")]
)
admin_router = APIRouter(prefix="/admin/companies", tags=["admin"], dependencies=[require_roles("admin")])

OwnerOrManager = [require_roles("owner", "manager")]
STORE_CODE_PATTERN = r"^[A-Za-z0-9][A-Za-z0-9-]{1,28}[A-Za-z0-9]$"

MessageText = Annotated[
    str, string("text must be a string"), length(min_len=1, min_msg="El mensaje no puede estar vacío")
]


class SimulateInboundBody(RequestModel):
    from_: Annotated[
        str, string("from must be a string"), length(min_len=1, min_msg="from es obligatorio")
    ] = Field(alias="from")
    text: Annotated[str, string("text must be a string"), length(min_len=1, min_msg="text es obligatorio")]
    customer_name: Annotated[str | None, string("customerName must be a string")] = None


class SetConnectionActiveBody(RequestModel):
    is_active: Annotated[bool, boolean("isActive must be a boolean value")]


class SendMessageBody(RequestModel):
    text: MessageText


class PlaygroundMessageBody(RequestModel):
    text: MessageText
    # Acción del botón u opción que tocó el cliente de prueba (ej. `cart:checkout`).
    action_id: Annotated[
        Annotated[
            str,
            length(max_len=200, max_msg="actionId must be shorter than or equal to 200 characters"),
            matches(r"^[a-z]+:[a-z0-9_-]+$", "Acción inválida", re.IGNORECASE),
        ]
        | None,
        string("actionId must be a string"),
    ] = None


class UpdateConversationHandlerBody(RequestModel):
    handler: Annotated[str, one_of(("bot", "human"), "handler debe ser bot o human")]


class UpsertWhatsAppConnectionBody(RequestModel):
    # E.164 con +: +14155238886 o +573001112233
    twilio_whatsapp_number: Annotated[
        str,
        string("twilioWhatsAppNumber must be a string"),
        length(min_len=8, min_msg="Indica el número WhatsApp de Twilio"),
        matches(r"^\+[1-9]\d{7,14}$", "Usa formato E.164 con +: +14155238886", re.ASCII),
    ] = Field(alias="twilioWhatsAppNumber")
    display_phone_number: Annotated[str | None, string("displayPhoneNumber must be a string")] = None
    is_active: Annotated[bool | None, boolean("isActive must be a boolean value")] = None


class ListConversationsQuery(QueryModel):
    page: Annotated[
        int, integer("page must be an integer number", minimum=1, min_msg="page must not be less than 1")
    ] = 1
    per_page: Annotated[
        int,
        integer("perPage must be an integer number", minimum=1, min_msg="perPage must not be less than 1"),
    ] = 20


def _to_string_record(body: Any) -> dict[str, str]:
    result: dict[str, str] = {}
    if not isinstance(body, dict):
        return result
    for key, value in body.items():
        if isinstance(value, str):
            result[key] = value
        elif isinstance(value, bool):
            result[key] = "true" if value else "false"
        elif isinstance(value, int | float):
            result[key] = str(int(value)) if float(value).is_integer() else str(value)
    return result


async def _webhook_params(request: Request) -> dict[str, str]:
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        try:
            return _to_string_record(json.loads(await request.body() or b"{}"))
        except ValueError:
            return {}
    if "application/x-www-form-urlencoded" in content_type or "multipart/form-data" in content_type:
        form = await request.form()
        return _to_string_record({key: value for key, value in form.items() if isinstance(value, str)})
    return {}


@router.post("/webhook")
async def receive_webhook(request: Request, session: DbSession) -> Response:
    """Webhook Twilio (form-urlencoded): mensajes entrantes y status callbacks. Responde TwiML vacío;
    el auto-reply se envía aparte vía REST API."""
    params = await _webhook_params(request)
    try:
        assert_twilio_signature(request.headers.get("x-twilio-signature"), params)
    except ApiError as error:
        if error.status_code == 401:
            raise
        raise unauthorized("Firma de webhook Twilio inválida") from error
    await WhatsAppWebhookService(session).handle_twilio_webhook(params)
    return Response(content=EMPTY_TWIML, media_type="text/xml")


@router.post("/webhook/simulate", status_code=201, dependencies=OwnerOrManager)
async def simulate_inbound(body: SimulateInboundBody, user: CurrentUser, session: DbSession) -> Any:
    data = await WhatsAppWebhookService(session).simulate_inbound(
        user.company_id, from_=body.from_, text=body.text, customer_name=body.customer_name
    )
    return ok(data, "Mensaje simulado")


@router.get("/store-links/{store_code}")
@limiter.exempt
async def resolve_store_link(
    store_code: Annotated[str, Path(pattern=STORE_CODE_PATTERN)], session: DbSession
) -> Any:
    """Público: destino de `/w/<código>` del panel. Sin límite por IP porque llega desde el servidor
    de Next, que comparte una sola IP para todos los visitantes."""
    return ok({"url": await WhatsAppConnectionService(session).resolve_store_link(store_code)})


@router.get("/connection", dependencies=OwnerOrManager)
async def get_connection(user: CurrentUser, session: DbSession) -> Any:
    return ok(await WhatsAppConnectionService(session).get(user.company_id))


@router.post("/connection/shared", status_code=201, dependencies=[require_roles("owner")])
async def activate_shared_connection(user: CurrentUser, session: DbSession) -> Any:
    """Activa el canal al instante con el número compartido de la plataforma."""
    data = await WhatsAppConnectionService(session).activate_shared(user.company_id)
    return ok(data, "Canal de WhatsApp activado")


@router.patch("/connection", dependencies=OwnerOrManager)
async def set_connection_active(body: SetConnectionActiveBody, user: CurrentUser, session: DbSession) -> Any:
    """La tienda pausa o reactiva su asistente; el número propio lo asigna la plataforma."""
    data = await WhatsAppConnectionService(session).set_active(user.company_id, body.is_active)
    return ok(data, "Asistente activado" if body.is_active else "Asistente en pausa")


@inbox_router.get("")
async def list_conversations(
    user: CurrentUser, session: DbSession, query: Annotated[ListConversationsQuery, Query()]
) -> Any:
    if query.per_page > 100:
        raise ApiError(400, "perPage must not be greater than 100")
    return ok(
        await WhatsAppInboxService(session).list_conversations(
            user.company_id, page=query.page, per_page=query.per_page
        )
    )


@inbox_router.delete("", dependencies=OwnerOrManager)
async def clear_all_conversations(user: CurrentUser, session: DbSession) -> Any:
    # Borrar conversaciones reales solo se permite en desarrollo.
    assert_development_only()
    deleted = await WhatsAppInboxService(session).clear_all_conversations(user.company_id)
    return ok({"deleted": deleted}, "Inbox reiniciado")


@inbox_router.get("/{conversation_id}/messages")
async def list_messages(conversation_id: str, user: CurrentUser, session: DbSession) -> Any:
    return ok(await WhatsAppInboxService(session).list_messages(user.company_id, conversation_id))


@inbox_router.post("/{conversation_id}/messages", status_code=201, dependencies=OwnerOrManager)
async def send_message(
    conversation_id: str, body: SendMessageBody, user: CurrentUser, session: DbSession
) -> Any:
    return ok(await WhatsAppInboxService(session).send_message(user.company_id, conversation_id, body.text))


@inbox_router.patch("/{conversation_id}/handler", dependencies=OwnerOrManager)
async def set_handler(
    conversation_id: str, body: UpdateConversationHandlerBody, user: CurrentUser, session: DbSession
) -> Any:
    data = await WhatsAppInboxService(session).set_handler(user.company_id, conversation_id, body.handler)
    return ok(data, "Bot reactivado" if body.handler == "bot" else "Conversación asignada a asesor")


@inbox_router.delete("/{conversation_id}", dependencies=OwnerOrManager)
async def delete_conversation(conversation_id: str, user: CurrentUser, session: DbSession) -> Any:
    assert_development_only()
    await WhatsAppInboxService(session).delete_conversation(user.company_id, conversation_id)
    return ok(None, "Conversación eliminada")


@playground_router.get("")
async def get_playground(user: CurrentUser, session: DbSession) -> Any:
    return ok(await AssistantPlaygroundService(session).get_thread(user.company_id))


@playground_router.post("/messages", status_code=201)
async def send_playground_message(body: PlaygroundMessageBody, user: CurrentUser, session: DbSession) -> Any:
    return ok(
        await AssistantPlaygroundService(session).send_message(user.company_id, body.text, body.action_id)
    )


@playground_router.delete("")
async def reset_playground(user: CurrentUser, session: DbSession) -> Any:
    await AssistantPlaygroundService(session).reset(user.company_id)
    return ok(None, "Prueba reiniciada")


@admin_router.get("")
async def list_admin_companies(session: DbSession) -> Any:
    return ok(await WhatsAppConnectionService(session).list_for_admin())


@admin_router.put("/{company_id}/whatsapp-connection")
async def assign_whatsapp_connection(
    company_id: str, body: UpsertWhatsAppConnectionBody, session: DbSession
) -> Any:
    data = await WhatsAppConnectionService(session).upsert(
        company_id,
        twilio_whatsapp_number=body.twilio_whatsapp_number,
        display_phone_number=body.display_phone_number,
        is_active=body.is_active,
    )
    return ok(data, "Número asignado")


@admin_router.delete("/{company_id}/whatsapp-connection")
async def unassign_whatsapp_connection(company_id: str, session: DbSession) -> Any:
    await WhatsAppConnectionService(session).remove(company_id)
    return ok(None, "Número retirado")
