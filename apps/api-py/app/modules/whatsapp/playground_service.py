from typing import Any

from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request
from app.core.ids import utcnow
from app.models import Cart, Conversation, Message
from app.modules.whatsapp.connection_service import WhatsAppConnectionService
from app.modules.whatsapp.inbox_service import message_dto
from app.modules.whatsapp.webhook_service import WhatsAppWebhookService

# Identificador del "cliente" de prueba; nunca es un número real.
PLAYGROUND_CUSTOMER_ID = "playground"
MAX_MESSAGE_LENGTH = 1000


def _require_company(company_id: str | None) -> str:
    if not company_id:
        raise bad_request("No perteneces a una empresa")
    return company_id


class AssistantPlaygroundService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_thread(self, company_id: str | None) -> dict[str, Any]:
        scoped = _require_company(company_id)
        conversation = await self._find_conversation(scoped)
        if not conversation:
            return {"conversationId": None, "handler": "pending", "messages": []}
        messages = (
            await self.session.scalars(
                select(Message)
                .where(Message.conversation_id == conversation.id)
                .order_by(Message.created_at.asc())
            )
        ).all()
        return {
            "conversationId": conversation.id,
            "handler": conversation.handler,
            "messages": [message_dto(message) for message in messages],
        }

    async def send_message(
        self, company_id: str | None, text: str, action_id: str | None = None
    ) -> dict[str, Any]:
        scoped = _require_company(company_id)
        body = text.strip()
        if not body:
            raise bad_request("El mensaje no puede estar vacío")
        if len(body) > MAX_MESSAGE_LENGTH:
            raise bad_request(f"El mensaje no puede superar {MAX_MESSAGE_LENGTH} caracteres")

        await WhatsAppConnectionService(self.session).assert_whatsapp_prerequisites(
            scoped, require_payments=False
        )

        now = utcnow()
        conversation = await self._find_conversation(scoped)
        if conversation:
            conversation.last_message_at = now
        else:
            conversation = Conversation(
                company_id=scoped,
                wa_connection_id=None,
                customer_wa_id=PLAYGROUND_CUSTOMER_ID,
                customer_name="Prueba",
                handler="pending",
                is_playground=True,
                last_message_at=now,
            )
            self.session.add(conversation)
            await self.session.flush()

        self.session.add(
            Message(
                conversation_id=conversation.id,
                direction="inbound",
                type="text",
                body=body,
                status="received",
                interactive={"kind": "reply", "actionId": action_id} if action_id else None,
            )
        )
        await self.session.commit()

        await WhatsAppWebhookService(self.session).reply_in_playground(
            scoped, conversation.id, body, action_id
        )
        return await self.get_thread(scoped)

    async def reset(self, company_id: str | None) -> None:
        """Borra mensajes y carrito, y vuelve a mostrar el menú inicial de bot/asesor."""
        scoped = _require_company(company_id)
        conversation = await self._find_conversation(scoped)
        if not conversation:
            return
        await self.session.execute(delete(Message).where(Message.conversation_id == conversation.id))
        await self.session.execute(delete(Cart).where(Cart.conversation_id == conversation.id))
        await self.session.execute(
            update(Conversation)
            .where(Conversation.id == conversation.id)
            .values(handler="pending", updated_at=utcnow())
        )
        await self.session.commit()

    async def _find_conversation(self, company_id: str) -> Conversation | None:
        return await self.session.scalar(
            select(Conversation)
            .where(Conversation.company_id == company_id, Conversation.is_playground.is_(True))
            .limit(1)
            .execution_options(populate_existing=True)
        )
