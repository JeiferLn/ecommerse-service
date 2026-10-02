import re
from urllib.parse import quote

from app.core.text import strip_accents

# Códigos de 3–30 caracteres: letras, números y guiones internos.
STORE_CODE_IN_TEXT = re.compile(r"#([a-z0-9][a-z0-9-]{1,28}[a-z0-9])\b", re.IGNORECASE | re.ASCII)


def slugify_store_code(name: str) -> str:
    """ "Tienda Ñandú & Co." → "tienda-nandu-co" (3–24 caracteres; deja sitio para un sufijo)."""
    slug = re.sub(r"[^a-z0-9]+", "-", strip_accents(name).lower()).strip("-")[:24].rstrip("-")
    return slug if len(slug) >= 3 else f"tienda{f'-{slug}' if slug else ''}"


def extract_store_code(text: str) -> tuple[str | None, str]:
    """Busca `#codigo` en el mensaje y devuelve el código en minúsculas y el texto sin él."""
    match = STORE_CODE_IN_TEXT.search(text)
    if not match:
        return None, text.strip()
    rest = re.sub(r"\s+", " ", f"{text[: match.start()]} {text[match.end() :]}").strip()
    return match.group(1).lower(), rest


def build_wa_me_link(
    *, number: str, store_code: str | None = None, store_name: str | None = None
) -> str | None:
    digits = re.sub(r"\D", "", number, flags=re.ASCII)
    if not digits:
        return None
    if not store_code:
        return f"https://wa.me/{digits}"
    name = (store_name or "").strip()
    greeting = f"Hola {name}" if name else "Hola"
    text = quote(f"{greeting} #{store_code}", safe="-_.!~*'()")
    return f"https://wa.me/{digits}?text={text}"
