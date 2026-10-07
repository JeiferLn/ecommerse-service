import re
from dataclasses import dataclass
from typing import Literal

from app.core.text import strip_accents

CLIENT_DELIMITER_START = "<<<mensaje del cliente>>>"
CLIENT_DELIMITER_END = "<<<fin del mensaje del cliente>>>"

DANGEROUS_DELIMITERS = [
    re.compile(re.escape(CLIENT_DELIMITER_START), re.IGNORECASE),
    re.compile(re.escape(CLIENT_DELIMITER_END), re.IGNORECASE),
    re.compile(r"<<<system>>>", re.IGNORECASE),
    re.compile(r"<<<fin del sistema>>>", re.IGNORECASE),
    re.compile(r"\[/?inst\]", re.IGNORECASE),
    re.compile(r"<\|im_start\|>", re.IGNORECASE),
    re.compile(r"<\|im_end\|>", re.IGNORECASE),
]

INJECTION_PATTERNS = [
    # Ignore previous instructions / Olvida tus reglas
    re.compile(
        r"\b(ignore|disregard|forget|omit|skip)\s+(all\s+)?(previous|prior|above|past|initial)\s+"
        r"(instructions|rules|prompts|directions|guidelines|constraints)\b",
        re.IGNORECASE | re.ASCII,
    ),
    re.compile(
        r"\b(olvida|ignora|omite|descarta|salta|borra)\s+(todas\s+)?(tus|las)\s+"
        r"(instrucciones|reglas|indicaciones|ordenes|directrices|normas|pautas)\b",
        re.IGNORECASE | re.ASCII,
    ),
    # Actúa como ChatGPT / DAN / Developer mode
    re.compile(
        r"\b(actua|act\s+as|pretend\s+to\s+be|simula\s+ser|eres\s+ahora|comportate\s+como)\s+"
        r"(como\s+)?(chatgpt|dan|developer\s*mode|modo\s*desarrollador|un\s*asistente\s*sin\s*restricciones|"
        r"un\s*modelo\s*sin\s*filtros|un\s*ai\s*libre)\b",
        re.IGNORECASE | re.ASCII,
    ),
    # Revela tu prompt / system prompt
    re.compile(
        r"\b(revela|muestra|dime|revelame|show\s+me|print|display)\s+(tu|el|your)\s+"
        r"(system\s*prompt|prompt\s*del\s*sistema|prompt\s*completo|prompt\s*inicial|"
        r"instrucciones\s*del\s*sistema|reglas\s*secretas|hidden\s*instructions)\b",
        re.IGNORECASE | re.ASCII,
    ),
    # Developer mode / Jailbreak
    re.compile(
        r"\b(developer\s*mode|jailbreak|modo\s*desarrollador|do\s*anything\s*now|bypass\s*filters)\b",
        re.IGNORECASE | re.ASCII,
    ),
    # Intento de obtener API keys o secretos
    re.compile(
        r"\b(api[_\s-]*key|secret[_\s-]*key|token\s*de\s*api|credenciales|tu\s*contrase[nñ]a|clave\s*de\s*acceso|"
        r"openrouter[_\s-]*key|gemini[_\s-]*key|jwt[_\s-]*secret)\b",
        re.IGNORECASE | re.ASCII,
    ),
]


@dataclass
class SecurityGateResult:
    action: Literal["ALLOW", "BLOCK"]
    reason_code: str | None = None
    sanitized_text: str = ""


def neutralize_delimiters(text: str) -> str:
    """Elimina o neutraliza delimitadores que el atacante podría usar para cerrar o abrir bloques de prompt."""
    cleaned = text
    for pattern in DANGEROUS_DELIMITERS:
        cleaned = pattern.sub("", cleaned)
    return cleaned.strip()


def check_security_gate(text: str) -> SecurityGateResult:
    """Verifica reglas duras de seguridad antes de clasificar o llamar a cualquier LLM.
    
    Si el usuario intenta vulnerar delimitadores, inyectar instrucciones, activar jailbreaks
    o pedir secretos, la acción es BLOCK con un reason_code interno.
    """
    # 1. Comprobar si el usuario intentó colar delimitadores del sistema directamente
    if CLIENT_DELIMITER_START.lower() in text.lower() or CLIENT_DELIMITER_END.lower() in text.lower():
        sanitized = neutralize_delimiters(text)
        return SecurityGateResult(
            action="BLOCK",
            reason_code="DELIMITER_SPOOFING",
            sanitized_text=sanitized,
        )

    sanitized = neutralize_delimiters(text)
    normalized = strip_accents(sanitized.lower())

    # 2. Comprobar expresiones regulares de inyección / jailbreak
    for pattern in INJECTION_PATTERNS:
        match = pattern.search(normalized)
        if match:
            return SecurityGateResult(
                action="BLOCK",
                reason_code="PROMPT_INJECTION_MATCH",
                sanitized_text=sanitized,
            )

    return SecurityGateResult(
        action="ALLOW",
        reason_code=None,
        sanitized_text=sanitized,
    )
