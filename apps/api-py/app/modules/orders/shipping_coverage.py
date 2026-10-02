import re

from app.core.shared_data import company_countries
from app.core.text import strip_accents
from app.modules.ai.commerce_prompt import SHIPPING_SCOPE_LABELS

CITY_ALIASES = {
    "bogota": "bogota",
    "bogota d c": "bogota",
    "bogota dc": "bogota",
    "santa fe de bogota": "bogota",
    "cali": "cali",
    "santiago de cali": "cali",
    "medellin": "medellin",
    "ciudad de mexico": "ciudad de mexico",
    "cdmx": "ciudad de mexico",
    "mexico city": "ciudad de mexico",
}


def normalize_place_name(value: str) -> str:
    normalized = strip_accents(value.lower())
    normalized = re.sub(r"[^\w\s]", " ", normalized, flags=re.ASCII)
    return re.sub(r"\s+", " ", normalized).strip()


def canonical_city_name(value: str) -> str:
    normalized = normalize_place_name(value)
    return CITY_ALIASES.get(normalized, normalized)


def cities_match(a: str, b: str) -> bool:
    left, right = canonical_city_name(a), canonical_city_name(b)
    if not left or not right:
        return False
    return left == right or right in left or left in right


def resolve_country_code(value: str) -> str | None:
    raw = value.strip()
    if not raw:
        return None
    if re.fullmatch(r"[A-Za-z]{2}", raw):
        return raw.upper()
    normalized = normalize_place_name(raw)
    for country in company_countries():
        if normalize_place_name(country["name"]) == normalized or country["code"].lower() == normalized:
            return country["code"]
    return None


def country_display_name(code: str | None) -> str:
    if not code:
        return ""
    return next((country["name"] for country in company_countries() if country["code"] == code), code)


def describe_shipping_coverage(
    *,
    country_code: str | None,
    shipping_region: str | None,
    shipping_city: str | None,
    shipping_scopes: list[str],
) -> str:
    scopes = shipping_scopes
    country = country_display_name(country_code) or "tu país"
    city = (shipping_city or "").strip()
    region = (shipping_region or "").strip()
    place = f"{city} ({region})" if city and region else city or region
    labels = [SHIPPING_SCOPE_LABELS.get(scope, scope) for scope in scopes]

    if "international" in scopes and "national" in scopes and "local" in scopes:
        return f"Envíos locales{f' en {place}' if place else ''}, nacionales en {country} e internacionales."
    if "national" in scopes and "local" in scopes:
        return f"Envíos locales{f' en {place}' if place else ''} y nacionales en {country}."
    if "local" in scopes and "national" not in scopes and "international" not in scopes:
        return (
            f"Solo envíos locales en {place} ({country})."
            if place
            else f"Solo envíos locales en el municipio de la tienda ({country})."
        )
    if "national" in scopes and "international" not in scopes:
        return f"Envíos nacionales en {country}{f' (base: {place})' if place else ''}."
    if "international" in scopes:
        return f"Envíos internacionales{f' desde {place}' if place else ''}."
    return f"Cobertura: {', '.join(labels)}." if labels else "Sin cobertura de envío configurada."


def validate_shipping_coverage(
    *,
    company_country_code: str | None,
    company_city: str | None,
    shipping_scopes: list[str],
    destination_country: str,
    destination_city: str,
) -> str | None:
    """Valida si el destino del cliente está cubierto por los alcances de la tienda.

    Devuelve None si está cubierto, o el mensaje de error en español.
    """
    scopes = set(shipping_scopes)
    if not scopes:
        return "La tienda aún no tiene cobertura de envío configurada."

    company_country = (company_country_code or "").strip().upper() or None
    dest_country = resolve_country_code(destination_country)
    if not dest_country:
        return "Indica un país de destino válido."

    dest_city = destination_city.strip()
    if not dest_city:
        return "Indica la ciudad de destino."
    if not company_country:
        return "La tienda no tiene país de operación configurado."

    store_city = (company_city or "").strip() or None
    same_city = cities_match(dest_city, store_city) if store_city else False

    if dest_country != company_country:
        if "international" not in scopes:
            return f"Esta tienda no hace envíos internacionales. Solo opera en {country_display_name(company_country)}."
        return None

    if same_city:
        if "local" in scopes or "national" in scopes:
            return None
        return f"No hay cobertura de envío configurada para {store_city or dest_city}."

    # Mismo país, otra ciudad → necesita nacional
    if "national" in scopes:
        return None
    if "local" in scopes:
        return (
            f"Esta tienda solo hace envíos locales en {store_city}. No enviamos a {dest_city}."
            if store_city
            else f"Esta tienda solo hace envíos locales en su ciudad. No enviamos a {dest_city}."
        )
    return "El destino indicado no está dentro de la cobertura de envío de la tienda."
