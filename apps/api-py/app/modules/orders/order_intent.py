import re
from typing import Literal

from app.core.text import strip_accents

OrderChatIntent = Literal["view_cart", "clear_cart", "checkout", "add_to_cart"]

_A = re.ASCII
SPANISH_QTY = r"una|uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\d+"


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", strip_accents(text.lower())).strip()


def _any(patterns: list[str], text: str) -> bool:
    return any(re.search(pattern, text, _A) for pattern in patterns)


def detects_view_cart(text: str) -> bool:
    normalized = _normalize(text)
    return (
        _any([r"\b(ver|mostrar|mira(r)?)\s+(el\s+)?carrito\b", r"\bmi carrito\b"], normalized)
        or normalized == "carrito"
    )


def detects_clear_cart(text: str) -> bool:
    normalized = _normalize(text)
    return (
        _any([r"\b(vaciar|limpiar|borrar|eliminar)\s+(el\s+)?carrito\b"], normalized)
        or normalized == "vaciar carrito"
    )


def detects_checkout(text: str) -> bool:
    normalized = _normalize(text)
    return _any(
        [r"\b(confirmar|cerrar|finalizar)\s+(el\s+)?pedido\b", r"\bcheckout\b"], normalized
    ) or normalized in (
        "confirmar pedido",
        "hacer pedido",
    )


def looks_like_catalog_inquiry(text: str) -> bool:
    """Consulta de catálogo / disponibilidad (no es comando de carrito).

    Ej: "quiero una gorra, cuales tienes disponibles?"
    """
    normalized = _normalize(text)
    return (
        _any(
            [
                r"\b(cual|cuales)\b",
                r"\b(cuanto|cuantos|cuantas)\b",
                r"\b(disponible|disponibles|opcion|opciones|modelo|modelos|variante|variantes)\b",
                r"\b(tienen|tienes)\b",
                r"\bque\s+(tienen|tienes|hay|ofrecen|venden)\b",
                r"\b(hay|tienen|tienes)\s+\w+",
                r"\b(me\s+)?(muestran|muestra|ensenan|ensena)\b",
                r"\b(precio|precios|stock)\b",
                r"\b(quiero\s+ver|me\s+interesa|estoy\s+interesad)\b",
                r"\b(busco|buscando)\b",
            ],
            normalized,
        )
        or "?" in normalized
    )


def detects_add_to_cart(text: str) -> bool:
    """Intención de agregar al carrito / pedir el producto del contexto.

    Consultas abiertas ("tienen gorras?", "quiero una gorra cuales tienes") NO cuentan.
    """
    normalized = _normalize(text)
    if looks_like_catalog_inquiry(normalized):
        return False
    return _any(
        [
            r"\b(agregar|anadir|añadir|meter|sumar)\b",
            r"\bal carrito\b",
            r"\b(me llevo|compro)\s+\d*\s*\w+",
            r"\b(me\s+)?gustaria\s+pedir\b",
            r"\bquiero\s+pedir\b",
            r"\bpedir\s+(una|uno|unas|unos)\b",
            r"\b(la|lo)\s+quiero\b",
            r"\bme\s+la\s+llevo\b",
            r"\bdame\s+(una|uno|\d+)\b",
            # "quiero 2", "quiero dos", "quiero una gorra"
            rf"\bquiero\s+({SPANISH_QTY})\b",
            r"^(quiero\s+(una|uno))(!|\.|$)",
            r"^quiero\s+(una|uno)\s+\w+(\s+\w+){0,3}$",
        ],
        normalized,
    )


def detects_affirmative_cart_confirm(text: str) -> bool:
    """Confirmación corta ("sí", "dale") tras oferta del bot de agregar al carrito."""
    normalized = _normalize(text)
    if not normalized or len(normalized) > 80:
        return False
    if detects_checkout(normalized) or detects_clear_cart(normalized) or detects_view_cart(normalized):
        return False
    return _any(
        [
            r"^(si|ok|dale|claro|va|perfecto|listo|de acuerdo|hazlo|agregalo|agregala|anadelo|añadelo)([!.]|$)",
            r"^(si|ok|dale|claro)\b.{0,40}\b(por favor|gracias|agrega|añade|anade|carrito)\b",
            r"^(si|ok)\b.{0,50}\bno\s+comprare?\b",
        ],
        normalized,
    )


def bot_offered_add_to_cart(bot_text: str) -> bool:
    """El bot ofreció / anunció agregar al carrito (aún sin hacerlo el sistema)."""
    normalized = _normalize(bot_text)
    return _any(
        [
            r"\bagreg(o|amos|are|aremos|aria)\b",
            r"\bañad(o|imos|ire|iremos)\b",
            r"\banad(o|imos|ire|iremos)\b",
            r"\bquieres que (te )?(la |lo |las |los )?(agreg|añad|anad)",
            r"\bte (la |lo )?agrego\b",
            r"\bponemos?\b.{0,30}\bcarrito\b",
            r"\bal carrito\b",
        ],
        normalized,
    )


def resolve_order_chat_intent(text: str) -> OrderChatIntent | None:
    if detects_view_cart(text):
        return "view_cart"
    if detects_clear_cart(text):
        return "clear_cart"
    if detects_checkout(text):
        return "checkout"
    if detects_add_to_cart(text):
        return "add_to_cart"
    return None
