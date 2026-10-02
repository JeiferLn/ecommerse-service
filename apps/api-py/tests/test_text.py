import math

import pytest

from app.core.numbers import num, num_or_none
from app.core.text import detect_image_mime, fold, slugify
from app.modules.knowledge.embeddings import hash_to_vector
from app.modules.knowledge.text import chunk_text, extract_text_from_pdf


def test_slugify_matches_nest() -> None:
    assert slugify("  Camisas Ñandú & Más!! ") == "camisas-nandu-mas"
    assert slugify("!!!") == ""
    assert len(slugify("a" * 200)) == 80


def test_fold_removes_accents_and_case() -> None:
    assert fold("Devolución DAÑADO") == "devolucion danado"


def test_detect_image_mime() -> None:
    assert detect_image_mime(b"\xff\xd8\xff" + b"0" * 20) == "image/jpeg"
    assert detect_image_mime(b"\x89PNG" + b"0" * 20) == "image/png"
    assert detect_image_mime(b"GIF89a" + b"0" * 20) == "image/gif"
    assert detect_image_mime(b"RIFF0000WEBP" + b"0" * 4) == "image/webp"
    assert detect_image_mime(b"not an image at all") is None
    assert detect_image_mime(b"short") is None


def test_chunk_text_respects_size_and_overlap() -> None:
    paragraph = "palabra " * 200
    chunks = chunk_text(f"Titulo\n\n{paragraph}", chunk_size=300, overlap=50)
    assert chunks
    assert all(len(chunk) <= 600 for chunk in chunks)
    assert chunk_text("   ", chunk_size=300, overlap=50) == []
    assert chunk_text("uno\n\ndos", chunk_size=300, overlap=0) == ["uno\n\ndos"]


def test_mock_embedding_is_normalized_and_deterministic() -> None:
    first = hash_to_vector("Política de devoluciones", 64)
    assert first == hash_to_vector("politica de DEVOLUCIONES", 64)
    assert math.isclose(math.sqrt(sum(v * v for v in first)), 1.0, rel_tol=1e-9)


def test_pdf_requires_magic_bytes() -> None:
    with pytest.raises(Exception, match="Solo se aceptan archivos PDF válidos"):
        extract_text_from_pdf(b"hello world")


def test_num_serializes_like_js_number() -> None:
    from decimal import Decimal

    assert num(Decimal("45000.00")) == 45000
    assert isinstance(num(Decimal("45000.00")), int)
    assert num(Decimal("2.50")) == 2.5
    assert num_or_none(None) is None
