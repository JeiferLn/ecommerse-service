import hashlib
import json
import logging
from typing import Any

from app.core.config import get_settings

logger = logging.getLogger("app.ai.events")


def hash_text(text: str) -> str:
    """Hash SHA-256 de 16 caracteres para auditoría sin filtrar PII ni prompts completos."""
    return hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]


def record_ai_event(
    event_name: str,
    *,
    company_id: str,
    conversation_id: str | None = None,
    customer_phone: str | None = None,
    customer_text: str | None = None,
    details: dict[str, Any] | None = None,
) -> None:
    """Registra eventos de IA de forma estructurada y segura.
    
    Nunca incluye API keys, system prompts ni el texto completo del cliente
    a menos que AI_DEBUG_LOGS esté explícitamente habilitado.
    """
    settings = get_settings()
    event_payload: dict[str, Any] = {
        "event": event_name,
        "company_id": company_id,
        "conversation_id": conversation_id,
        "customer_phone": customer_phone,
    }

    if customer_text:
        event_payload["text_hash"] = hash_text(customer_text)
        if settings.AI_DEBUG_LOGS:
            event_payload["debug_customer_text"] = customer_text

    if details:
        # Sanitizar detalles por si se intenta colar algún secreto
        sanitized_details = {}
        for k, v in details.items():
            k_lower = k.lower()
            if any(secret_term in k_lower for secret_term in ("key", "secret", "token", "password", "prompt")):
                sanitized_details[k] = "[REDACTED]"
            else:
                sanitized_details[k] = v
        event_payload["details"] = sanitized_details

    logger.info("AI_EVENT: %s", json.dumps(event_payload, ensure_ascii=False))
