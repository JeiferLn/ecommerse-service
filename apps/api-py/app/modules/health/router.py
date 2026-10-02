from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.db import DbSession

router = APIRouter(prefix="/health", tags=["health"])


@router.get("")
async def check(session: DbSession) -> JSONResponse:
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        return JSONResponse(
            status_code=503,
            content={
                "status": "error",
                "data": {"status": "error", "database": "down"},
                "message": "Base de datos no disponible",
            },
        )
    return JSONResponse(content={"status": "success", "data": {"status": "ok", "database": "up"}})
