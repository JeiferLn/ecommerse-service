import re
import unicodedata

_DIACRITICS = re.compile(r"[\u0300-\u036f]")


def strip_accents(value: str) -> str:
    """`normalize("NFD").replace(/[\\u0300-\\u036f]/g, "")` de JS."""
    return _DIACRITICS.sub("", unicodedata.normalize("NFD", value))


def fold(value: str) -> str:
    """Minúsculas y sin tildes, para comparar texto del cliente."""
    return strip_accents(value.lower())


def slugify(value: str) -> str:
    slug = strip_accents(value).lower().strip()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"^-+|-+$", "", slug)
    return slug[:80]


def detect_image_mime(buffer: bytes) -> str | None:
    """MIME real por magic bytes (JPEG/PNG/WebP/GIF)."""
    if len(buffer) < 12:
        return None
    if buffer[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if buffer[:4] == b"\x89PNG":
        return "image/png"
    if buffer[:3] == b"GIF":
        return "image/gif"
    if buffer[:4] == b"RIFF" and buffer[8:12] == b"WEBP":
        return "image/webp"
    return None
