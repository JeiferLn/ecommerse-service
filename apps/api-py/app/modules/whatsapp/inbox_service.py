import math
from typing import Any

from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, not_found
from app.core.ids import iso, utcnow
from app.core.storage import get_storage
from app.models import Conversation, Message, WhatsAppConnection
from app.modules.whatsapp import twilio_client
from app.modules.whatsapp.connection_service import WhatsAppConnectionService
from app.modules.whatsapp.message_dto import whatsapp_message_dto

HANDLER_REACTIVATED_TEXT = "Un asesor reactivó el asistente virtual. ¿En qué te puedo ayudar?"


def _require_company(company_id: str | None) -> str:
    if not company_id:
        raise bad_request("No perteneces a una empresa")
    return company_id


def conversation_summary(conversation: Conversation, last_message_preview: str | None) -> dict[str, Any]:
    return {
        "id": conversation.id,
        "companyId": conversation.company_id,
        "customerWaId": conversation.customer_wa_id,
        "customerName": conversation.customer_name,
        "handler": conversation.handler,
        "lastMessageAt": iso(conversation.last_message_at),
        "lastMessagePreview": last_message_preview,
        "createdAt": iso(conversation.created_at),
        "updatedAt": iso(conversation.updated_at),
    }


def message_dto(message: Message) -> dict[str, Any]:
    return whatsapp_message_dto(message, get_storage().browser_url)


class WhatsAppInboxService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_conversations(self, company_id: str | None, *, page: int, per_page: int) -> dict[str, Any]:
        scoped = _require_company(company_id)
        where = (Conversation.company_id == scoped, Conversation.is_playground.is_(False))
        total = await self.session.scalar(select(func.count(Conversation.id)).where(*where)) or 0
        conversations = (
            await self.session.scalars(
                select(Conversation)
                .where(*where)
                .order_by(Conversation.last_message_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        ).all()
        items = [conversation_summary(c, await self._last_message_body(c.id)) for c in conversations]
        return {
            "items": items,
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, math.ceil(total / per_page)),
        }

    async def list_messages(self, company_id: str | None, conversation_id: str) -> list[dict[str, Any]]:
        conversation = await self._find_owned_conversation(company_id, conversation_id)
        messages = (
            await self.session.scalars(
                select(Message)
                .where(Message.conversation_id == conversation.id)
                .order_by(Message.created_at.asc())
            )
        ).all()
        return [message_dto(message) for message in messages]

    async def send_message(self, company_id: str | None, conversation_id: str, text: str) -> dict[str, Any]:
        await WhatsAppConnectionService(self.session).assert_whatsapp_prerequisites(company_id)
        conversation = await self._find_owned_conversation(company_id, conversation_id)
        connection = (
            await self.session.get(WhatsAppConnection, conversation.wa_connection_id)
            if conversation.wa_connection_id
            else None
        )
        if not connection or not connection.is_active or not connection.twilio_whatsapp_number:
            raise bad_request("La conexión WhatsApp no está activa")

        body = text.strip()
        if not body:
            raise bad_request("El mensaje no puede estar vacío")

        wamid: str | None = None
        status = "sent"
        try:
            result = await twilio_client.send_text(
                from_=connection.twilio_whatsapp_number, to=conversation.customer_wa_id, text=body
            )
            wamid = result.wamid
        except Exception:  # noqa: BLE001
            status = "failed"

        message = Message(
            conversation_id=conversation.id,
            direction="outbound",
            wamid=wamid,
            type="text",
            body=body,
            status=status,
        )
        self.session.add(message)
        conversation.last_message_at = utcnow()
        await self.session.commit()
        return message_dto(message)

    async def delete_conversation(self, company_id: str | None, conversation_id: str) -> None:
        conversation = await self._find_owned_conversation(company_id, conversation_id)
        await self.session.delete(conversation)
        await self.session.commit()

    async def set_handler(self, company_id: str | None, conversation_id: str, handler: str) -> dict[str, Any]:
        await WhatsAppConnectionService(self.session).assert_whatsapp_prerequisites(company_id)
        conversation = await self._find_owned_conversation(company_id, conversation_id)
        conversation.handler = handler
        conversation.last_message_at = utcnow()
        await self.session.commit()

        last_message_preview = await self._last_message_body(conversation.id)

        if handler == "bot" and conversation.wa_connection_id:
            connection = await self.session.get(WhatsAppConnection, conversation.wa_connection_id)
            if connection and connection.is_active and connection.twilio_whatsapp_number:
                wamid: str | None = None
                status = "sent"
                try:
                    result = await twilio_client.send_text(
                        from_=connection.twilio_whatsapp_number,
                        to=conversation.customer_wa_id,
                        text=HANDLER_REACTIVATED_TEXT,
                    )
                    wamid = result.wamid
                except Exception:  # noqa: BLE001
                    status = "failed"
                self.session.add(
                    Message(
                        conversation_id=conversation.id,
                        direction="outbound",
                        wamid=wamid,
                        type="text",
                        body=HANDLER_REACTIVATED_TEXT,
                        status=status,
                    )
                )
                await self.session.commit()
                last_message_preview = HANDLER_REACTIVATED_TEXT

        return conversation_summary(conversation, last_message_preview)

    async def clear_all_conversations(self, company_id: str | None) -> int:
        scoped = _require_company(company_id)
        result = await self.session.execute(
            delete(Conversation).where(
                Conversation.company_id == scoped, Conversation.is_playground.is_(False)
            )
        )
        await self.session.commit()
        return int(getattr(result, "rowcount", 0) or 0)

    async def _last_message_body(self, conversation_id: str) -> str | None:
        return await self.session.scalar(
            select(Message.body)
            .where(Message.conversation_id == conversation_id)
            .order_by(Message.created_at.desc())
            .limit(1)
        )

    async def _find_owned_conversation(self, company_id: str | None, conversation_id: str) -> Conversation:
        scoped = _require_company(company_id)
        conversation = await self.session.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id,
                Conversation.company_id == scoped,
                Conversation.is_playground.is_(False),
            )
        )
        if not conversation:
            raise not_found("Conversación no encontrada")
        return conversation
