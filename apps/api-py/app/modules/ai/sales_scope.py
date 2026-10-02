"""Heurísticas para mantener al bot en ventas (no asistente general).

Conservadoras a propósito: mejor dejar pasar un caso dudoso al modelo que bloquear una consulta
legítima de producto.
"""

import re

from app.core.text import strip_accents

_A = re.ASCII

OFF_TOPIC_PATTERNS = [
    re.compile(r"\bhola\s*mundo\b", _A),
    re.compile(r"\bhello\s*world\b", _A),
    re.compile(r"\bprint\s*\(", _A),
    re.compile(r"\bconsole\.log\b", _A),
    re.compile(r"\bdef\s+[a-z_]\w*\s*\(", _A),
    re.compile(r"\bfunction\s+[a-z_]\w*\s*\(", _A),
    re.compile(r"\b```(?:python|javascript|js|ts|java|html|css|sql|bash)?", _A),
    re.compile(
        r"\b(programa|codigo|script|funcion)\s+(en\s+)?"
        r"(python|javascript|java|typescript|c\+\+|php|ruby|go|rust)\b",
        _A,
    ),
    re.compile(r"\b(hazme|escribe|genera|crea|dame)\s+(un\s+)?(programa|codigo|script|funcion|clase)\b", _A),
    re.compile(r"\b(hazme|escribe|genera|crea|dame)\s+(un\s+)?hola\s*mundo\b", _A),
    re.compile(r"\b(aprende|tutorial|ejercicio)\s+(de\s+)?(python|programacion|javascript|java)\b", _A),
    re.compile(r"\bresolveme\s+(esta\s+)?(tarea|ecuacion|integral)\b", _A),
    re.compile(r"\b(inventa|escribe)\s+(un\s+)?(cuento|poema|ensayo|historia)\b", _A),
]

OFF_TOPIC_REPLY_PATTERNS = [
    re.compile(r"```[\s\S]*```"),
    re.compile(r"\bprint\s*\(", _A),
    re.compile(r"\bconsole\.log\b", _A),
    re.compile(r"###\s*¿?c[oó]mo funciona"),
    re.compile(r"###\s*¿?c[oó]mo ejecutarlo"),
    re.compile(r"\bpython\s+hola_mundo\.py\b", _A),
    re.compile(r"\bdef\s+[a-z_]\w*\s*\(", _A),
]

_PRINT_RE = re.compile(r"\bprint\s*\(", _A)


def normalize_for_scope_check(text: str) -> str:
    return strip_accents(text.lower()).strip()


def is_clearly_off_topic_sales_query(customer_text: str) -> bool:
    """True si el mensaje del cliente es claramente ajeno a ventas."""
    normalized = normalize_for_scope_check(customer_text)
    if len(normalized) < 4:
        return False
    return any(pattern.search(normalized) for pattern in OFF_TOPIC_PATTERNS)


def looks_like_off_topic_assistant_reply(reply: str) -> bool:
    """True si la respuesta del modelo parece un tutorial / código genérico."""
    normalized = normalize_for_scope_check(reply)
    if len(normalized) < 40:
        return False
    hits = sum(1 for pattern in OFF_TOPIC_REPLY_PATTERNS if pattern.search(normalized))
    return hits >= 1 and ("```" in reply or hits >= 2 or bool(_PRINT_RE.search(normalized)))


def build_sales_scope_redirect(company_name: str) -> str:
    name = company_name.strip() or "nuestra tienda"
    return (
        f"Solo puedo ayudarte con productos, pedidos y políticas de {name}. ¿Buscas algo de nuestro catálogo?"
    )
