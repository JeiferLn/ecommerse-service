"""Optimización de imágenes subidas: se guardan siempre como WebP comprimido y redimensionado."""

import io

from PIL import Image, ImageOps, ImageSequence, UnidentifiedImageError

WEBP_CONTENT_TYPE = "image/webp"
MAX_DIMENSION = 2000
WEBP_QUALITY = 80
MAX_PIXELS = 40_000_000
MAX_ANIMATION_PIXELS = 150_000_000


class InvalidImageError(ValueError):
    pass


def to_webp(body: bytes) -> bytes:
    """Convierte a WebP con el lado mayor limitado a `MAX_DIMENSION` y sin metadatos EXIF.

    Corrige la orientación EXIF antes de descartarla. Los GIF animados quedan como WebP animado.
    Si la imagen ya era WebP y el resultado pesa más, se conserva la original."""
    try:
        with Image.open(io.BytesIO(body)) as image:
            frames = getattr(image, "n_frames", 1)
            if image.width * image.height > MAX_PIXELS:
                raise InvalidImageError("La imagen es demasiado grande (máximo 40 megapíxeles)")
            if frames * image.width * image.height > MAX_ANIMATION_PIXELS:
                raise InvalidImageError("La animación es demasiado grande para procesarla")
            source_format = image.format
            optimized = _encode_animated(image) if frames > 1 else _encode_still(image)
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError) as exc:
        raise InvalidImageError(
            "No se pudo procesar la imagen; verifica que el archivo no esté dañado"
        ) from exc

    if source_format == "WEBP" and len(optimized) >= len(body):
        return body
    return optimized


def _has_alpha(image: Image.Image) -> bool:
    return image.mode in ("RGBA", "LA", "PA") or (image.mode == "P" and "transparency" in image.info)


def _encode_still(image: Image.Image) -> bytes:
    icc_profile = image.info.get("icc_profile")
    oriented = ImageOps.exif_transpose(image)
    converted = oriented.convert("RGBA" if _has_alpha(oriented) else "RGB")
    converted.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)
    buffer = io.BytesIO()
    options: dict[str, object] = {"quality": WEBP_QUALITY, "method": 4}
    if icc_profile:
        options["icc_profile"] = icc_profile
    converted.save(buffer, "WEBP", **options)
    return buffer.getvalue()


def _encode_animated(image: Image.Image) -> bytes:
    frames: list[Image.Image] = []
    durations: list[int] = []
    for frame in ImageSequence.Iterator(image):
        converted = frame.convert("RGBA")
        converted.thumbnail((MAX_DIMENSION, MAX_DIMENSION), Image.Resampling.LANCZOS)
        frames.append(converted)
        durations.append(int(frame.info.get("duration", 100)))
    buffer = io.BytesIO()
    frames[0].save(
        buffer,
        "WEBP",
        save_all=True,
        append_images=frames[1:],
        duration=durations,
        loop=int(image.info.get("loop", 0)),
        quality=WEBP_QUALITY,
        method=4,
    )
    return buffer.getvalue()
