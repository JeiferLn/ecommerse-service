import logging

from sqlalchemy import delete, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.models import KnowledgeChunk, KnowledgeDocument
from app.modules.knowledge.embeddings import get_embedding_provider, vector_to_sql_literal
from app.modules.knowledge.text import chunk_text

logger = logging.getLogger("app.knowledge.indexer")


async def reindex_document(session: AsyncSession, document_id: str) -> int:
    document = await session.get(KnowledgeDocument, document_id)
    if not document:
        return 0

    await session.execute(delete(KnowledgeChunk).where(KnowledgeChunk.document_id == document.id))
    if document.status != "active":
        await session.commit()
        return 0

    settings = get_settings()
    pieces = chunk_text(
        f"{document.title}\n\n{document.body}",
        chunk_size=settings.RAG_CHUNK_SIZE,
        overlap=settings.RAG_CHUNK_OVERLAP,
    )
    if not pieces:
        await session.commit()
        return 0

    try:
        embeddings = await get_embedding_provider().embed(pieces)
    except Exception as error:
        logger.error("Falló embedding al indexar %s: %s", document.id, error)
        await session.rollback()
        raise

    for index, content in enumerate(pieces):
        chunk = KnowledgeChunk(
            document_id=document.id, company_id=document.company_id, content=content, chunk_index=index
        )
        session.add(chunk)
        await session.flush()
        if index < len(embeddings) and embeddings[index]:
            await session.execute(
                text('UPDATE "KnowledgeChunk" SET embedding = CAST(:vec AS vector) WHERE id = :id'),
                {"vec": vector_to_sql_literal(embeddings[index]), "id": chunk.id},
            )
    await session.commit()
    return len(pieces)
