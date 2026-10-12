"""Humanización del asistente virtual sin debilitar controles de seguridad ni BD.

Funcionalidades:
  1. Variantes deterministas de mensajes fijos (3 a 5 variantes por tipo)
     usando hash(conversation_id + message_counter). Cero random.
  2. Extracción de nombre del cliente únicamente si lo dijo de forma explícita
     ("soy Laura", "me llamo Carlos", etc.).
  3. Detección de preguntas de identidad ("¿eres un bot?") con respuesta honesta.
  4. Splitting semántico inteligente de mensajes con topes configurables,
     respetando entidades protegidas (precios, SKUs, pedidos, URLs).
"""

from __future__ import annotations

import hashlib
import re
from collections.abc import Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.modules.ai.persona import AssistantPersona

# ---------------------------------------------------------------------------
# Entidades protegidas que NUNCA deben partirse en el splitting
# ---------------------------------------------------------------------------

_PRICE_PATTERN = re.compile(
    r"\$\s*[0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{1,2})?\s*(?:pesos|cop|usd)?|"
    r"\b[0-9]{1,3}(?:[.,][0-9]{3})*\s*(?:pesos|cop)\b",
    re.IGNORECASE | re.ASCII,
)

_SKU_PATTERN = re.compile(
    r"\bsku\s*[:#-]?\s*[a-z0-9_-]+\b",
    re.IGNORECASE | re.ASCII,
)

_ORDER_PATTERN = re.compile(
    r"#\s*[0-9a-zA-Z_-]{2,}|\bpedido\s*#?\s*[0-9a-zA-Z_-]+\b",
    re.IGNORECASE | re.ASCII,
)

_URL_PATTERN = re.compile(
    r"https?://[^\s)\]]+",
    re.IGNORECASE | re.ASCII,
)

# ---------------------------------------------------------------------------
# Detección de nombre del cliente
# ---------------------------------------------------------------------------

_NAME_EXPLICIT_RE = re.compile(
    r"\b(?:me llamo|mi nombre es|soy)\s+([a-záéíóúñA-ZÁÉÍÓÚÑ]{2,25})\b",
    re.IGNORECASE,
)

# Palabras que suelen seguir a "soy" pero no son nombres propios
_NON_NAME_WORDS = {
    "un", "una", "el", "la", "de", "del", "nuevo", "nueva", "cliente",
    "comprador", "compradora", "humano", "persona", "asesor", "bot", "robot",
    "aqui", "aquí", "colombiano", "extranjero", "mayor", "menor", "yo",
}


def extract_client_name(text: str) -> str | None:
    """Extrae el nombre del cliente SOLO si lo dijo explícitamente.

    Ejemplos:
      "Hola, soy Laura" -> "Laura"
      "Me llamo Carlos" -> "Carlos"
      "Mi nombre es Sofía" -> "Sofía"
      "Soy un cliente nuevo" -> None
      "Soy de Bogotá" -> None
    """
    for match in _NAME_EXPLICIT_RE.finditer(text):
        candidate = match.group(1).strip()
        if candidate.lower() not in _NON_NAME_WORDS and len(candidate) >= 3:
            # Capitalizar respetando acentos
            return candidate[:30].capitalize()
    return None


# ---------------------------------------------------------------------------
# Selección determinista de variantes
# ---------------------------------------------------------------------------


def pick_variant(
    variants: Sequence[str],
    conversation_id: str,
    message_counter: int = 0,
) -> str:
    """Elige una variante entre 3 a 5 de forma 100% reproducible y determinista.

    No utiliza random. El índice se calcula con SHA-256 de (conversation_id + counter).
    """
    if not variants:
        return ""
    seed = f"{conversation_id}:{message_counter}"
    digest = hashlib.sha256(seed.encode("utf-8")).hexdigest()
    index = int(digest, 16) % len(variants)
    return variants[index]


# ---------------------------------------------------------------------------
# Catálogo de variantes fijas
# ---------------------------------------------------------------------------

GREETING_VARIANTS: list[str] = [
    "¡Hola! Te damos la bienvenida a {company}. ¿En qué te podemos colaborar hoy?",
    "¡Hola! Qué gusto saludarte en {company}. ¿Cómo podemos ayudarte el día de hoy?",
    "¡Hola! Bienvenido a {company}. Cuéntanos, ¿qué estás buscando o en qué podemos asistirte?",
    "¡Buen día! Gracias por escribirnos a {company}. ¿En qué podemos servirte hoy?",
]

HANDOFF_VARIANTS: list[str] = [
    "Con gusto te comunico con un asesor de la tienda. En un momento continuará atendiéndote por aquí.",
    "Entendido. Ya mismo te transfiero con uno de nuestros asesores para darte atención personalizada.",
    "Te paso de inmediato con una persona de nuestro equipo. Permanecerá en este mismo chat contigo en breve.",
    "Comprendo. Un asesor humano de la tienda continuará con tu solicitud por este medio.",
]

UNKNOWN_VARIANTS: list[str] = [
    "No logré comprender tu consulta. En {company} te puedo ayudar con información de catálogo, precios, stock y compras. ¿Buscas algún producto o prefieres hablar con un asesor?",
    "Disculpa, no me quedó clara tu solicitud. En {company} puedo mostrarte productos, verificar existencias o conectarte con un asesor. ¿Qué necesitas consultar?",
    "No comprendí bien tu mensaje. Con gusto te colaboro con detalles de nuestros artículos, pedidos o te comunico con un asesor humano.",
    "No alcancé a captar lo que buscas. En {company} estoy para ayudarte con compras y productos. ¿Deseas consultar el catálogo o hablar con alguien del equipo?",
]

UNAVAILABLE_VARIANTS: list[str] = [
    "En este momento no cuento con la información exacta sobre {topic}. Un asesor de nuestro equipo te responderá con gusto para confirmarte los detalles.",
    "Ahora mismo no dispongo de ese dato específico sobre {topic}. Un asesor humano te confirmará la información a la brevedad.",
    "No tengo disponible la información confirmada respecto a {topic}. Te comunicaré con un asesor para que te brinde la respuesta correcta.",
]

BOT_IDENTITY_VARIANTS: list[str] = [
    "Soy el asistente virtual de {company}. Mi labor es ayudarte con compras, catálogo y dudas de la tienda. Si prefieres hablar con un asesor de la tienda, dímelo y te transfiero de inmediato.",
    "Así es, soy una inteligencia artificial y asistente virtual de {company}. Estoy aquí para guiarte en tus compras y pedidos. Si prefieres atención de un asesor humano, con gusto te paso.",
    "Soy un bot y asistente virtual diseñado para atenderte en {company}. Te ayudo con productos y servicios, o si lo deseas, te comunico directamente con un asesor humano.",
    "Soy el asistente digital de {company}. Nunca pretendo ser una persona real; si prefieres que te atienda un asesor del equipo, avísame y con mucho gusto te transfiero.",
]


# ---------------------------------------------------------------------------
# Identidad del bot
# ---------------------------------------------------------------------------

_BOT_INQUIRY_RE = re.compile(
    r"\b(?:eres\s+(?:un\s+|una\s+)?(?:bot|robot|ia|inteligencia\s+artificial|humano|humana|persona(?:\s+real)?|real)|"
    r"hablo\s+con\s+(?:un\s+|una\s+)?(?:bot|robot|humano|humana|persona(?:\s+real)?|alguien\s+real)|"
    r"eres\s+humana?|eres\s+real|es\s+un\s+bot)\b",
    re.IGNORECASE | re.ASCII,
)


def is_bot_identity_inquiry(text: str) -> bool:
    """Detecta si el usuario pregunta honestamente si habla con un bot o humano."""
    return bool(_BOT_INQUIRY_RE.search(text))


def render_bot_identity(
    company_name: str,
    persona: AssistantPersona | None = None,
    conversation_id: str = "",
    message_counter: int = 0,
) -> str:
    """Respuesta honesta y transparente. NUNCA finge ser humano."""
    company = company_name.strip() or "la tienda"
    template = pick_variant(BOT_IDENTITY_VARIANTS, conversation_id, message_counter)
    reply = template.format(company=company)
    if persona and persona.assistant_name:
        reply = f"Me llamo {persona.assistant_name}. " + reply
    return reply


# ---------------------------------------------------------------------------
# Splitting semántico respetando entidades
# ---------------------------------------------------------------------------


def _find_protected_ranges(text: str) -> list[tuple[int, int]]:
    """Encuentra los rangos [start, end] que no deben cortarse."""
    ranges: list[tuple[int, int]] = []
    for pattern in (_PRICE_PATTERN, _SKU_PATTERN, _ORDER_PATTERN, _URL_PATTERN):
        for m in pattern.finditer(text):
            ranges.append((m.start(), m.end()))
    # Ordenar por posición de inicio
    ranges.sort(key=lambda r: r[0])
    return ranges


def _is_inside_protected_range(pos: int, ranges: list[tuple[int, int]]) -> bool:
    """Verifica si la posición cae estrictamente dentro de un rango protegido."""
    return any(start < pos < end for start, end in ranges)


def _find_split_point(text: str, target: int, protected_ranges: list[tuple[int, int]]) -> int:
    """Busca el mejor punto de corte semántico antes de target sin romper entidades."""
    if target >= len(text):
        return len(text)

    # 1. Párrafos (\n\n)
    paragraphs = [m.start() + 2 for m in re.finditer(r"\n\n+", text[:target])]
    for p in reversed(paragraphs):
        if p >= target // 2 and not _is_inside_protected_range(p, protected_ranges):
            return p

    # 2. Saltos de línea (\n)
    lines = [m.start() + 1 for m in re.finditer(r"\n", text[:target])]
    for p in reversed(lines):
        if p >= target // 2 and not _is_inside_protected_range(p, protected_ranges):
            return p

    # 3. Finales de oración (. ! ?)
    sentences = [m.end() for m in re.finditer(r"[.!?]\s+", text[:target])]
    for p in reversed(sentences):
        if p >= target // 2 and not _is_inside_protected_range(p, protected_ranges):
            return p

    # 4. Espacios simples
    spaces = [m.start() for m in re.finditer(r"\s+", text[:target])]
    for p in reversed(spaces):
        if not _is_inside_protected_range(p, protected_ranges):
            return p

    # Si no hay corte seguro antes del target, buscar justo después del rango protegido
    for start, end in protected_ranges:
        if start <= target <= end and end < len(text):
            return end
    return target


@dataclass
class SplitResult:
    messages: list[str]
    pause_ms: int = 300


def split_ai_message(
    text: str,
    max_chars: int = 700,
    pause_ms: int = 300,
) -> list[str]:
    """Divide un mensaje según su longitud respetando entidades protegidas.

    Reglas:
      - len < 300: 1 solo mensaje.
      - 300 <= len <= 700: 1 o 2 mensajes (solo divide si hay corte semántico claro).
      - len > 700: corte semántico en partes de máximo max_chars.
      - NUNCA corta precios ($50.000 COP), SKUs (CAM-01), pedidos (#123), ni URLs.
    """
    clean = text.strip()
    if not clean:
        return []

    total_len = len(clean)

    # Caso 1: Menos de 300 caracteres -> siempre 1 mensaje
    if total_len < 300:
        return [clean]

    # Caso 2: Entre 300 y 700 caracteres
    if total_len <= max_chars:
        # Busca si hay un corte natural (párrafo \n\n o salto de línea) que lo divida limpiamente
        protected = _find_protected_ranges(clean)
        # Buscar corte preferido cerca de la mitad
        half = total_len // 2
        split_pt = _find_split_point(clean, half + 100, protected)
        # Si el punto de corte divide en dos partes de buen tamaño (ambas >= 100 chars)
        part1 = clean[:split_pt].strip()
        part2 = clean[split_pt:].strip()
        if len(part1) >= 100 and len(part2) >= 80:
            return [part1, part2]
        return [clean]

    # Caso 3: Mayor a max_chars (tope 700) -> división semántica iterativa
    chunks: list[str] = []
    remaining = clean

    while len(remaining) > max_chars:
        protected = _find_protected_ranges(remaining)
        cut_point = _find_split_point(remaining, max_chars, protected)

        if cut_point <= 0 or cut_point == len(remaining):
            # No se pudo cortar limpiamente antes de max_chars: forzar al final del primer espacio o entidad
            cut_point = max_chars

        chunk = remaining[:cut_point].strip()
        if chunk:
            chunks.append(chunk)
        remaining = remaining[cut_point:].strip()

    if remaining:
        chunks.append(remaining)

    return chunks
