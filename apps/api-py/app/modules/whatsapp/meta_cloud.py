"""Envío de texto por WhatsApp Cloud API (Graph) — número de prueba Meta, sin Twilio."""

from __future__ import annotations

import logging
import re
from typing import Any

import httpx

from app.core.config import get_settings
from app.core.errors import bad_request, service_unavailable
from app.modules.whatsapp.phone import normalize_whatsapp_e164

logger = logging.getLogger(__name__)

E164 = re.compile(r"^\+[1-9]\d{7,14}$", re.ASCII)


def cloud_status() -> dict[str, Any]:
    settings = get_settings()
    display = (settings.META_WA_DISPLAY_PHONE_NUMBER or "").strip() or None
    return {
        "configured": settings.meta_cloud_api_ready,
        "displayPhoneNumber": normalize_whatsapp_e164(display) if display else None,
        "phoneNumberIdConfigured": bool((settings.META_WA_PHONE_NUMBER_ID or "").strip()),
        "graphApiVersion": (settings.META_GRAPH_API_VERSION or "v21.0").strip() or "v21.0",
    }


def _require_e164(raw: str, label: str) -> str:
    number = normalize_whatsapp_e164(raw)
    if not E164.match(number):
        raise bad_request(f"{label}: usa formato internacional con +, ej. +573001112233")
    return number


async def send_text(
    *,
    to: str,
    text: str,
    from_display: str | None = None,
) -> dict[str, Any]:
    """Envía un mensaje de texto con el número de prueba configurado en .env."""
    settings = get_settings()
    if not settings.meta_cloud_api_ready:
        raise service_unavailable(
            "Faltan META_WA_ACCESS_TOKEN y META_WA_PHONE_NUMBER_ID en apps/api-py/.env "
            "(API Setup de Meta → número de prueba)."
        )

    body = (text or "").strip()
    if not body:
        raise bad_request("El mensaje no puede estar vacío")
    if len(body) > 4096:
        raise bad_request("El mensaje es demasiado largo (máx. 4096)")

    to_e164 = _require_e164(to, "Número destino")
    to_digits = to_e164.lstrip("+")

    default_from = (settings.META_WA_DISPLAY_PHONE_NUMBER or "").strip()
    from_raw = (from_display or "").strip() or default_from
    if not from_raw:
        raise bad_request("Indica el número de prueba de Meta desde el que envías")
    from_e164 = _require_e164(from_raw, "Número de envío")
    if default_from:
        expected = normalize_whatsapp_e164(default_from)
        if expected and from_e164 != expected:
            raise bad_request(
                f"El número de envío debe ser el de prueba de Meta configurado ({expected})."
            )

    version = (settings.META_GRAPH_API_VERSION or "v21.0").strip() or "v21.0"
    phone_number_id = (settings.META_WA_PHONE_NUMBER_ID or "").strip()
    token = (settings.META_WA_ACCESS_TOKEN or "").strip()
    url = f"https://graph.facebook.com/{version}/{phone_number_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": to_digits,
        "type": "text",
        "text": {"preview_url": False, "body": body},
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                url,
                headers={
                    "Authorization": f"Bearer {token}",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.HTTPError as error:
        logger.exception("WhatsApp Cloud API request failed")
        raise service_unavailable("No pudimos contactar la Cloud API de Meta. Inténtalo de nuevo.") from error

    data: dict[str, Any]
    try:
        data = response.json()
    except ValueError:
        data = {"raw": response.text}

    if response.status_code >= 400:
        meta_error = data.get("error") if isinstance(data, dict) else None
        message = None
        if isinstance(meta_error, dict):
            message = meta_error.get("message") or meta_error.get("error_user_msg")
        logger.warning(
            "WhatsApp Cloud API error status=%s body=%s", response.status_code, data
        )
        raise bad_request(
            message
            or "Meta rechazó el envío. Revisa el token, el Phone number ID y que el destino "
            "esté en la lista de prueba."
        )

    message_id = None
    messages = data.get("messages") if isinstance(data, dict) else None
    if isinstance(messages, list) and messages:
        first = messages[0]
        if isinstance(first, dict):
            message_id = first.get("id")

    return {
        "messageId": message_id,
        "from": from_e164,
        "to": to_e164,
        "text": body,
        "provider": "meta_cloud_api",
    }
