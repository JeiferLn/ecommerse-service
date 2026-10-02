from fastapi import APIRouter, UploadFile

from app.core.db import DbSession
from app.core.errors import ApiError
from app.core.responses import ok
from app.core.security import CurrentUser, require_roles
from app.modules.knowledge.service import KnowledgeService

router = APIRouter(prefix="/knowledge", tags=["knowledge"])

MAX_PDF_BYTES = 8 * 1024 * 1024


@router.get("", dependencies=[require_roles("owner", "manager")])
async def list_slots(user: CurrentUser, session: DbSession) -> dict:
    return ok(await KnowledgeService(session).list_slots(user.company_id))


@router.put("/{doc_type}/file", dependencies=[require_roles("owner", "manager")])
async def upload_pdf(
    doc_type: str, user: CurrentUser, session: DbSession, file: UploadFile | None = None
) -> dict:
    body = await file.read(MAX_PDF_BYTES + 1) if file else None
    if body and len(body) > MAX_PDF_BYTES:
        raise ApiError(413, "File too large")
    slot = await KnowledgeService(session).upload_pdf(
        user.company_id, doc_type, file_name=file.filename if file else None, body=body
    )
    return ok(slot, "Documento PDF indexado")


@router.delete("/{doc_type}", dependencies=[require_roles("owner", "manager")])
async def remove(doc_type: str, user: CurrentUser, session: DbSession) -> dict:
    await KnowledgeService(session).remove_by_type(user.company_id, doc_type)
    return ok(None, "Documento eliminado")
