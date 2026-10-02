import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.numbers import num
from app.core.text import fold
from app.models import Company, Product

SYNONYM_FAMILIES: list[list[str]] = [
    ["jean", "jeans", "pantalon", "pantalones", "capri", "capris", "jogger", "joggers"],
    ["gorra", "gorras", "gorro", "gorros", "cachucha", "cachuchas"],
    ["camisa", "camisas", "camiseta", "camisetas", "polo", "polos"],
    ["zapato", "zapatos", "tenis", "zapatilla", "zapatillas"],
]
PRODUCT_INTENT_RE = re.compile(
    r"(precio|cuanto|cuesta|stock|disponible|tienen|quiero|quisiera|llevar|compra|producto|talla|unidad|"
    r"unidades|\d+\s*(de|unidades)?)"
)
OVERVIEW_RE = re.compile(
    r"(que venden|que tienen|que articulos|que productos|catalogo|que ofecen|que ofrecen|en stock|disponibles|"
    r"que hay|que ofrecen)"
)
UNMATCHED_NOTE = (
    "AVISO: ningún producto ACTIVO coincide con lo que pide el cliente. "
    "Di con claridad que ahora mismo no está disponible. "
    "NO uses precios ni stock del historial de chat."
)


@dataclass
class CatalogMatchedProduct:
    id: str
    name: str
    image_urls: list[str]


@dataclass
class CatalogContext:
    company_name: str
    catalog_block: str
    categories_summary: str
    total_active_count: int
    product_count: int
    matched_products: list[CatalogMatchedProduct] = field(default_factory=list)


def tokenize(text: str) -> list[str]:
    return [token for token in re.split(r"[^a-z0-9]+", fold(text)) if len(token) >= 3]


def expand_synonyms(tokens: list[str]) -> list[str]:
    """Amplía tokens con familias cercanas (jeans ↔ pantalones, etc.) para ranking del contexto."""
    expanded: dict[str, None] = dict.fromkeys(tokens)
    for token in tokens:
        for family in SYNONYM_FAMILIES:
            if token in family:
                expanded.update(dict.fromkeys(family))
    return list(expanded)


def looks_like_product_intent(text: str) -> bool:
    """Heurística: el cliente habla de comprar / stock / un artículo, no solo saluda."""
    return bool(PRODUCT_INTENT_RE.search(fold(text)))


def is_catalog_overview_question(text: str) -> bool:
    return bool(OVERVIEW_RE.search(fold(text)))


def js_string(value: Any) -> str:
    """`String(value)` de JS para atributos JSON de variantes."""
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int | float):
        return str(num(value))
    if isinstance(value, dict):
        return "[object Object]"
    if isinstance(value, list):
        return ",".join("" if item is None else js_string(item) for item in value)
    return str(value)


def score_product(product: Product, tokens: list[str]) -> int:
    if not tokens:
        return 0
    parts = [product.name, product.description or "", product.category.name if product.category else ""]
    for variant in product.variants:
        parts += [variant.sku, variant.name]
    haystack = fold(" ".join(parts))
    return sum(1 for token in tokens if token in haystack)


def format_product_line(product: Product) -> str:
    variant_parts = []
    for variant in product.variants:
        attrs = ""
        if isinstance(variant.attributes, dict):
            attrs = ", ".join(f"{key}: {js_string(value)}" for key, value in variant.attributes.items())
        attrs_part = f", attrs: {attrs}" if attrs else ""
        variant_parts.append(
            f"{variant.name} (sku {variant.sku}, ${float(variant.price):.2f}, stock {variant.stock}{attrs_part})"
        )
    variants = "; ".join(variant_parts)
    category = f" [{product.category.name}]" if product.category and product.category.name else ""
    description = (
        f" — {re.sub(r'\s+', ' ', product.description[:160]).strip()}" if product.description else ""
    )
    images = product.images[:3]
    images_note = (
        f" | Imágenes disponibles: {len(images)} (el sistema puede enviarlas por WhatsApp)"
        if images
        else " | Sin imágenes cargadas"
    )
    return f"- {product.name}{category}{description} | Variantes: {variants or 'ninguna'}{images_note}"


async def build_catalog_context(session: AsyncSession, company_id: str, customer_text: str) -> CatalogContext:
    max_products = get_settings().AI_MAX_PRODUCTS
    company_name = await session.scalar(select(Company.name).where(Company.id == company_id))
    total_active = (
        await session.scalar(
            select(func.count(Product.id)).where(Product.company_id == company_id, Product.status == "active")
        )
        or 0
    )
    products = (
        await session.scalars(
            select(Product)
            .where(Product.company_id == company_id, Product.status == "active")
            .options(
                selectinload(Product.category), selectinload(Product.variants), selectinload(Product.images)
            )
            .order_by(Product.updated_at.desc())
            .limit(max(max_products * 3, max_products))
        )
    ).all()

    category_counts: dict[str, int] = {}
    for product in products:
        key = product.category.name if product.category else "Sin categoría"
        category_counts[key] = category_counts.get(key, 0) + 1
    categories_summary = ", ".join(f"{name} ({count})" for name, count in category_counts.items())

    tokens = expand_synonyms(tokenize(customer_text))
    scored = sorted(
        ((product, score_product(product, tokens)) for product in products),
        key=lambda item: (-item[1], -item[0].updated_at.timestamp()),
    )

    # Para preguntas generales de catálogo, basta con pocos ejemplos; si hay match, prioriza esos.
    overview_ask = is_catalog_overview_question(customer_text)
    detail_limit = min(5, max_products) if overview_ask else max_products
    has_match = bool(tokens) and any(score > 0 for _, score in scored)
    unmatched_note = ""
    if has_match:
        selected = [item for item in scored if item[1] > 0][:detail_limit]
    elif overview_ask:
        # "¿qué productos tienen / en stock?" → mostrar ejemplos del catálogo, no vacío.
        selected = scored[:detail_limit]
    elif looks_like_product_intent(customer_text) and tokens:
        # No rellenar con productos ajenos: evita inventar stock desde el historial.
        selected = []
        unmatched_note = UNMATCHED_NOTE
    else:
        selected = scored[:detail_limit]

    lines = [format_product_line(product) for product, _ in selected]
    return CatalogContext(
        company_name=company_name or "la tienda",
        catalog_block="\n".join(part for part in [unmatched_note, *lines] if part),
        categories_summary=categories_summary,
        total_active_count=total_active,
        product_count=total_active,
        matched_products=[
            CatalogMatchedProduct(
                id=product.id,
                name=product.name,
                image_urls=[image.url for image in product.images[:3] if image.url],
            )
            for product, _ in selected
        ],
    )
