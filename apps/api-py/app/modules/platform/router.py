from typing import Annotated, Any

from fastapi import APIRouter

from app.core.db import DbSession
from app.core.responses import ok
from app.core.schemas import RequestModel
from app.core.security import require_roles
from app.core.validation import boolean
from app.modules.platform.service import PlatformSettingsService

router = APIRouter(prefix="/admin/platform-settings", tags=["admin"], dependencies=[require_roles("admin")])


class UpdatePlatformSettingsBody(RequestModel):
    # null = volver al valor del .env.
    whatsapp_simulate_send: Annotated[
        bool | None, boolean("whatsappSimulateSend must be a boolean value")
    ] = None


@router.get("")
async def get_platform_settings(session: DbSession) -> dict[str, Any]:
    return ok(await PlatformSettingsService(session).get_view())


@router.patch("")
async def update_platform_settings(body: UpdatePlatformSettingsBody, session: DbSession) -> dict[str, Any]:
    changes = {name: getattr(body, name) for name in body.model_fields_set}
    return ok(await PlatformSettingsService(session).update(changes), "Configuración guardada")
