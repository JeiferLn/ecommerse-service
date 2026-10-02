import re
from typing import Annotated, Any

from fastapi import APIRouter
from pydantic import Field

from app.core.db import DbSession
from app.core.responses import ok
from app.core.schemas import RequestModel
from app.core.security import require_roles
from app.core.validation import boolean, matches, string
from app.modules.platform.service import PlatformSettingsService

router = APIRouter(prefix="/admin/platform-settings", tags=["admin"], dependencies=[require_roles("admin")])


class UpdatePlatformSettingsBody(RequestModel):
    # Vacío o null = volver al número del .env.
    shared_whatsapp_number: Annotated[
        Annotated[str, matches(r"^$|^\+[1-9]\d{7,14}$", "Usa formato E.164 con +: +14155238886", re.ASCII)]
        | None,
        string("sharedWhatsAppNumber must be a string"),
    ] = Field(default=None, alias="sharedWhatsAppNumber")
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
