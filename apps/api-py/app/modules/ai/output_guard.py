import re
from dataclasses import dataclass

from app.core.config import get_settings
from app.modules.ai.fact_check import FactSet, verify_facts
from app.modules.ai.reply import looks_like_internal_reasoning, sanitize_model_output
from app.modules.ai.sales_scope import looks_like_off_topic_assistant_reply

SECRET_AND_PROMPT_LEAK_PATTERNS = [
    re.compile(r"\b(system\s*prompt|prompt\s*del\s*sistema|instrucciones\s*del\s*sistema)\b", re.IGNORECASE),
    re.compile(r"\b(eres\s+el\s+asistente\s+virtual|fuentes\s+de\s+verdad|bloque\s+de\s+env[ií]os)\b", re.IGNORECASE),
    re.compile(r"\b(openrouter[_\s-]*api[_\s-]*key|gemini[_\s-]*api[_\s-]*key|jwt[_\s-]*secret|database[_\s-]*url)\b", re.IGNORECASE),
    re.compile(r"\b(sk-or-[a-z0-9_-]+|ai_max_\w+)\b", re.IGNORECASE),
    re.compile(r"<<<mensaje del cliente>>>|<<<fin del mensaje del cliente>>>", re.IGNORECASE),
]


@dataclass
class GuardContext:
    facts: FactSet
    company_name: str
    finish_reason: str | None = None


@dataclass
class GuardResult:
    is_valid: bool
    reason_code: str | None = None
    sanitized_text: str = ""


def validate_model_output(raw_output: str, *, context: GuardContext) -> GuardResult:
    """Output Guard obligatorio para toda redacción producida por un LLM.
    
    Verifica:
    1. Truncado (finish_reason == 'length' o texto incompleto)
    2. Etiquetas internas / CoT / razonamiento
    3. Fuera de alcance (código, tutoriales)
    4. Fuga de system prompt, claves o variables de entorno
    5. Fact-checking contra los datos reales provistos por las tools (precios, stock, variantes)
    """
    settings = get_settings()
    if not settings.AI_OUTPUT_GUARD_ENABLED:
        return GuardResult(is_valid=True, sanitized_text=raw_output)

    # 1. Truncado
    if context.finish_reason == "length":
        return GuardResult(is_valid=False, reason_code="TRUNCATED_FINISH_REASON")

    cleaned = sanitize_model_output(raw_output)
    if not cleaned:
        return GuardResult(is_valid=False, reason_code="EMPTY_OR_SAFETY_BLOCKED")

    # Si parece cortado a mitad de una frase o palabra sin cerrar
    if cleaned.endswith(("...", "…", " y ", " de ", " con ", " el ")):
        return GuardResult(is_valid=False, reason_code="TRUNCATED_TEXT_INCOMPLETE")

    # 2. Razonamiento interno o CoT
    if looks_like_internal_reasoning(cleaned):
        return GuardResult(is_valid=False, reason_code="INTERNAL_REASONING_LEAK")

    # 3. Alcance (tutoriales de programación, etc.)
    if looks_like_off_topic_assistant_reply(cleaned):
        return GuardResult(is_valid=False, reason_code="OFF_TOPIC_CONTENT")

    # 4. Fuga de prompt o secretos
    for pattern in SECRET_AND_PROMPT_LEAK_PATTERNS:
        if pattern.search(cleaned):
            return GuardResult(is_valid=False, reason_code="SECRET_OR_PROMPT_LEAK")

    # 5. Fact check estricto si está activo
    if settings.AI_FACT_CHECK_ENABLED:
        fact_result = verify_facts(cleaned, context.facts)
        if not fact_result.passed:
            return GuardResult(is_valid=False, reason_code=fact_result.reason_code)

    return GuardResult(is_valid=True, sanitized_text=cleaned)
