"""Recuperación RAG filtrada por company_id y vigencia del documento.

Reglas de vigencia:
  - Solo se afirman como actuales documentos donde is_current=TRUE y
    (valid_until IS NULL OR valid_until > NOW()).
  - Un documento no vigente NO se descarta (puede dar contexto histórico),
    pero el llamador debe usar el formato:
      "Según la información publicada de «{título}»…"
    en lugar de afirmar el contenido como política actual.
  - Si no hay fuente vigente para una política → no se improvisa.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.text import fold
from app.models import KnowledgeChunk, KnowledgeDocument
from app.modules.knowledge.embeddings import get_embedding_provider, vector_to_sql_literal

logger = logging.getLogger("app.knowledge.retrieval")

MAX_DISTANCE = 0.72
"""Descarta chunks muy lejanos (cosine distance ~1 = ortogonal)."""

SYNONYM_GROUPS: list[list[str]] = [
    ["devolver", "devolucion", "devoluciones", "cambio", "cambios", "reembolso"],
    ["garantia", "garantias", "defectuoso", "danado", "roto", "falla", "mal"],
    ["envio", "envios", "entrega", "despacho", "nacional"],
    ["horario", "horarios", "atencion", "atienden"],
    ["pago", "pagos", "factura", "facturacion"],
]

# Prefijo para citación de documento no vigente
STALE_CITATION_PREFIX = "Según la información publicada de «{title}»"


@dataclass
class RetrievedChunk:
    content: str
    document_title: str
    document_type: str
    distance: float
    is_current: bool = True
    """True si el documento está vigente (is_current=TRUE y valid_until no expirado)."""
    stale_fields: list[str] = field(default_factory=list)
    """Campos de contexto adicional para trazabilidad en tests/observabilidad."""


def format_rag_block(chunks: list[RetrievedChunk]) -> str:
    """Formatea el bloque RAG para el system prompt.

    Los chunks no vigentes se marcan con [STALE] para que el modelo sepa
    que debe usar la fórmula de citación indirecta.
    """
    parts: list[str] = []
    for index, chunk in enumerate(chunks):
        prefix = f"[{index + 1}] ({chunk.document_type}) {chunk.document_title}"
        if not chunk.is_current:
            prefix += " [INFORMACIÓN NO VIGENTE]"
        parts.append(f"{prefix}\n{chunk.content}")
    return "\n\n".join(parts)


def stale_citation(chunk: RetrievedChunk) -> str:
    """Devuelve el prefijo de citación adecuado para un chunk no vigente."""
    return STALE_CITATION_PREFIX.format(title=chunk.document_title)


async def retrieve(session: AsyncSession, company_id: str, query: str) -> tuple[str, list[RetrievedChunk]]:
    """Recupera chunks relevantes filtrados estrictamente por company_id.

    Siempre filtra por company_id.  Los documentos no vigentes se incluyen
    pero marcados con is_current=False para que el llamador aplique la fórmula
    de citación condicional.
    """
    trimmed = query.strip()
    if not trimmed:
        return "", []
    top_k = get_settings().RAG_TOP_K
    try:
        embeddings = await get_embedding_provider().embed([trimmed])
        if not embeddings:
            return "", []
        rows = (
            await session.execute(
                text(
                    """
                    SELECT c."content" AS content,
                           d."title" AS document_title,
                           d."type"::text AS document_type,
                           (c."embedding" <=> CAST(:vec AS vector)) AS distance,
                           d."isCurrent" AS is_current,
                           d."validUntil" AS valid_until,
                           d."updatedAt" AS updated_at
                    FROM "KnowledgeChunk" c
                    INNER JOIN "KnowledgeDocument" d ON d."id" = c."documentId"
                    WHERE c."companyId" = :company_id
                      AND d."status" = 'active'
                      AND c."embedding" IS NOT NULL
                    ORDER BY c."embedding" <=> CAST(:vec AS vector)
                    LIMIT :top_k
                    """
                ),
                {"vec": vector_to_sql_literal(embeddings[0]), "company_id": company_id, "top_k": top_k},
            )
        ).all()
        chunks = [
            _make_chunk(row)
            for row in rows
            if float(row.distance) <= MAX_DISTANCE
        ]
        if not chunks:
            chunks = await _lexical_fallback(session, company_id, trimmed, top_k)
        return format_rag_block(chunks), chunks
    except Exception as error:  # noqa: BLE001
        logger.warning("RAG retrieve falló, usando fallback léxico: %s", error)
        await session.rollback()
        chunks = await _lexical_fallback(session, company_id, trimmed, top_k)
        return format_rag_block(chunks), chunks


def _make_chunk(row: object) -> RetrievedChunk:
    """Construye RetrievedChunk determinando vigencia."""
    from datetime import datetime, timezone

    is_current: bool = bool(getattr(row, "is_current", True))
    valid_until = getattr(row, "valid_until", None)
    if valid_until is not None:
        # Comparar con now() en UTC
        now = datetime.now(tz=timezone.utc).replace(tzinfo=None)
        if valid_until < now:
            is_current = False

    return RetrievedChunk(
        content=row.content,
        document_title=row.document_title,
        document_type=row.document_type,
        distance=float(row.distance),
        is_current=is_current,
    )


async def _lexical_fallback(
    session: AsyncSession, company_id: str, query: str, top_k: int
) -> list[RetrievedChunk]:
    base_tokens = [token for token in re.split(r"[^a-z0-9]+", fold(query)) if len(token) >= 3]
    tokens: dict[str, None] = dict.fromkeys(base_tokens)
    for token in base_tokens:
        for group in SYNONYM_GROUPS:
            if token in group:
                tokens.update(dict.fromkeys(group))
    # Heurística: preguntas de devolución/daño también buscan docs de garantía/política.
    if re.search(r"(devolv|cambio|garant|danad|defect|mal estado|roto)", fold(query)):
        tokens.update(dict.fromkeys(SYNONYM_GROUPS[0]))
        tokens.update(dict.fromkeys(SYNONYM_GROUPS[1]))

    token_list = list(tokens)[:16]
    if not token_list:
        return []

    documents = (
        await session.execute(
            select(
                KnowledgeDocument.id,
                KnowledgeDocument.title,
                KnowledgeDocument.type,
                KnowledgeDocument.is_current,
                KnowledgeDocument.valid_until,
            )
            .where(KnowledgeDocument.company_id == company_id, KnowledgeDocument.status == "active")
            .limit(50)
        )
    ).all()
    scored: list[RetrievedChunk] = []
    from datetime import datetime, timezone

    now = datetime.now(tz=timezone.utc).replace(tzinfo=None)

    for document in documents:
        # Vigencia en fallback léxico
        doc_is_current = bool(document.is_current) if document.is_current is not None else True
        if document.valid_until is not None and document.valid_until < now:
            doc_is_current = False

        title_haystack = fold(f"{document.title} {document.type}")
        contents = (
            await session.scalars(
                select(KnowledgeChunk.content)
                .where(KnowledgeChunk.document_id == document.id)
                .order_by(KnowledgeChunk.chunk_index)
            )
        ).all()
        for content in contents:
            haystack = f"{title_haystack} {fold(content)}"
            hits = sum(1 for token in token_list if token in haystack)
            if hits > 0:
                scored.append(
                    RetrievedChunk(
                        content=content,
                        document_title=document.title,
                        document_type=document.type,
                        distance=1 - hits / len(token_list),
                        is_current=doc_is_current,
                    )
                )
    return sorted(scored, key=lambda chunk: chunk.distance)[:top_k]
