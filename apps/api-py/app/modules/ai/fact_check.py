import re
from dataclasses import dataclass, field

from app.core.text import strip_accents

PRICE_RE = re.compile(
    r"\$\s*([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)\b|"
    r"\b([0-9]{1,3}(?:[.,][0-9]{3})*(?:[.,][0-9]{2})?|[0-9]+)\s*(?:pesos|cop)\b",
    re.IGNORECASE | re.ASCII,
)

SKU_RE = re.compile(r"\bsku\s*[:#-]?\s*([a-z0-9_-]+)\b", re.IGNORECASE | re.ASCII)


def parse_numeric_price(raw: str) -> float | None:
    """Normaliza formatos numéricos como 50.000, 50,000 o 50000 a float."""
    cleaned = raw.strip()
    # Si tiene puntos como separadores de miles: 50.000 -> 50000
    if "." in cleaned and "," not in cleaned:
        parts = cleaned.split(".")
        if len(parts[-1]) == 3:  # 50.000
            cleaned = "".join(parts)
        elif len(parts[-1]) in (1, 2):  # 50.50
            cleaned = "".join(parts[:-1]) + "." + parts[-1]
    elif "," in cleaned and "." not in cleaned:
        parts = cleaned.split(",")
        if len(parts[-1]) == 3:  # 50,000
            cleaned = "".join(parts)
        elif len(parts[-1]) in (1, 2):  # 50,50
            cleaned = "".join(parts[:-1]) + "." + parts[-1]
    elif "." in cleaned and "," in cleaned:
        # e.g. 50,000.00 o 50.000,00
        if cleaned.rfind(".") > cleaned.rfind(","):
            cleaned = cleaned.replace(",", "")
        else:
            cleaned = cleaned.replace(".", "").replace(",", ".")

    try:
        return float(cleaned)
    except ValueError:
        return None


@dataclass
class FactSet:
    allowed_prices: set[float] = field(default_factory=set)
    allowed_skus: set[str] = field(default_factory=set)
    in_stock: bool | None = None
    product_names: set[str] = field(default_factory=set)


@dataclass
class FactCheckResult:
    passed: bool
    reason_code: str | None = None
    violating_items: list[str] = field(default_factory=list)


def verify_facts(text: str, facts: FactSet) -> FactCheckResult:
    """Valida que la redacción del modelo no alucine precios, SKUs ni invente disponibilidad.
    
    Cualquier precio citado que no provenga de la base de datos (tools) bloquea la respuesta.
    """
    normalized = strip_accents(text.lower())

    # 1. Validar precios
    extracted_prices: list[float] = []
    for match in PRICE_RE.finditer(text):
        raw_val = match.group(1) or match.group(2)
        if raw_val:
            num = parse_numeric_price(raw_val)
            if num is not None and num > 0:
                extracted_prices.append(num)

    for p in extracted_prices:
        # Si el precio no está en los precios permitidos de la tool
        is_allowed = any(abs(p - allowed) < 0.01 for allowed in facts.allowed_prices)
        if not is_allowed:
            return FactCheckResult(
                passed=False,
                reason_code="PRICE_HALLUCINATION",
                violating_items=[str(p)],
            )

    # 2. Validar SKUs
    for match in SKU_RE.finditer(text):
        sku = match.group(1).upper()
        if sku not in {s.upper() for s in facts.allowed_skus}:
            return FactCheckResult(
                passed=False,
                reason_code="SKU_HALLUCINATION",
                violating_items=[sku],
            )

    # 3. Contradicción con stock
    if facts.in_stock is False:
        if re.search(r"\b(si\s+(hay|tenemos|contamos)|disponible(s)?\s+para\s+compra|en\s+stock)\b", normalized):
            return FactCheckResult(
                passed=False,
                reason_code="STOCK_CONTRADICTION",
                violating_items=["disponible"],
            )

    return FactCheckResult(passed=True, reason_code=None)
