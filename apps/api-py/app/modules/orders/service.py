import logging
import math
import re
import secrets
import time
from dataclasses import dataclass, field
from datetime import timedelta
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.errors import ApiError, bad_request, not_found
from app.core.ids import iso, iso_required, new_id, utcnow
from app.core.numbers import num
from app.core.text import strip_accents
from app.integrations import mercadopago
from app.models import (
    Cart,
    CartItem,
    Company,
    Conversation,
    Message,
    Order,
    OrderItem,
    Product,
    ProductVariant,
)
from app.modules.orders.shipping_coverage import (
    country_display_name,
    describe_shipping_coverage,
    resolve_country_code,
    validate_shipping_coverage,
)
from app.modules.payments.connection_service import MercadoPagoConnectionService
from app.modules.whatsapp import twilio_client

logger = logging.getLogger("app.orders")

OPEN_ORDER_STATUSES = ["draft", "confirmed", "awaiting_payment", "paid", "preparing", "shipped"]
POST_PAYMENT_STATUSES = ["paid", "preparing", "shipped", "delivered"]
CHECKOUT_TOKEN_TTL = timedelta(hours=48)

STATUS_TRANSITIONS: dict[str, list[str]] = {
    "draft": ["confirmed", "awaiting_payment", "cancelled"],
    "confirmed": ["awaiting_payment", "paid", "preparing", "cancelled"],
    "awaiting_payment": ["confirmed", "paid", "preparing", "cancelled"],
    "paid": ["preparing", "cancelled"],
    "preparing": ["shipped", "cancelled"],
    "shipped": ["delivered", "cancelled"],
    "delivered": [],
    "cancelled": [],
}

QUANTITY_WORDS = {
    "un": 1,
    "una": 1,
    "uno": 1,
    "dos": 2,
    "tres": 3,
    "cuatro": 4,
    "cinco": 5,
    "seis": 6,
    "siete": 7,
    "ocho": 8,
    "nueve": 9,
    "diez": 10,
}

STOP_TOKENS = {
    "el",
    "la",
    "los",
    "las",
    "un",
    "una",
    "unos",
    "unas",
    "de",
    "del",
    "al",
    "a",
    "y",
    "o",
    "en",
    "con",
    "por",
    "para",
    "que",
    "como",
    "quiero",
    "tienen",
    "tiene",
    "hay",
    "algun",
    "alguna",
    "agregar",
    "anadir",
    "meter",
    "sumar",
    "carrito",
    "me",
    "llevo",
    "compro",
    "x",
    "sea",
    "este",
    "esta",
    "eso",
    "articulo",
    "relacionado",
}

CURRENCY_BY_COUNTRY = {"AR": "ARS", "BR": "BRL", "CL": "CLP", "MX": "MXN", "PE": "PEN", "UY": "UYU"}

NOTIFY_TEXT_BY_STATUS = {
    "shipped": "Tu pedido {number} ya fue enviado.\n"
    "Pronto llegará a tu dirección. Cualquier duda, escríbenos por aquí.",
    "delivered": "Tu pedido {number} fue marcado como entregado.\n¡Gracias por tu compra!",
    "cancelled": "Tu pedido {number} fue cancelado.\n"
    "Si tienes dudas o quieres hacer otro pedido, escríbenos por aquí.",
}


@dataclass
class AddIntentMatch:
    variant_id: str
    quantity: int
    label: str


@dataclass
class MarkPaidResult:
    newly_paid: bool
    order: Order


@dataclass
class BeginCheckoutResult:
    cart: dict[str, Any]
    message: str
    summary: str
    checkout_url: str | None


@dataclass
class _Line:
    variant: ProductVariant
    quantity: int
    unit_price: Decimal = field(init=False)
    line_total: Decimal = field(init=False)

    def __post_init__(self) -> None:
        self.unit_price = self.variant.price
        self.line_total = self.variant.price * self.quantity


def currency_for_country(country_code: str | None) -> str:
    return CURRENCY_BY_COUNTRY.get(country_code or "", "COP")


def _require_company(company_id: str | None) -> str:
    if not company_id:
        raise bad_request("No perteneces a una empresa")
    return company_id


def _normalize(value: str) -> str:
    normalized = strip_accents(value.lower())
    normalized = re.sub(r"[^\w\s]", " ", normalized, flags=re.ASCII)
    return re.sub(r"\s+", " ", normalized).strip()


def _base36(value: int) -> str:
    digits = "0123456789abcdefghijklmnopqrstuvwxyz"
    result = ""
    while value:
        value, remainder = divmod(value, 36)
        result = digits[remainder] + result
    return result or "0"


def _frontend_base_url() -> str:
    return get_settings().FRONTEND_URL.rstrip("/")


def build_checkout_url(token: str | None) -> str | None:
    return f"{_frontend_base_url()}/checkout/{token}" if token else None


def _money(value: float | int) -> str:
    return f"{value:.2f}"


def parse_quantity_from_text(text: str) -> int:
    normalized = _normalize(text)
    patterns: list[tuple[str, str, int]] = [
        (r"(?:x|×|\*)\s*(\d+)", text, re.IGNORECASE),
        (r"\b(\d+)\s*(?:unidades?|uds?|piezas?)?\b", text, re.IGNORECASE),
        (r"\bquiero\s+(\d+)\b", normalized, 0),
        (r"\bdame\s+(\d+)\b", normalized, 0),
    ]
    for pattern, source, flags in patterns:
        match = re.search(pattern, source, flags | re.ASCII)
        if match:
            return max(1, int(match.group(1)))
    word_match = re.search(
        r"\b(?:quiero|dame|pedir|agregar|anadir|añadir)\s+"
        r"(un|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\b",
        normalized,
        re.ASCII,
    )
    if word_match:
        return QUANTITY_WORDS[word_match.group(1)]
    return 1


def significant_tokens(value: str) -> list[str]:
    return [token for token in re.split(r"\s+", value) if len(token) >= 3 and token not in STOP_TOKENS]


def tokens_overlap(query_tokens: list[str], candidate_tokens: list[str]) -> list[str]:
    """Coincide tokens exactos o singular/plural cercano (gorra ↔ gorras)."""
    matched: list[str] = []
    for candidate in candidate_tokens:
        hit = any(
            query == candidate
            or (
                len(query) >= 4
                and len(candidate) >= 4
                and (
                    query.startswith(candidate)
                    or candidate.startswith(query)
                    or query[:-1] == candidate
                    or candidate[:-1] == query
                )
            )
            for query in query_tokens
        )
        if hit:
            matched.append(candidate)
    return matched


def order_item_dto(item: OrderItem) -> dict[str, Any]:
    return {
        "id": item.id,
        "variantId": item.variant_id,
        "productName": item.product_name,
        "variantName": item.variant_name,
        "sku": item.sku,
        "unitPrice": num(item.unit_price),
        "quantity": item.quantity,
        "lineTotal": num(item.line_total),
    }


def order_details(order: Order) -> dict[str, Any]:
    return {
        "id": order.id,
        "number": order.number,
        "companyId": order.company_id,
        "conversationId": order.conversation_id,
        "customerWaId": order.customer_wa_id,
        "channel": order.channel,
        "inStorePaymentMethod": order.in_store_payment_method,
        "status": order.status,
        "currency": order.currency,
        "subtotal": num(order.subtotal),
        "shippingCost": num(order.shipping_cost),
        "total": num(order.total),
        "shippingName": order.shipping_name,
        "shippingPhone": order.shipping_phone,
        "shippingAddress": order.shipping_address,
        "shippingCountry": order.shipping_country,
        "shippingRegion": order.shipping_region,
        "shippingCity": order.shipping_city,
        "notes": order.notes,
        "checkoutUrl": build_checkout_url(order.checkout_token),
        "items": [order_item_dto(item) for item in order.items],
        "createdAt": iso(order.created_at),
        "updatedAt": iso(order.updated_at),
    }


def order_summary(order: Order, items_count: int) -> dict[str, Any]:
    return {
        "id": order.id,
        "number": order.number,
        "companyId": order.company_id,
        "conversationId": order.conversation_id,
        "customerWaId": order.customer_wa_id,
        "channel": order.channel,
        "inStorePaymentMethod": order.in_store_payment_method,
        "status": order.status,
        "currency": order.currency,
        "subtotal": num(order.subtotal),
        "shippingCost": num(order.shipping_cost),
        "total": num(order.total),
        "itemsCount": items_count,
        "shippingCity": order.shipping_city,
        "createdAt": iso(order.created_at),
        "updatedAt": iso(order.updated_at),
    }


def checkout_order_view(order: Order) -> dict[str, Any]:
    company = order.company
    scopes = list(company.shipping_scopes or [])
    return {
        "number": order.number,
        "status": order.status,
        "currency": order.currency,
        "subtotal": num(order.subtotal),
        "shippingCost": num(order.shipping_cost),
        "total": num(order.total),
        "companyName": company.name,
        "shippingName": order.shipping_name,
        "shippingPhone": order.shipping_phone,
        "shippingAddress": order.shipping_address,
        "shippingCountry": order.shipping_country,
        "shippingRegion": order.shipping_region,
        "shippingCity": order.shipping_city,
        "shippingCoverage": {
            "countryCode": company.country_code,
            "countryName": country_display_name(company.country_code) or None,
            "baseRegion": company.shipping_region,
            "baseCity": company.shipping_city,
            "scopes": scopes,
            "summary": describe_shipping_coverage(
                country_code=company.country_code,
                shipping_region=company.shipping_region,
                shipping_city=company.shipping_city,
                shipping_scopes=scopes,
            ),
        },
        "expiresAt": iso(order.checkout_expires_at),
        "items": [order_item_dto(item) for item in order.items],
    }


def format_cart_message(cart: dict[str, Any], *, with_instructions: bool = True) -> str:
    """Con `with_instructions=False` omite cómo confirmar o vaciar (van como botones)."""
    if not cart["items"]:
        return "Tu carrito está vacío. Dime qué producto quieres agregar."
    lines = [
        f"• {item['productName']} ({item['variantName']} / {item['sku']}) x{item['quantity']} = "
        f"${_money(item['lineTotal'])}"
        for item in cart["items"]
    ]
    return "\n".join(
        [
            "Tu carrito:",
            *lines,
            f"Subtotal: ${_money(cart['subtotal'])} {cart['currency']}",
            *(
                ['Para confirmar escribe "confirmar pedido". Para vaciar: "vaciar carrito".']
                if with_instructions
                else []
            ),
        ]
    )


def format_order_confirmation_message(order: dict[str, Any], *, include_link: bool = True) -> str:
    """Con `include_link=False` el enlace va aparte (botón "Pagar pedido")."""
    lines = [
        f"• {item['productName']} ({item['variantName']}) x{item['quantity']}" for item in order["items"]
    ]
    if order.get("checkoutUrl"):
        checkout_line = (
            f"Completa tus datos de envío y el pago aquí:\n{order['checkoutUrl']}"
            if include_link
            else "Completa tus datos de envío y paga desde el botón."
        )
    else:
        checkout_line = "Un asesor te enviará el enlace de pago y envío."
    return "\n".join(
        [
            f"Pedido {order['number']} registrado.",
            *lines,
            f"Total: ${_money(order['total'])} {order['currency']}",
            checkout_line,
            "No uses transferencias inventadas: el cobro es por el enlace de la plataforma.",
        ]
    )


def format_payment_confirmed_whatsapp_message(order: Order) -> str:
    lines = [f"• {item.product_name} ({item.variant_name}) x{item.quantity}" for item in order.items]
    return "\n".join(
        [
            f"¡Pago confirmado! Pedido {order.number}.",
            *lines,
            f"Total: ${_money(num(order.total))} {order.currency}",
            "La tienda preparará tu envío. Gracias por tu compra.",
        ]
    )


class OrdersService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    # Carrito

    async def get_cart_for_conversation(self, company_id: str | None, conversation_id: str) -> dict[str, Any]:
        scoped = _require_company(company_id)
        await self._find_owned_conversation(scoped, conversation_id)
        cart_id = await self._ensure_cart(scoped, conversation_id)
        return await self._cart_view(cart_id)

    async def add_cart_item(
        self, company_id: str | None, conversation_id: str, variant_id: str, quantity: int = 1
    ) -> dict[str, Any]:
        scoped = _require_company(company_id)
        if quantity < 1:
            raise bad_request("La cantidad debe ser al menos 1")
        await self._find_owned_conversation(scoped, conversation_id)
        variant = await self._find_active_variant(scoped, variant_id)
        if variant.stock < quantity:
            raise bad_request(
                f"Stock insuficiente para {variant.product.name} ({variant.name}). Disponible: {variant.stock}"
            )

        cart_id = await self._ensure_cart(scoped, conversation_id)
        existing = await self.session.scalar(
            select(CartItem).where(CartItem.cart_id == cart_id, CartItem.variant_id == variant_id)
        )
        current = existing.quantity if existing else 0
        next_qty = current + quantity
        if variant.stock < next_qty:
            raise bad_request(f"Stock insuficiente. Disponible: {variant.stock}, en carrito: {current}")

        if existing:
            existing.quantity = next_qty
        else:
            self.session.add(CartItem(cart_id=cart_id, variant_id=variant_id, quantity=quantity))
        await self.session.execute(
            update(Cart).where(Cart.id == cart_id).values(checkout_pending=False, updated_at=utcnow())
        )
        await self.session.commit()
        return await self._cart_view(cart_id)

    async def update_cart_item(
        self, company_id: str | None, conversation_id: str, item_id: str, quantity: int
    ) -> dict[str, Any]:
        scoped = _require_company(company_id)
        await self._find_owned_conversation(scoped, conversation_id)
        cart_id = await self._ensure_cart(scoped, conversation_id)
        item = await self.session.scalar(
            select(CartItem)
            .where(CartItem.id == item_id, CartItem.cart_id == cart_id)
            .options(selectinload(CartItem.variant))
        )
        if not item:
            raise not_found("Ítem del carrito no encontrado")

        if quantity <= 0:
            await self.session.delete(item)
        else:
            if item.variant.stock < quantity:
                raise bad_request(f"Stock insuficiente. Disponible: {item.variant.stock}")
            item.quantity = quantity
        await self.session.commit()
        return await self._cart_view(cart_id)

    async def clear_cart(self, company_id: str | None, conversation_id: str) -> dict[str, Any]:
        scoped = _require_company(company_id)
        await self._find_owned_conversation(scoped, conversation_id)
        cart_id = await self._ensure_cart(scoped, conversation_id)
        await self.session.execute(delete(CartItem).where(CartItem.cart_id == cart_id))
        await self._reset_cart(cart_id)
        await self.session.commit()
        return await self._cart_view(cart_id)

    async def begin_checkout(self, company_id: str | None, conversation_id: str) -> BeginCheckoutResult:
        """Crea el pedido desde el carrito y devuelve el mensaje con link de checkout público."""
        cart = await self.get_cart_for_conversation(company_id, conversation_id)
        if not cart["items"]:
            raise bad_request("El carrito está vacío")
        order = await self.checkout_conversation(company_id, conversation_id)
        return BeginCheckoutResult(
            cart=await self.get_cart_for_conversation(company_id, conversation_id),
            message=format_order_confirmation_message(order),
            summary=format_order_confirmation_message(order, include_link=False),
            checkout_url=order.get("checkoutUrl"),
        )

    async def get_suggested_products(
        self, company_id: str, *, product_ids: list[str] | None = None, limit: int = 10
    ) -> list[dict[str, Any]]:
        """Productos activos con variantes y foto principal, para listas y tarjetas del chat.

        Con `product_ids` respeta ese orden; sin ellos, los más recientes.
        """
        if product_ids is not None and not product_ids:
            return []
        country_code = await self.session.scalar(select(Company.country_code).where(Company.id == company_id))
        query = (
            select(Product)
            .where(Product.company_id == company_id, Product.status == "active")
            .options(selectinload(Product.variants), selectinload(Product.images))
            .order_by(Product.updated_at.desc())
            .limit(len(product_ids) if product_ids is not None else limit)
        )
        if product_ids is not None:
            query = query.where(Product.id.in_(product_ids))
        products = list((await self.session.scalars(query)).all())
        if product_ids:
            products.sort(key=lambda product: product_ids.index(product.id))
        currency = currency_for_country(country_code)
        result: list[dict[str, Any]] = []
        for product in products[:limit]:
            images = sorted(product.images, key=lambda image: image.sort_order)
            variants = sorted(product.variants, key=lambda variant: variant.created_at)
            result.append(
                {
                    "id": product.id,
                    "name": product.name,
                    "imageUrl": images[0].url if images else None,
                    "currency": currency,
                    "variants": [
                        {"id": v.id, "name": v.name, "price": num(v.price), "stock": v.stock}
                        for v in variants
                    ],
                }
            )
        return result

    async def find_variant_for_add_intent(self, company_id: str, text: str) -> AddIntentMatch | None:
        quantity = parse_quantity_from_text(text)
        products = (
            await self.session.scalars(
                select(Product)
                .where(Product.company_id == company_id, Product.status == "active")
                .options(selectinload(Product.variants))
            )
        ).all()

        normalized = _normalize(text)
        query_tokens = significant_tokens(normalized)
        best: tuple[str, str, int] | None = None

        for product in products:
            for variant in product.variants:
                candidates = [
                    _normalize(value)
                    for value in (product.name, variant.name, variant.sku, f"{product.name} {variant.name}")
                ]
                for candidate in candidates:
                    if len(candidate) < 2:
                        continue
                    if candidate in normalized or normalized in candidate:
                        score = len(candidate) + 20
                    else:
                        candidate_tokens = significant_tokens(candidate)
                        if not candidate_tokens or not query_tokens:
                            continue
                        overlap = tokens_overlap(query_tokens, candidate_tokens)
                        if not overlap:
                            continue
                        # Requiere al menos la mitad de los tokens del nombre del producto (mín. 1).
                        needed = max(1, math.ceil(len(candidate_tokens) / 2))
                        if len(overlap) < needed:
                            continue
                        score = len(overlap) * 10 + len("".join(overlap))
                    if best is None or score > best[2]:
                        best = (variant.id, f"{product.name} ({variant.name})", score)

        if best is None:
            return None
        return AddIntentMatch(variant_id=best[0], quantity=quantity, label=best[1])

    # Checkout

    async def checkout_conversation(
        self,
        company_id: str | None,
        conversation_id: str,
        *,
        shipping_name: str | None = None,
        shipping_phone: str | None = None,
        shipping_address: str | None = None,
        shipping_city: str | None = None,
        notes: str | None = None,
    ) -> dict[str, Any]:
        scoped = _require_company(company_id)
        conversation = await self._find_owned_conversation(scoped, conversation_id)
        cart_id = await self._ensure_cart(scoped, conversation_id)
        cart = await self.session.get_one(Cart, cart_id)
        items = (
            await self.session.scalars(
                select(CartItem)
                .where(CartItem.cart_id == cart_id)
                .options(selectinload(CartItem.variant).selectinload(ProductVariant.product))
            )
        ).all()
        if not items:
            raise bad_request("El carrito está vacío")

        for item in items:
            product = item.variant.product
            if product.company_id != scoped:
                raise bad_request("Hay un producto que no pertenece a tu empresa")
            if product.status != "active":
                raise bad_request(f'El producto "{product.name}" ya no está activo')
            if item.variant.stock < item.quantity:
                raise bad_request(f"Stock insuficiente para {product.name} ({item.variant.name})")

        lines = [_Line(item.variant, item.quantity) for item in items]
        country_code = await self.session.scalar(select(Company.country_code).where(Company.id == scoped))
        number = await self._next_order_number(scoped)

        await self._decrement_stock(lines)
        order = self._build_order(
            lines,
            number=number,
            company_id=scoped,
            currency=currency_for_country(country_code),
            conversation_id=conversation_id,
            customer_wa_id=conversation.customer_wa_id,
            channel="whatsapp",
            status="awaiting_payment",
            shipping_name=(shipping_name or "").strip() or cart.shipping_name,
            shipping_phone=(shipping_phone or "").strip()
            or cart.shipping_phone
            or conversation.customer_wa_id,
            shipping_address=(shipping_address or "").strip() or cart.shipping_address,
            shipping_city=(shipping_city or "").strip() or cart.shipping_city,
            notes=(notes or "").strip() or None,
            checkout_token=secrets.token_hex(24),
            checkout_expires_at=utcnow() + CHECKOUT_TOKEN_TTL,
        )
        await self.session.execute(delete(CartItem).where(CartItem.cart_id == cart_id))
        await self._reset_cart(cart_id)
        await self.session.commit()
        return order_details(order)

    async def create_in_store_sale(
        self,
        company_id: str | None,
        *,
        items: list[tuple[str, int]],
        payment_method: str,
        customer_name: str | None,
        customer_phone: str | None,
        notes: str | None,
    ) -> dict[str, Any]:
        scoped = _require_company(company_id)
        if not items:
            raise bad_request("Agrega al menos un producto")

        qty_by_variant: dict[str, int] = {}
        for variant_id, qty in items:
            if qty < 1:
                raise bad_request("La cantidad debe ser un entero mayor a 0")
            qty_by_variant[variant_id] = qty_by_variant.get(variant_id, 0) + qty

        variants = (
            await self.session.scalars(
                select(ProductVariant)
                .join(Product, ProductVariant.product_id == Product.id)
                .where(ProductVariant.id.in_(list(qty_by_variant)), Product.company_id == scoped)
                .options(selectinload(ProductVariant.product))
            )
        ).all()
        if len(variants) != len(qty_by_variant):
            raise bad_request("Hay productos que no pertenecen a tu empresa")

        for variant in variants:
            quantity = qty_by_variant[variant.id]
            if variant.product.status != "active":
                raise bad_request(f'El producto "{variant.product.name}" ya no está activo')
            if variant.stock < quantity:
                raise bad_request(
                    f"Stock insuficiente para {variant.product.name} ({variant.name}). Disponible: {variant.stock}"
                )

        lines = [_Line(variant, qty_by_variant[variant.id]) for variant in variants]
        country_code = await self.session.scalar(select(Company.country_code).where(Company.id == scoped))
        number = await self._next_order_number(scoped)

        await self._decrement_stock(lines)
        order = self._build_order(
            lines,
            number=number,
            company_id=scoped,
            currency=currency_for_country(country_code),
            conversation_id=None,
            customer_wa_id=None,
            channel="in_store",
            in_store_payment_method=payment_method,
            status="delivered",
            shipping_name=(customer_name or "").strip() or None,
            shipping_phone=(customer_phone or "").strip() or None,
            notes=(notes or "").strip() or None,
        )
        await self.session.commit()
        return order_details(order)

    async def get_public_checkout(self, token: str) -> dict[str, Any]:
        order = await self._find_order_by_checkout_token(token, allow_expired_if_paid=True)
        if order.status == "cancelled":
            raise bad_request("Este pedido fue cancelado")
        return checkout_order_view(order)

    async def complete_public_checkout(
        self,
        token: str,
        *,
        shipping_name: str,
        shipping_phone: str,
        shipping_address: str,
        shipping_country: str,
        shipping_region: str,
        shipping_city: str,
        confirm_payment: bool,
    ) -> dict[str, Any]:
        if not confirm_payment:
            raise bad_request("Debes confirmar el pago para continuar")

        order = await self._find_order_by_checkout_token(token, allow_expired_if_paid=False)
        if order.status == "cancelled":
            raise bad_request("Este pedido fue cancelado")
        if order.status in POST_PAYMENT_STATUSES:
            raise bad_request("Este pedido ya fue pagado")
        if order.status not in ("awaiting_payment", "confirmed"):
            raise bad_request("Este pedido no está disponible para pago")

        try:
            company_access_token = await MercadoPagoConnectionService(self.session).get_valid_access_token(
                order.company_id
            )
        except ApiError as error:
            if error.status_code == 400:
                raise
            raise bad_request(
                "La tienda aún no conectó Mercado Pago. El dueño debe hacerlo en Configuración → Pagos."
            ) from error

        name = shipping_name.strip()
        phone = shipping_phone.strip()
        address = shipping_address.strip()
        country = shipping_country.strip()
        region = shipping_region.strip()
        city = shipping_city.strip()
        if not (name and phone and address and country and region and city):
            raise bad_request("Completa nombre, teléfono, país, departamento, ciudad y dirección")

        coverage_error = validate_shipping_coverage(
            company_country_code=order.company.country_code,
            company_city=order.company.shipping_city,
            shipping_scopes=list(order.company.shipping_scopes or []),
            destination_country=country,
            destination_city=city,
        )
        if coverage_error:
            raise bad_request(coverage_error)

        country_code = resolve_country_code(country) or country.upper()
        frontend_url = (get_settings().FRONTEND_URL or "http://localhost:3000").rstrip("/")
        back_base = f"{frontend_url}/checkout/{token}"
        notification_base = mercadopago.webhook_notification_url()
        body: dict[str, Any] = {
            "items": [
                {
                    "id": item.sku or item.id,
                    "title": f"{item.product_name} ({item.variant_name})"[:256],
                    "quantity": item.quantity,
                    "unit_price": num(item.unit_price),
                    "currency_id": order.currency,
                }
                for item in order.items
            ],
            "external_reference": order.id,
            "metadata": {
                "orderId": order.id,
                "orderNumber": order.number,
                "checkoutToken": token,
                "companyId": order.company_id,
            },
            "payer": {"name": name, "phone": {"number": phone}},
            "back_urls": {
                "success": f"{back_base}?status=success",
                "pending": f"{back_base}?status=pending",
                "failure": f"{back_base}?status=failure",
            },
            "statement_descriptor": order.company.name[:22],
        }
        # Mercado Pago solo acepta auto_return con back_urls HTTPS (localhost HTTP falla).
        if frontend_url.startswith("https://"):
            body["auto_return"] = "approved"
        if notification_base:
            separator = "&" if "?" in notification_base else "?"
            body["notification_url"] = f"{notification_base}{separator}companyId={order.company_id}"

        try:
            preference = await mercadopago.create_preference(company_access_token, body)
        except Exception as error:
            message = str(error) or "No se pudo crear el pago en Mercado Pago"
            raise bad_request(
                "Mercado Pago rechazó la URL de retorno. En local usamos HTTP sin auto_return."
                if "auto_return" in message
                else f"Mercado Pago: {message}"
            ) from error

        preference_id = preference.get("id")
        payment_url = preference.get("sandbox_init_point") or preference.get("init_point")
        if not preference_id or not payment_url:
            raise bad_request("Mercado Pago no devolvió un enlace de pago. Revisa las credenciales.")

        order.shipping_name = name
        order.shipping_phone = phone
        order.shipping_address = address
        order.shipping_country = country_code
        order.shipping_region = region
        order.shipping_city = city
        order.status = "awaiting_payment"
        order.mp_preference_id = str(preference_id)
        await self.session.commit()
        return {
            "order": checkout_order_view(order),
            "preferenceId": str(preference_id),
            "paymentUrl": payment_url,
        }

    async def mark_paid_from_mercadopago(self, *, order_id: str, mp_payment_id: str) -> MarkPaidResult:
        """Marca el pedido como pagado desde un webhook de Mercado Pago (idempotente).

        `newly_paid=True` solo la primera vez que pasa a paid.
        """
        order = await self.session.scalar(
            select(Order).where(Order.id == order_id).options(selectinload(Order.items))
        )
        if not order:
            raise not_found("Pedido no encontrado para este pago")

        if order.status in POST_PAYMENT_STATUSES:
            if not order.mp_payment_id and mp_payment_id:
                order.mp_payment_id = mp_payment_id
                await self.session.commit()
            return MarkPaidResult(newly_paid=False, order=order)

        if order.status == "cancelled":
            raise bad_request("El pedido está cancelado y no se puede marcar como pagado")

        order.status = "paid"
        order.mp_payment_id = mp_payment_id
        await self.session.commit()
        return MarkPaidResult(newly_paid=True, order=order)

    # Pedidos

    async def list_orders(
        self,
        company_id: str | None,
        *,
        status: str | None,
        channel: str | None,
        q: str | None,
        conversation_id: str | None,
        page: int,
        per_page: int,
    ) -> dict[str, Any]:
        scoped = _require_company(company_id)
        conditions: list[Any] = [Order.company_id == scoped]
        if status:
            conditions.append(Order.status == status)
        if channel:
            conditions.append(Order.channel == channel)
        if conversation_id:
            conditions.append(Order.conversation_id == conversation_id)
        if q:
            conditions.append(
                or_(
                    *(
                        column.icontains(q, autoescape=True)
                        for column in (
                            Order.number,
                            Order.customer_wa_id,
                            Order.shipping_name,
                            Order.shipping_city,
                            Order.shipping_phone,
                        )
                    )
                )
            )

        total = await self.session.scalar(select(func.count(Order.id)).where(*conditions)) or 0
        items_count = (
            select(func.count(OrderItem.id))
            .where(OrderItem.order_id == Order.id)
            .correlate(Order)
            .scalar_subquery()
        )
        rows = (
            await self.session.execute(
                select(Order, items_count)
                .where(*conditions)
                .order_by(Order.created_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        ).all()
        return {
            "items": [order_summary(order, count) for order, count in rows],
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, math.ceil(total / per_page)),
        }

    async def get_order(self, company_id: str | None, order_id: str) -> dict[str, Any]:
        return order_details(await self._find_owned_order(company_id, order_id))

    async def update_status(self, company_id: str | None, order_id: str, status: str) -> dict[str, Any]:
        order = await self._find_owned_order(company_id, order_id)
        if order.status == status:
            return order_details(order)
        if status == "cancelled":
            return await self.cancel_order(company_id, order_id)
        if order.channel == "in_store":
            raise bad_request("Las ventas de tienda solo se pueden cancelar; no cambian de estado de envío")
        if status not in STATUS_TRANSITIONS[order.status]:
            raise bad_request(f"No se puede pasar de {order.status} a {status}")
        order.status = status
        await self.session.commit()
        details = order_details(order)
        if status in ("shipped", "delivered"):
            await self._notify_customer_order_status(order)
        return details

    async def cancel_order(self, company_id: str | None, order_id: str) -> dict[str, Any]:
        order = await self._find_owned_order(company_id, order_id)
        if order.status == "cancelled":
            return order_details(order)
        if order.status == "delivered" and order.channel != "in_store":
            raise bad_request("No se puede cancelar un pedido entregado")

        if order.stock_decremented:
            for item in order.items:
                if not item.variant_id:
                    continue
                await self.session.execute(
                    update(ProductVariant)
                    .where(ProductVariant.id == item.variant_id)
                    .values(stock=ProductVariant.stock + item.quantity, updated_at=utcnow())
                )
        order.status = "cancelled"
        order.stock_decremented = False
        await self.session.commit()
        details = order_details(order)
        await self._notify_customer_order_status(order)
        return details

    # Internos

    async def _decrement_stock(self, lines: list[_Line]) -> None:
        for line in lines:
            result = await self.session.execute(
                update(ProductVariant)
                .where(ProductVariant.id == line.variant.id, ProductVariant.stock >= line.quantity)
                .values(stock=ProductVariant.stock - line.quantity, updated_at=utcnow())
                .execution_options(synchronize_session=False)
            )
            if getattr(result, "rowcount", 0) == 0:
                await self.session.rollback()
                raise bad_request(
                    f"Stock insuficiente para {line.variant.product.name} ({line.variant.name})"
                )

    def _build_order(self, lines: list[_Line], **values: Any) -> Order:
        subtotal = sum((line.line_total for line in lines), Decimal(0))
        shipping_cost = Decimal(0)
        order = Order(
            id=new_id(),
            subtotal=subtotal,
            shipping_cost=shipping_cost,
            total=subtotal + shipping_cost,
            stock_decremented=True,
            items=[
                OrderItem(
                    id=new_id(),
                    variant_id=line.variant.id,
                    product_name=line.variant.product.name,
                    variant_name=line.variant.name,
                    sku=line.variant.sku,
                    unit_price=line.unit_price,
                    quantity=line.quantity,
                    line_total=line.line_total,
                )
                for line in lines
            ],
            **values,
        )
        now = utcnow()
        order.created_at = now
        order.updated_at = now
        self.session.add(order)
        return order

    async def _reset_cart(self, cart_id: str) -> None:
        await self.session.execute(
            update(Cart)
            .where(Cart.id == cart_id)
            .values(
                checkout_pending=False,
                shipping_name=None,
                shipping_phone=None,
                shipping_address=None,
                shipping_city=None,
                updated_at=utcnow(),
            )
        )

    async def _next_order_number(self, company_id: str) -> str:
        for _ in range(5):
            number = f"ORD-{secrets.token_hex(3).upper()}"
            exists = await self.session.scalar(
                select(Order.id).where(Order.company_id == company_id, Order.number == number)
            )
            if not exists:
                return number
        return f"ORD-{_base36(int(time.time() * 1000)).upper()}"

    async def _ensure_cart(self, company_id: str, conversation_id: str) -> str:
        now = utcnow()
        await self.session.execute(
            insert(Cart)
            .values(
                id=new_id(),
                company_id=company_id,
                conversation_id=conversation_id,
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_nothing(index_elements=["conversationId"])
        )
        await self.session.commit()
        cart_id = await self.session.scalar(select(Cart.id).where(Cart.conversation_id == conversation_id))
        assert cart_id is not None
        return cart_id

    async def _find_owned_conversation(self, company_id: str, conversation_id: str) -> Conversation:
        conversation = await self.session.scalar(
            select(Conversation).where(
                Conversation.id == conversation_id, Conversation.company_id == company_id
            )
        )
        if not conversation:
            raise not_found("Conversación no encontrada")
        return conversation

    async def _find_active_variant(self, company_id: str, variant_id: str) -> ProductVariant:
        variant = await self.session.scalar(
            select(ProductVariant)
            .join(Product, ProductVariant.product_id == Product.id)
            .where(ProductVariant.id == variant_id, Product.company_id == company_id)
            .options(selectinload(ProductVariant.product))
        )
        if not variant:
            raise not_found("Variante no encontrada")
        if variant.product.status != "active":
            raise bad_request("Solo se pueden agregar productos activos")
        return variant

    async def _find_owned_order(self, company_id: str | None, order_id: str) -> Order:
        scoped = _require_company(company_id)
        order = await self.session.scalar(
            select(Order)
            .where(Order.id == order_id, Order.company_id == scoped)
            .options(selectinload(Order.items))
            .execution_options(populate_existing=True)
        )
        if not order:
            raise not_found("Pedido no encontrado")
        return order

    async def _find_order_by_checkout_token(self, token: str, *, allow_expired_if_paid: bool) -> Order:
        normalized = token.strip()
        if not normalized:
            raise not_found("Checkout no encontrado")
        order = await self.session.scalar(
            select(Order)
            .where(Order.checkout_token == normalized)
            .options(selectinload(Order.items), selectinload(Order.company))
        )
        if not order:
            raise not_found("Checkout no encontrado o ya utilizado")
        expired = order.checkout_expires_at is not None and order.checkout_expires_at < utcnow()
        if expired and not (allow_expired_if_paid and order.status in POST_PAYMENT_STATUSES):
            raise bad_request("Este enlace de checkout expiró. Pide uno nuevo por WhatsApp.")
        return order

    async def _cart_view(self, cart_id: str) -> dict[str, Any]:
        cart = await self.session.scalar(
            select(Cart)
            .where(Cart.id == cart_id)
            .options(
                selectinload(Cart.items).selectinload(CartItem.variant).selectinload(ProductVariant.product)
            )
            .execution_options(populate_existing=True)
        )
        assert cart is not None
        country_code = await self.session.scalar(
            select(Company.country_code).where(Company.id == cart.company_id)
        )
        items = []
        for item in cart.items:
            unit_price = num(item.variant.price)
            items.append(
                {
                    "id": item.id,
                    "variantId": item.variant_id,
                    "productId": item.variant.product_id,
                    "productName": item.variant.product.name,
                    "variantName": item.variant.name,
                    "sku": item.variant.sku,
                    "unitPrice": unit_price,
                    "quantity": item.quantity,
                    "lineTotal": unit_price * item.quantity,
                    "stock": item.variant.stock,
                }
            )
        return {
            "id": cart.id,
            "companyId": cart.company_id,
            "conversationId": cart.conversation_id,
            "checkoutPending": cart.checkout_pending,
            "shippingName": cart.shipping_name,
            "shippingPhone": cart.shipping_phone,
            "shippingAddress": cart.shipping_address,
            "shippingCity": cart.shipping_city,
            "items": items,
            "subtotal": sum(item["lineTotal"] for item in items),
            "currency": currency_for_country(country_code),
            "updatedAt": iso_required(cart.updated_at),
        }

    async def _notify_customer_order_status(self, order: Order) -> None:
        """Avisa al cliente por WhatsApp cuando el pedido se envía, entrega o cancela."""
        if not order.customer_wa_id and not order.conversation_id:
            return
        template = NOTIFY_TEXT_BY_STATUS.get(order.status)
        if not template:
            return
        text = template.format(number=order.number)

        query = select(Conversation).options(selectinload(Conversation.wa_connection))
        if order.conversation_id:
            query = query.where(
                Conversation.id == order.conversation_id, Conversation.company_id == order.company_id
            )
        else:
            query = query.where(
                Conversation.company_id == order.company_id,
                Conversation.customer_wa_id == order.customer_wa_id,
            ).order_by(Conversation.last_message_at.desc())
        conversation = await self.session.scalar(query.limit(1))

        connection = conversation.wa_connection if conversation else None
        if not conversation or not connection or not connection.is_active:
            logger.warning(
                "Pedido %s: no se pudo notificar estado %s (sin WA activo)", order.number, order.status
            )
            return

        wamid: str | None = None
        status = "sent"
        try:
            result = await twilio_client.send_text(
                from_=connection.twilio_whatsapp_number, to=conversation.customer_wa_id, text=text
            )
            wamid = result.wamid
        except Exception as error:  # noqa: BLE001
            status = "failed"
            logger.warning("Pedido %s: falló WhatsApp al notificar %s: %s", order.number, order.status, error)

        self.session.add(
            Message(
                conversation_id=conversation.id,
                direction="outbound",
                wamid=wamid,
                type="text",
                body=text,
                status=status,
            )
        )
        conversation.last_message_at = utcnow()
        await self.session.commit()
