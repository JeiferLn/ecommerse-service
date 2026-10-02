import logging
import re
from dataclasses import dataclass

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


@dataclass
class RetrievedChunk:
    content: str
    document_title: str
    document_type: str
    distance: float


def format_rag_block(chunks: list[RetrievedChunk]) -> str:
    return "\n\n".join(
        f"[{index + 1}] ({chunk.document_type}) {chunk.document_title}\n{chunk.content}"
        for index, chunk in enumerate(chunks)
    )


async def retrieve(session: AsyncSession, company_id: str, query: str) -> tuple[str, list[RetrievedChunk]]:
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
                           (c."embedding" <=> CAST(:vec AS vector)) AS distance
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
            RetrievedChunk(row.content, row.document_title, row.document_type, float(row.distance))
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
            select(KnowledgeDocument.id, KnowledgeDocument.title, KnowledgeDocument.type)
            .where(KnowledgeDocument.company_id == company_id, KnowledgeDocument.status == "active")
            .limit(50)
        )
    ).all()
    scored: list[RetrievedChunk] = []
    for document in documents:
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
                    RetrievedChunk(content, document.title, document.type, 1 - hits / len(token_list))
                )
    return sorted(scored, key=lambda chunk: chunk.distance)[:top_k]
