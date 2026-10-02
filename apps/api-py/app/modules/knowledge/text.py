import io
import re

from pypdf import PdfReader

from app.core.errors import ApiError, bad_request


def chunk_text(text: str, *, chunk_size: int, overlap: int) -> list[str]:
    """Divide texto en chunks por párrafos / tamaño, con overlap opcional."""
    normalized = text.replace("\r\n", "\n").strip()
    if not normalized:
        return []

    safe_size = max(100, chunk_size)
    safe_overlap = max(0, min(overlap, safe_size // 2))
    paragraphs = [part.strip() for part in re.split(r"\n{2,}", normalized) if part.strip()]

    units: list[str] = []
    for paragraph in paragraphs or [normalized]:
        if len(paragraph) <= safe_size:
            units.append(paragraph)
            continue
        start = 0
        while start < len(paragraph):
            end = min(start + safe_size, len(paragraph))
            units.append(paragraph[start:end].strip())
            if end >= len(paragraph):
                break
            start = max(end - safe_overlap, start + 1)

    chunks: list[str] = []
    buffer = ""
    for unit in units:
        if not buffer:
            buffer = unit
            continue
        if len(f"{buffer}\n\n{unit}") <= safe_size:
            buffer = f"{buffer}\n\n{unit}"
            continue
        chunks.append(buffer)
        if safe_overlap > 0 and len(buffer) > safe_overlap:
            tail = buffer[-safe_overlap:]
            buffer = f"{tail}\n\n{unit}"[: safe_size * 2]
            if len(buffer) > safe_size:
                chunks.append(buffer[:safe_size].strip())
                buffer = buffer[max(0, safe_size - safe_overlap) :]
        else:
            buffer = unit

    if buffer.strip():
        chunks.append(buffer.strip())
    return [chunk for chunk in chunks if chunk]


def assert_pdf_buffer(buffer: bytes) -> None:
    if not buffer or len(buffer) < 5 or buffer[:4] != b"%PDF":
        raise bad_request("Solo se aceptan archivos PDF válidos")


def extract_text_from_pdf(buffer: bytes) -> str:
    assert_pdf_buffer(buffer)
    try:
        reader = PdfReader(io.BytesIO(buffer))
        raw = " ".join(page.extract_text() or "" for page in reader.pages)
        text = re.sub(r"\s+", " ", raw).strip()
        if len(text) < 40:
            raise bad_request(
                "El PDF no tiene texto suficiente. Usa un PDF con texto seleccionable (no escaneado)."
            )
        return text
    except ApiError:
        raise
    except Exception as error:
        raise bad_request("No se pudo leer el PDF. Verifica que el archivo no esté dañado.") from error
