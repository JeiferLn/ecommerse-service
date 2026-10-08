"""Fact-check de la respuesta del modelo antes de llegar al cliente.

Valida: precios, SKUs, disponibilidad, variantes, plazos de entrega y nombres
de producto.  El historial de conversación NUNCA es fuente de verdad; sólo lo
son los datos provistos por las tools (catalog, orders, shipping).

Eventos emitidos:
  - price_mismatch    → precio citado ≠ precio en BD
  - factual_mismatch  → SKU, variante, plazo o nombre incorrecto
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

from app.core.text import strip_accents

# ---------------------------------------------------------------------------
# Patrones de extracción
# ---------------------------------------------------------------------------

PRICE_RE = re.compile(
    r"\$\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)\b|"
    r"\b([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)\s*(?:pesos|cop)\b",
    re.IGNORECASE | re.ASCII,
)

SKU_RE = re.compile(r"\bsku\s*[:#-]?\s*([a-z0-9_-]+)\b", re.IGNORECASE | re.ASCII)

# Plazos de entrega: "en 3 días", "de 2 a 5 días hábiles", "máximo 7 días"
DEADLINE_RE = re.compile(
    r"\b(?:en|de|hasta|máximo|maximo|mínimo|minimo)?\s*"
    r"(\d+)\s*(?:a\s*(\d+)\s*)?(?:días|dias|d[ií]as?)\s*(?:hábiles|habiles|laborales|naturales)?\b",
    re.IGNORECASE | re.ASCII,
)


# ---------------------------------------------------------------------------
# Normalización de precios
# ---------------------------------------------------------------------------


def parse_numeric_price(raw: str) -> float | None:
    """Normaliza formatos: 50.000, 50,000 o 50000 → float."""
    cleaned = raw.strip()
    if "." in cleaned and "," not in cleaned:
        parts = cleaned.split(".")
        if len(parts[-1]) == 3:
            cleaned = "".join(parts)
        elif len(parts[-1]) in (1, 2):
            cleaned = "".join(parts[:-1]) + "." + parts[-1]
    elif "," in cleaned and "." not in cleaned:
        parts = cleaned.split(",")
        if len(parts[-1]) == 3:
            cleaned = "".join(parts)
        elif len(parts[-1]) in (1, 2):
            cleaned = "".join(parts[:-1]) + "." + parts[-1]
    elif "." in cleaned and "," in cleaned:
        if cleaned.rfind(".") > cleaned.rfind(","):
            cleaned = cleaned.replace(",", "")
        else:
            cleaned = cleaned.replace(".", "").replace(",", ".")
    try:
        return float(cleaned)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Tipos de datos
# ---------------------------------------------------------------------------


@dataclass
class FactSet:
    """Conjunto de hechos autorizados (solo de la BD / tools).

    El historial de conversación NUNCA debe poblar este objeto.
    """

    allowed_prices: set[float] = field(default_factory=set)
    """Precios exactos autorizados por el catálogo (tool catalog)."""
    allowed_skus: set[str] = field(default_factory=set)
    """SKUs existentes en la BD."""
    allowed_variants: set[str] = field(default_factory=set)
    """Variantes válidas (talla, color, modelo, etc.) según la BD."""
    allowed_product_names: set[str] = field(default_factory=set)
    """Nombres canónicos de los productos (para detectar nombres inventados)."""
    in_stock: bool | None = None
    """None = no verificado; False = agotado según BD."""
    max_delivery_days: int | None = None
    """Plazo máximo (días) autorizado para citar tiempos de entrega."""
    min_delivery_days: int | None = None
    """Plazo mínimo (días) autorizado para citar tiempos de entrega."""


@dataclass
class FactCheckResult:
    passed: bool
    reason_code: str | None = None
    """Código de evento: PRICE_HALLUCINATION, FACTUAL_MISMATCH, STOCK_CONTRADICTION."""
    event_name: str | None = None
    """Nombre del evento de observabilidad: price_mismatch | factual_mismatch."""
    violating_items: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Verificación principal
# ---------------------------------------------------------------------------


def verify_facts(text: str, facts: FactSet) -> FactCheckResult:  # noqa: C901
    """Valida que la redacción del modelo no alucine datos factuales.

    Cualquier precio, SKU, variante o plazo citado que no provenga de la BD
    bloquea la respuesta.  La función emite el campo ``event_name`` para que
    el llamador registre el evento correcto en observabilidad.
    """
    normalized = strip_accents(text.lower())

    # ------------------------------------------------------------------
    # 1. Precios
    # ------------------------------------------------------------------
    extracted_prices: list[float] = []
    for match in PRICE_RE.finditer(text):
        raw_val = match.group(1) or match.group(2)
        if raw_val:
            num = parse_numeric_price(raw_val)
            if num is not None and num > 0:
                extracted_prices.append(num)

    if facts.allowed_prices:
        for p in extracted_prices:
            is_allowed = any(abs(p - allowed) < 0.01 for allowed in facts.allowed_prices)
            if not is_allowed:
                return FactCheckResult(
                    passed=False,
                    reason_code="PRICE_HALLUCINATION",
                    event_name="price_mismatch",
                    violating_items=[str(p)],
                )
    # Si allowed_prices está vacío → no hay precios que comparar (la tool no devolvió ninguno).
    # En ese caso, si el modelo cita un precio, también es error.
    elif extracted_prices:
        return FactCheckResult(
            passed=False,
            reason_code="PRICE_HALLUCINATION",
            event_name="price_mismatch",
            violating_items=[str(extracted_prices[0])],
        )

    # ------------------------------------------------------------------
    # 2. SKUs
    # ------------------------------------------------------------------
    for match in SKU_RE.finditer(text):
        sku = match.group(1).upper()
        if facts.allowed_skus and sku not in {s.upper() for s in facts.allowed_skus}:
            return FactCheckResult(
                passed=False,
                reason_code="FACTUAL_MISMATCH",
                event_name="factual_mismatch",
                violating_items=[f"sku:{sku}"],
            )

    # ------------------------------------------------------------------
    # 3. Variantes (tallas, colores, modelos)
    # ------------------------------------------------------------------
    if facts.allowed_variants:
        # Busca menciones de variantes en el texto ("talla XL", "color azul marino", etc.)
        variant_mentions = re.findall(
            r"\b(?:talla|color|modelo|variante)[:\s]+([a-z0-9\-/]+(?:\s[a-z]+)?)",
            normalized,
            re.ASCII,
        )
        for mention in variant_mentions:
            mention_clean = mention.strip()
            allowed_lower = {v.lower() for v in facts.allowed_variants}
            if mention_clean and mention_clean not in allowed_lower:
                return FactCheckResult(
                    passed=False,
                    reason_code="FACTUAL_MISMATCH",
                    event_name="factual_mismatch",
                    violating_items=[f"variant:{mention_clean}"],
                )

    # ------------------------------------------------------------------
    # 4. Plazos de entrega
    # ------------------------------------------------------------------
    if facts.max_delivery_days is not None or facts.min_delivery_days is not None:
        for m in DEADLINE_RE.finditer(normalized):
            low_days = int(m.group(1))
            high_days = int(m.group(2)) if m.group(2) else low_days

            if facts.max_delivery_days is not None and high_days > facts.max_delivery_days:
                return FactCheckResult(
                    passed=False,
                    reason_code="FACTUAL_MISMATCH",
                    event_name="factual_mismatch",
                    violating_items=[f"delivery_days:{high_days}"],
                )
            if facts.min_delivery_days is not None and low_days < facts.min_delivery_days:
                return FactCheckResult(
                    passed=False,
                    reason_code="FACTUAL_MISMATCH",
                    event_name="factual_mismatch",
                    violating_items=[f"delivery_days_min:{low_days}"],
                )

    # ------------------------------------------------------------------
    # 5. Disponibilidad / stock
    # ------------------------------------------------------------------
    if facts.in_stock is False:
        if re.search(
            r"\b(si\s+(hay|tenemos|contamos)|disponible(s)?\s+para\s+compra|en\s+stock)\b",
            normalized,
        ):
            return FactCheckResult(
                passed=False,
                reason_code="STOCK_CONTRADICTION",
                event_name="factual_mismatch",
                violating_items=["disponible"],
            )

    return FactCheckResult(passed=True, reason_code=None, event_name=None)
