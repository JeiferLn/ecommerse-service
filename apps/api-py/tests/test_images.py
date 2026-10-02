import io

import pytest
from PIL import Image

from app.core.images import MAX_DIMENSION, InvalidImageError, to_webp


def _encode(image: Image.Image, fmt: str, **options: object) -> bytes:
    buffer = io.BytesIO()
    image.save(buffer, fmt, **options)
    return buffer.getvalue()


def _open(body: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(body))
    image.load()
    return image


def test_jpeg_is_resized_and_converted_to_webp() -> None:
    source = _encode(Image.new("RGB", (4000, 3000), (200, 40, 40)), "JPEG", quality=95)

    result = _open(to_webp(source))

    assert result.format == "WEBP"
    assert max(result.size) == MAX_DIMENSION
    assert result.size == (2000, 1500)


def test_small_image_keeps_its_size() -> None:
    source = _encode(Image.new("RGB", (640, 480), (10, 120, 200)), "PNG")

    result = _open(to_webp(source))

    assert result.size == (640, 480)


def test_png_transparency_is_preserved() -> None:
    source = _encode(Image.new("RGBA", (300, 300), (0, 0, 0, 0)), "PNG")

    result = _open(to_webp(source))

    assert result.mode == "RGBA"
    assert result.getpixel((10, 10))[3] == 0


def test_exif_orientation_is_applied_and_metadata_dropped() -> None:
    exif = Image.Exif()
    exif[0x0112] = 6
    source = _encode(Image.new("RGB", (400, 200), (90, 90, 90)), "JPEG", exif=exif.tobytes())

    result = _open(to_webp(source))

    assert result.size == (200, 400)
    assert not result.getexif()


def test_animated_gif_stays_animated() -> None:
    frames = [Image.new("RGB", (120, 120), color) for color in ((255, 0, 0), (0, 255, 0), (0, 0, 255))]
    source = _encode(frames[0], "GIF", save_all=True, append_images=frames[1:], duration=80, loop=0)

    result = _open(to_webp(source))

    assert result.format == "WEBP"
    assert getattr(result, "n_frames", 1) == 3


def test_webp_larger_after_reencoding_keeps_original() -> None:
    source = _encode(Image.new("RGB", (64, 64), (0, 0, 0)), "WEBP", quality=10)

    assert to_webp(source) == source


def test_corrupt_file_is_rejected() -> None:
    with pytest.raises(InvalidImageError):
        to_webp(b"\x89PNG\r\n\x1a\n" + b"\x00" * 64)
