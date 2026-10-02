from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.errors import bad_request, conflict, forbidden
from app.core.ids import utcnow
from app.models import Company, PlatformSettings, WhatsAppConnection
from app.modules.platform.overrides import SETTINGS_ID, remember
from app.modules.whatsapp.connection_service import normalize_shared_number
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
        return await self._view(await self.session.get(PlatformSettings, SETTINGS_ID))

    async def update(self, changes: dict[str, Any]) -> dict[str, Any]:
        """Aplica solo los campos enviados. `None` en un campo vuelve al valor del `.env`."""
        settings = get_settings()
        row = await self.session.get(PlatformSettings, SETTINGS_ID)
        if row is None:
            row = PlatformSettings(id=SETTINGS_ID)
            self.session.add(row)

        if "shared_whatsapp_number" in changes:
            row.shared_whatsapp_number = await self._validated_shared_number(
                changes["shared_whatsapp_number"]
            )
        if "whatsapp_simulate_send" in changes:
            if settings.is_production:
                raise forbidden("En producción el modo de envío solo se cambia en el .env")
            row.whatsapp_simulate_send = changes["whatsapp_simulate_send"]

        effective = normalize_shared_number(row.shared_whatsapp_number) or normalize_shared_number(
            settings.TWILIO_SHARED_WHATSAPP_NUMBER
        )
        if effective:
            # Las tiendas en el compartido guardan el número en su conexión: se mueven al nuevo.
            await self.session.execute(
                update(WhatsAppConnection)
                .where(
                    WhatsAppConnection.mode == "shared",
                    WhatsAppConnection.twilio_whatsapp_number != effective,
                )
                .values(twilio_whatsapp_number=effective, updated_at=utcnow())
            )
        else:
            stores = await self._shared_stores_count()
            if stores:
                raise bad_request(
                    f"{stores} tienda(s) atienden por el número compartido; indica uno para que sigan "
                    "recibiendo mensajes."
                )

        row.updated_at = utcnow()
        await self.session.commit()
        remember(row)
        return await self._view(row)

    async def _validated_shared_number(self, raw: str | None) -> str | None:
        if not (raw or "").strip():
            return None
        number = normalize_shared_number(raw)
        if not number:
            raise bad_request("Usa formato E.164 con +: +14155238886")
        owner = await self.session.scalar(
            select(Company.name)
            .join(WhatsAppConnection, WhatsAppConnection.company_id == Company.id)
            .where(
                WhatsAppConnection.mode == "dedicated",
                WhatsAppConnection.twilio_whatsapp_number == number,
            )
        )
        if owner:
            raise conflict(f"Ese número ya es el número propio de {owner}; usa otro para el compartido.")
        return number

    async def _shared_stores_count(self) -> int:
        return (
            await self.session.scalar(
                select(func.count(WhatsAppConnection.id)).where(WhatsAppConnection.mode == "shared")
            )
            or 0
        )

    async def _view(self, row: PlatformSettings | None) -> dict[str, Any]:
        settings = get_settings()
        saved_number = normalize_shared_number(row.shared_whatsapp_number if row else None)
        env_number = normalize_shared_number(settings.TWILIO_SHARED_WHATSAPP_NUMBER)
        simulate, simulate_source = resolve_simulate_send(row.whatsapp_simulate_send if row else None)
        return {
            "whatsapp": {
                "sharedNumber": saved_number or env_number,
                "sharedNumberSource": "panel" if saved_number else ("env" if env_number else None),
                "envSharedNumber": env_number,
                "sharedStoresCount": await self._shared_stores_count(),
                "credentialsConfigured": account_credentials() is not None,
                "simulateSend": simulate,
                "simulateSendSource": simulate_source,
                "simulateSendEditable": not settings.is_production,
                "webhookUrl": twilio_webhook_url(settings),
                "signatureValidation": settings.is_production or not settings.TWILIO_SKIP_SIGNATURE,
                "interactiveEnabled": settings.WHATSAPP_INTERACTIVE_ENABLED,
                "checkoutTemplateConfigured": bool((settings.TWILIO_CHECKOUT_CONTENT_SID or "").strip()),
            }
        }
