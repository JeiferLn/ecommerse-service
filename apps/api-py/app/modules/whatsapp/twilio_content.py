"""Traduce un mensaje interactivo a un contenido de Twilio Content API.

El cuerpo va como variable `{{1}}`, así un mismo juego de botones se crea una sola vez.
"""

import hashlib
import json
import logging
import re
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.ids import new_id, utcnow
from app.models import WhatsAppContentTemplate
from app.modules.whatsapp import twilio_client
from app.modules.whatsapp.interactive import WA_BODY, Interactive, truncate

logger = logging.getLogger("app.whatsapp.content")

CONTENT_API_URL = "https://content.twilio.com/v1/Content"


@dataclass(frozen=True)
class ResolvedContent:
    content_sid: str
    variables: dict[str, str]


def build_types(interactive: Interactive) -> dict[str, Any] | None:
    text = {"body": "{{1}}"}
    kind = interactive.get("kind")
    if kind in ("buttons", "product_card"):
        return {
            "twilio/quick-reply": {
                "body": "{{1}}",
                "actions": [
                    {"title": action["title"], "id": action["id"]} for action in interactive["actions"]
                ],
            },
            "twilio/text": text,
        }
    if kind == "list":
        return {
            "twilio/list-picker": {
                "body": "{{1}}",
                "button": interactive["button"],
                "items": [
                    {
                        "item": item["title"],
                        "id": item["id"],
                        **({"description": item["description"]} if item.get("description") else {}),
                    }
                    for item in interactive["items"]
                ],
            },
            "twilio/text": text,
        }
    return None


def spec_hash(spec: dict[str, Any]) -> str:
    """Hash estable (mismo JSON que `JSON.stringify`): las filas ya guardadas en `WhatsAppContentTemplate` siguen valiendo."""
    payload = json.dumps(spec, ensure_ascii=False, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


class TwilioContentService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def resolve(self, interactive: Interactive, body: str) -> ResolvedContent | None:
        """None cuando el tipo no se envía como contenido (respuesta del cliente, enlace sin plantilla…)."""
        variables = {"1": truncate(body, WA_BODY) or " "}

        if interactive.get("kind") == "link_button":
            content_sid = (get_settings().TWILIO_CHECKOUT_CONTENT_SID or "").strip()
            url = interactive.get("url") or ""
            token = re.split(r"[?#]", url.split("/checkout/", 1)[1])[0] if "/checkout/" in url else ""
            return ResolvedContent(content_sid, {"1": token}) if content_sid and token else None

        spec = build_types(interactive)
        if not spec:
            return None
        digest = spec_hash(spec)
        content_sid = await self._get_or_create(digest, str(interactive["kind"]), spec)
        return ResolvedContent(content_sid, variables)

    async def _get_or_create(self, digest: str, kind: str, types: dict[str, Any]) -> str:
        account = await twilio_client.credentials()
        if not account:
            return f"HX_sim_{digest[:24]}"

        cached = await self.session.scalar(
            select(WhatsAppContentTemplate.content_sid).where(WhatsAppContentTemplate.hash == digest)
        )
        if cached:
            return cached

        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
            response = await client.post(
                CONTENT_API_URL,
                auth=account,
                json={
                    "friendly_name": f"commerce_ai_{kind}_{digest[:16]}",
                    "language": "es",
                    "variables": {"1": "Hola"},
                    "types": types,
                },
            )
        if response.status_code >= 400:
            logger.error("Twilio Content API %s: %s", response.status_code, response.text)
            raise RuntimeError(f"Twilio Content API respondió {response.status_code}")
        sid = response.json().get("sid")
        if not sid:
            raise RuntimeError("Twilio Content API no devolvió sid")

        await self.session.execute(
            insert(WhatsAppContentTemplate)
            .values(id=new_id(), hash=digest, content_sid=sid, kind=kind, created_at=utcnow())
            .on_conflict_do_nothing(index_elements=["hash"])
        )
        await self.session.commit()
        return str(sid)
