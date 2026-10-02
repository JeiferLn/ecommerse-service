from typing import Any

from fastapi import APIRouter

from app.core.db import DbSession
from app.core.responses import ok
from app.core.security import CurrentUser, require_roles
from app.modules.dashboard.service import DashboardService

router = APIRouter(tags=["dashboard"])


@router.get("/company/stats")
async def company_stats(user: CurrentUser, session: DbSession) -> Any:
    return ok(await DashboardService(session).get_company_stats(user.company_id))


@router.get("/admin/stats", dependencies=[require_roles("admin")])
async def platform_stats(user: CurrentUser, session: DbSession) -> Any:
    return ok(await DashboardService(session).get_platform_stats(user.role))
