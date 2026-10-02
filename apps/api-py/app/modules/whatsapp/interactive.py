"""Mensajes interactivos de WhatsApp (botones, listas, tarjetas) y su texto de respaldo."""

import re
import unicodedata
from decimal import ROUND_HALF_UP, Decimal
from typing import Any, TypedDict

from app.core.text import strip_accents

# Límites de WhatsApp para mensajes interactivos de sesión (sin plantilla aprobada).
WA_BODY = 1024
WA_MAX_BUTTONS = 3
WA_BUTTON_TITLE = 20
WA_LIST_BUTTON = 20
WA_MAX_LIST_ITEMS = 10
WA_LIST_ITEM_TITLE = 24
WA_LIST_ITEM_DESCRIPTION = 72

ACTION_HANDLER_BOT = "handler:bot"
ACTION_HANDLER_HUMAN = "handler:human"
ACTION_CART_CHECKOUT = "cart:checkout"
ACTION_CART_CONTINUE = "cart:continue"
ACTION_CART_CLEAR = "cart:clear"
ACTION_CART_VIEW = "cart:view"
ACTION_ADD_YES = "add:yes"
ACTION_ADD_NO = "add:no"

FIXED_ACTIONS = {
    ACTION_HANDLER_BOT: "handler_bot",
    ACTION_HANDLER_HUMAN: "handler_human",
    ACTION_CART_CHECKOUT: "cart_checkout",
    ACTION_CART_CONTINUE: "cart_continue",
    ACTION_CART_CLEAR: "cart_clear",
    ACTION_CART_VIEW: "cart_view",
    ACTION_ADD_YES: "add_yes",
    ACTION_ADD_NO: "add_no",
}

ENTITY_ID = re.compile(r"^[a-z0-9_-]{1,64}$", re.IGNORECASE | re.ASCII)

CURRENCY_SYMBOLS = {"COP": "$", "USD": "US$"}


class SuggestedVariant(TypedDict):
    id: str
    name: str
    price: int | float
    stock: int


class SuggestedProduct(TypedDict):
    """Producto sugerido por la IA con lo necesario para listas y tarjetas."""

    id: str
    name: str
    imageUrl: str | None
    currency: str
    variants: list[SuggestedVariant]


Interactive = dict[str, Any]


def parse_action_id(action_id: str | None) -> dict[str, str] | None:
    """`{"type": ...}` y, para entidades, `variantId` o `productId`."""
    value_id = (action_id or "").strip()
    if not value_id:
        return None
    fixed = FIXED_ACTIONS.get(value_id)
    if fixed:
        return {"type": fixed}
    prefix, _, value = value_id.partition(":")
    value = value.split(":", 1)[0]
    if not value or not ENTITY_ID.match(value):
        return None
    if prefix == "variant":
        return {"type": "variant", "variantId": value}
    if prefix == "product":
        return {"type": "product", "productId": value}
    return None


def truncate(text: str, max_len: int) -> str:
    clean = re.sub(r"\s+", " ", text).strip()
    return clean if len(clean) <= max_len else f"{clean[: max_len - 1].rstrip()}…"


def _group_thousands(digits: str) -> str:
    groups: list[str] = []
    while len(digits) > 3:
        groups.insert(0, digits[-3:])
        digits = digits[:-3]
    groups.insert(0, digits)
    return ".".join(groups)


def format_money(amount: int | float, currency: str) -> str:
    """Igual que `Intl.NumberFormat("es-CO", { style: "currency", maximumFractionDigits: 2 })`."""
    code = (currency or "").upper()
    if not re.fullmatch(r"[A-Z]{3}", code):
        return f"${amount:.2f}"
    symbol = CURRENCY_SYMBOLS.get(code, code)
    rounded = Decimal(repr(float(amount))).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    sign = "-" if rounded < 0 else ""
    integer, _, fraction = f"{abs(rounded):.2f}".partition(".")
    fraction = fraction.rstrip("0")
    number = _group_thousands(integer) + (f",{fraction}" if fraction else "")
    return f"{sign}{symbol}\u00a0{number}"


def _buttons(actions: list[tuple[str, str]]) -> Interactive:
    return {
        "kind": "buttons",
        "actions": [
            {"id": action_id, "title": truncate(title, WA_BUTTON_TITLE)}
            for action_id, title in actions[:WA_MAX_BUTTONS]
        ],
    }


def handler_choice_buttons() -> Interactive:
    return _buttons([(ACTION_HANDLER_BOT, "Asistente virtual"), (ACTION_HANDLER_HUMAN, "Un asesor")])


def cart_action_buttons() -> Interactive:
    return _buttons(
        [
            (ACTION_CART_CHECKOUT, "Confirmar pedido"),
            (ACTION_CART_CONTINUE, "Seguir comprando"),
            (ACTION_CART_CLEAR, "Vaciar carrito"),
        ]
    )


def add_confirm_buttons() -> Interactive:
    return _buttons([(ACTION_ADD_YES, "Sí, agregar"), (ACTION_ADD_NO, "No, gracias")])


def product_list_interactive(
    products: list[SuggestedProduct], button: str = "Ver productos"
) -> Interactive | None:
    """Lista de variantes en stock (máximo 10). None si no hay ninguna disponible."""
    items: list[dict[str, str]] = []
    # Con un solo producto el título es la variante y el producto va en la descripción.
    single_product = len(products) == 1
    for product in products:
        in_stock = [variant for variant in product["variants"] if variant["stock"] > 0]
        multi_variant = len(product["variants"]) > 1
        for variant in in_stock:
            if len(items) >= WA_MAX_LIST_ITEMS:
                break
            stock_text = (
                f"{format_money(variant['price'], product['currency'])} · {variant['stock']} disponibles"
            )
            title = variant["name"] if single_product and multi_variant else product["name"]
            description = (
                f"{product['name'] if single_product else variant['name']} · {stock_text}"
                if multi_variant
                else stock_text
            )
            items.append(
                {
                    "id": f"variant:{variant['id']}",
                    "title": truncate(title, WA_LIST_ITEM_TITLE),
                    "description": truncate(description, WA_LIST_ITEM_DESCRIPTION),
                }
            )
    if not items:
        return None
    return {"kind": "list", "button": truncate(button, WA_LIST_BUTTON), "items": items}


def product_card_interactive(product: SuggestedProduct) -> Interactive | None:
    """Tarjeta de un producto con sus acciones. None si no tiene stock."""
    in_stock = [variant for variant in product["variants"] if variant["stock"] > 0]
    if not in_stock:
        return None
    prices = [variant["price"] for variant in in_stock]
    low, high = min(prices), max(prices)
    price = (
        format_money(low, product["currency"])
        if low == high
        else f"Desde {format_money(low, product['currency'])}"
    )
    stock = sum(variant["stock"] for variant in in_stock)
    single = len(in_stock) == 1 and len(product["variants"]) == 1
    primary = (
        {"id": f"variant:{in_stock[0]['id']}", "title": "Agregar al carrito"}
        if single
        else {"id": f"product:{product['id']}", "title": "Elegir opción"}
    )
    return {
        "kind": "product_card",
        "imageUrl": product["imageUrl"],
        "title": product["name"],
        "subtitle": f"{price} · {stock} disponibles",
        "actions": [primary, {"id": ACTION_CART_VIEW, "title": "Ver carrito"}],
    }


def checkout_link_button(url: str | None) -> Interactive:
    return {"kind": "link_button", "title": "Pagar pedido", "url": url}


def _options_of(interactive: Interactive) -> list[dict[str, str]]:
    kind = interactive.get("kind")
    if kind in ("buttons", "product_card"):
        return list(interactive.get("actions") or [])
    if kind == "list":
        return [{"id": item["id"], "title": item["title"]} for item in interactive.get("items") or []]
    return []


def render_as_fallback_text(body: str, interactive: Interactive | None) -> str:
    """Mismo mensaje en texto plano, para cuando no se puede enviar lo interactivo."""
    if not interactive:
        return body
    kind = interactive.get("kind")
    if kind == "link_button":
        url = interactive.get("url")
        return f"{body}\n\n{interactive['title']}: {url}" if url else body
    lines: list[str] = []
    if kind == "product_card":
        lines.extend([f"*{interactive['title']}*", interactive["subtitle"]])
    if kind == "list":
        for index, item in enumerate(interactive.get("items") or [], start=1):
            description = item.get("description")
            lines.append(f"{index}. {item['title']}{f' — {description}' if description else ''}")
    else:
        for index, action in enumerate(_options_of(interactive), start=1):
            lines.append(f"{index}. {action['title']}")
    if not lines:
        return body
    return "\n\n".join(
        part for part in (body, "\n".join(lines), "Responde con el número o el nombre de la opción.") if part
    )


def _normalize(text: str) -> str:
    folded = strip_accents(text.lower())
    kept = "".join(
        char
        for char in folded
        if unicodedata.category(char)[0] in ("L", "N") or char.isspace() or char == "·"
    )
    return re.sub(r"\s+", " ", kept).strip()


def resolve_typed_action(text: str, interactive: Interactive | None) -> str | None:
    """ "2" o el título exacto de una opción del último mensaje interactivo → su acción."""
    if not interactive:
        return None
    options = _options_of(interactive)
    if not options:
        return None
    typed = _normalize(text)
    if re.fullmatch(r"\d{1,2}", typed, re.ASCII):
        index = int(typed) - 1
        return options[index]["id"] if 0 <= index < len(options) else None
    return next((option["id"] for option in options if _normalize(option["title"]) == typed), None)
