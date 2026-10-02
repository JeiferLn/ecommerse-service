import re

from app.core.text import strip_accents

_A = re.ASCII


def _normalize(text: str) -> str:
    return strip_accents(text.lower())


def detects_human_request(text: str) -> bool:
    """Detecta si el cliente pide un asesor / persona real."""
    normalized = _normalize(text)
    return any(
        re.search(pattern, normalized, _A)
        for pattern in (
            r"\basesor(es|a)?\b",
            r"\bpersona\s+real\b",
            r"\bhumano\b",
            r"\batencion\s+humana\b",
            r"\bhablar\s+con\s+(alguien|una\s+persona|un\s+asesor)\b",
            r"\bpasame\s+con\b",
            r"\bpasa(me)?\s+con\s+(un\s+)?asesor\b",
        )
    )


def detects_bot_choice(text: str) -> bool:
    """Detecta si el cliente elige el bot / asistente virtual."""
    normalized = _normalize(text).strip()
    if detects_human_request(normalized):
        return False

    # "no quiero un asistente / bot" no es elección de bot.
    if any(
        re.search(pattern, normalized, _A)
        for pattern in (
            r"\bno\s+(quiero|deseo|necesito|busco).{0,40}\b(el\s+)?(bot|asistente|ia)\b",
            r"\bno\s+(el\s+)?(bot|asistente)\b",
            r"\bsin\s+(bot|asistente)\b",
        )
    ):
        return False

    return bool(
        re.search(r"^(bot|asistente|ia|virtual|un\s+bot)[!?.]*$", normalized, re.IGNORECASE | _A)
    ) or any(
        re.search(pattern, normalized, _A)
        for pattern in (
            r"\b(el\s+)?bot\b",
            r"\bun\s+bot\b",
            r"\basistente(\s+virtual)?\b",
            r"\bautomatico\b",
            r"\binteligencia\s+artificial\b",
            # "el más rápido" ≈ bot (respuesta inmediata)
            r"\b(el\s+)?mas\s+rapido\b",
            r"\b(el\s+)?mas\s+veloz\b",
            r"\bla\s+opcion\s+rapida\b",
            r"\bresponde(r)?\s+rapido\b",
        )
    )


def extract_residual_after_bot_choice(text: str) -> str | None:
    """Si el mensaje elige bot y además trae una pregunta ("bot, qué productos tienen"),
    devuelve solo la pregunta residual."""
    if not detects_bot_choice(text):
        return None

    residual = text
    for pattern in (
        r"\binteligencia\s+artificial\b",
        r"\basistente(\s+virtual)?\b",
        r"\b(el\s+)?bot\b",
        r"\bautomatico\b",
        r"\bia\b",
        r"\bvirtual\b",
        r"\bpor\s+favor\b",
        r"\bdisculpa(me|le)?\b",
    ):
        residual = re.sub(pattern, " ", residual, flags=re.IGNORECASE | _A)
    residual = re.sub(r"^[,.:;!?\-\s]+", "", residual)
    residual = re.sub(r"[,.:;!?\-\s]+$", "", residual)
    residual = re.sub(r"\s{2,}", " ", residual).strip()

    if len(residual) < 3:
        return None
    # Si tras limpiar sigue siendo solo elección, no hay pregunta.
    if detects_bot_choice(residual) and len(re.split(r"\s+", residual)) <= 3:
        return None
    return residual
