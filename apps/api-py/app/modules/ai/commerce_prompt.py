from dataclasses import dataclass

from app.core.shared_data import company_countries

SHIPPING_SCOPE_LABELS = {
    "local": "Local / misma ciudad",
    "national": "Nacional",
    "international": "Internacional",
}


@dataclass
class CommerceSettings:
    country_code: str | None
    shipping_region: str | None
    shipping_city: str | None
    shipping_scopes: list[str]
    shipping_carriers: list[str]


def is_commerce_configured(settings: CommerceSettings) -> bool:
    if not (settings.country_code or "").strip():
        return False
    if not settings.shipping_scopes or not settings.shipping_carriers:
        return False
    return "local" not in settings.shipping_scopes or bool(
        (settings.shipping_region or "").strip() and (settings.shipping_city or "").strip()
    )


def format_commerce_prompt_block(settings: CommerceSettings) -> tuple[bool, str]:
    """(configurado, bloque de envíos para el prompt)."""
    if not is_commerce_configured(settings):
        return False, "(sin configurar)"

    country_name = next(
        (item["name"] for item in company_countries() if item["code"] == settings.country_code),
        settings.country_code,
    )
    scopes = ", ".join(SHIPPING_SCOPE_LABELS.get(scope, scope) for scope in settings.shipping_scopes)
    location = [
        part.strip() for part in (settings.shipping_city, settings.shipping_region) if part and part.strip()
    ]
    lines = [f"- País de la tienda: {country_name}"]
    if location:
        lines.append(f"- Ubicación base de la tienda: {', '.join(location)}")
    lines += [
        f"- Alcance de envíos: {scopes}",
        f"- Transportadoras: {', '.join(settings.shipping_carriers)}",
        "- Pago: se procesa por pasarela de la plataforma (no ofrezcas transferencias, tarjetas ni contraentrega "
        "como métodos de la tienda).",
        "- Si solo hay alcance local, NO digas que envían a otras ciudades del país.",
    ]
    return True, "\n".join(lines)
