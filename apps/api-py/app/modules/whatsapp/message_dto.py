from collections.abc import Callable
from typing import Any

from app.core.ids import iso
from app.models import Message

INTERACTIVE_KINDS = {"buttons", "list", "product_card", "link_button", "reply"}


def parse_interactive(value: Any) -> dict[str, Any] | None:
    """Lee `Message.interactive` (JSON) descartando valores que no tengan una forma conocida."""
    if not isinstance(value, dict):
        return None
    kind = value.get("kind")
    return value if isinstance(kind, str) and kind in INTERACTIVE_KINDS else None


def whatsapp_message_dto(
    message: Message, map_image_url: Callable[[str], str] = lambda url: url
) -> dict[str, Any]:
    """`map_image_url` reescribe las URLs de imagen (fotos enviadas y tarjetas) para el navegador."""
    interactive = parse_interactive(message.interactive)
    if interactive and interactive.get("kind") == "product_card" and interactive.get("imageUrl"):
        interactive = {**interactive, "imageUrl": map_image_url(interactive["imageUrl"])}
    return {
        "id": message.id,
        "conversationId": message.conversation_id,
        "direction": message.direction,
        "wamid": message.wamid,
        "type": message.type,
        "body": map_image_url(message.body) if message.type == "image" else message.body,
        "status": message.status,
        "interactive": interactive,
        "createdAt": iso(message.created_at),
    }
