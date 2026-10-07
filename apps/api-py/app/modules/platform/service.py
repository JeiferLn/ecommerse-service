from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.errors import forbidden
from app.core.ids import utcnow
from app.models import PlatformSettings
from app.modules.platform.overrides import SETTINGS_ID, remember
from app.modules.whatsapp.twilio_client import account_credentials, resolve_simulate_send

WEBHOOK_PATH = "/api/v1/whatsapp/webhook"


def twilio_webhook_url(settings: Settings) -> str | None:
    """URL que se pega en Twilio como webhook de mensajes entrantes."""
    explicit = (settings.TWILIO_WEBHOOK_URL or "").strip()
    if explicit:
        return explicit
    public = (settings.API_PUBLIC_URL or "").strip().rstrip("/")
    return f"{public}{WEBHOOK_PATH}" if public else None


class PlatformSettingsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_view(self) -> dict[str, Any]:
        return self._view(await self.session.get(PlatformSettings, SETTINGS_ID))

    async def update(self, changes: dict[str, Any]) -> dict[str, Any]:
        """Aplica solo los campos enviados. `None` en un campo vuelve al valor del `.env`."""
        settings = get_settings()
        row = await self.session.get(PlatformSettings, SETTINGS_ID)
        if row is None:
            row = PlatformSettings(id=SETTINGS_ID)
            self.session.add(row)

        if "whatsapp_simulate_send" in changes:
            if settings.is_production:
                raise forbidden("En producción el modo de envío solo se cambia en el .env")
            row.whatsapp_simulate_send = changes["whatsapp_simulate_send"]

        row.updated_at = utcnow()
        await self.session.commit()
        remember(row)
        return self._view(row)

    def _view(self, row: PlatformSettings | None) -> dict[str, Any]:
        settings = get_settings()
        simulate, simulate_source = resolve_simulate_send(row.whatsapp_simulate_send if row else None)
        return {
            "whatsapp": {
                "credentialsConfigured": account_credentials() is not None,
                "simulateSend": simulate,
                "simulateSendSource": simulate_source,
                "simulateSendEditable": not settings.is_production,
                "webhookUrl": twilio_webhook_url(settings),
                "signatureValidation": settings.is_production or not settings.TWILIO_SKIP_SIGNATURE,
                "interactiveEnabled": settings.WHATSAPP_INTERACTIVE_ENABLED,
                "checkoutTemplateConfigured": bool((settings.TWILIO_CHECKOUT_CONTENT_SID or "").strip()),
                "techProviderEnabled": settings.tech_provider_ready,
                "metaAppId": (settings.META_APP_ID or "").strip() or None,
                "metaEmbeddedSignupConfigId": (settings.META_EMBEDDED_SIGNUP_CONFIG_ID or "").strip() or None,
            }
        }
