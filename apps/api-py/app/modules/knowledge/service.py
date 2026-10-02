import contextlib
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, not_found
from app.core.ids import iso, new_id, utcnow
from app.core.storage import get_storage
from app.models import KnowledgeChunk, KnowledgeDocument
from app.modules.billing.service import BillingService
from app.modules.knowledge.constants import (
    KNOWLEDGE_DOCUMENT_TYPE_LABELS,
    KNOWLEDGE_DOCUMENT_TYPE_REASONS,
    REQUIRED_KNOWLEDGE_TYPES,
)
from app.modules.knowledge.indexer import reindex_document
from app.modules.knowledge.text import extract_text_from_pdf


def _require_company(company_id: str | None) -> str:
    if not company_id:
        raise bad_request("No perteneces a una empresa")
    return company_id


def _parse_type(type_param: str) -> str:
    if type_param not in REQUIRED_KNOWLEDGE_TYPES:
        raise bad_request(f"Tipo inválido. Usa: {', '.join(REQUIRED_KNOWLEDGE_TYPES)}")
    return type_param


class KnowledgeService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_slots(self, company_id: str | None) -> list[dict[str, Any]]:
        scoped = _require_company(company_id)
        chunk_count = (
            select(func.count(KnowledgeChunk.id))
            .where(KnowledgeChunk.document_id == KnowledgeDocument.id)
            .scalar_subquery()
        )
        rows = (
            await self.session.execute(
                select(KnowledgeDocument, chunk_count).where(KnowledgeDocument.company_id == scoped)
            )
        ).all()
        by_type = {document.type: (document, count) for document, count in rows}

        slots: list[dict[str, Any]] = []
        for doc_type in REQUIRED_KNOWLEDGE_TYPES:
            document, count = by_type.get(doc_type, (None, 0))
            uploaded = bool(document and document.status == "active" and (document.file_key or "").strip())
            slots.append(
                {
                    "type": doc_type,
                    "title": KNOWLEDGE_DOCUMENT_TYPE_LABELS[doc_type],
                    "reason": KNOWLEDGE_DOCUMENT_TYPE_REASONS[doc_type],
                    "uploaded": uploaded,
                    "documentId": document.id if uploaded and document else None,
                    "fileName": document.file_name if uploaded and document else None,
                    "chunksCount": count if uploaded else 0,
                    "updatedAt": iso(document.updated_at) if uploaded and document else None,
                }
            )
        return slots

    async def get_settings(self, company_id: str | None) -> dict[str, Any]:
        slots = await self.list_slots(company_id)
        missing = [slot["type"] for slot in slots if not slot["uploaded"]]
        return {"isConfigured": not missing, "missingTypes": missing, "slots": slots}

    async def upload_pdf(
        self, company_id: str | None, type_param: str, *, file_name: str | None, body: bytes | None
    ) -> dict[str, Any]:
        scoped = _require_company(company_id)
        doc_type = _parse_type(type_param)
        if not body:
            raise bad_request("Adjunta un archivo PDF")

        existing = await self.session.scalar(
            select(KnowledgeDocument).where(
                KnowledgeDocument.company_id == scoped, KnowledgeDocument.type == doc_type
            )
        )
        if not (existing and existing.file_key):
            await BillingService(self.session).assert_can(scoped, "upload_knowledge")

        text = extract_text_from_pdf(body)
        title = KNOWLEDGE_DOCUMENT_TYPE_LABELS[doc_type]
        storage = get_storage()
        uploaded = await storage.upload_knowledge_pdf(company_id=scoped, doc_type=doc_type, body=body)
        if existing and existing.file_key and existing.file_key != uploaded.key:
            with contextlib.suppress(Exception):
                await storage.delete_object(existing.file_key)

        name = file_name or f"{doc_type}.pdf"
        now = utcnow()
        values = {
            "title": title,
            "body": text,
            "status": "active",
            "file_key": uploaded.key,
            "file_name": name,
            "mime_type": "application/pdf",
        }
        columns = KnowledgeDocument.__mapper__.c
        stmt = (
            insert(KnowledgeDocument)
            .values(id=new_id(), company_id=scoped, type=doc_type, created_at=now, updated_at=now, **values)
            .on_conflict_do_update(
                index_elements=["companyId", "type"],
                set_={columns[key].name: value for key, value in {**values, "updated_at": now}.items()},
            )
            .returning(KnowledgeDocument.id)
        )
        document_id = (await self.session.execute(stmt)).scalar_one()
        await self.session.commit()

        await reindex_document(self.session, document_id)
        slots = await self.list_slots(scoped)
        return next(slot for slot in slots if slot["type"] == doc_type)

    async def remove_by_type(self, company_id: str | None, type_param: str) -> None:
        scoped = _require_company(company_id)
        doc_type = _parse_type(type_param)
        document = await self.session.scalar(
            select(KnowledgeDocument).where(
                KnowledgeDocument.company_id == scoped, KnowledgeDocument.type == doc_type
            )
        )
        if not document:
            raise not_found("Documento no encontrado")
        if document.file_key:
            with contextlib.suppress(Exception):
                await get_storage().delete_object(document.file_key)
        await self.session.delete(document)
        await self.session.commit()
