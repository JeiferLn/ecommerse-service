"""Ajustes guardados desde el panel de plataforma, leídos con una caché corta en memoria."""

import time
from dataclasses import dataclass

from app.core.db import SessionLocal
from app.models import PlatformSettings

SETTINGS_ID = "default"
# Cada réplica relee la fila pasado este tiempo, así un cambio hecho en otra llega a todas.
CACHE_TTL_SECONDS = 10.0


@dataclass(frozen=True)
class PlatformOverrides:
    """`None` = sin valor en el panel: se usa el del `.env`."""

    shared_whatsapp_number: str | None = None
    whatsapp_simulate_send: bool | None = None


class _Cache:
    loaded_at: float | None = None
    value = PlatformOverrides()


_cache = _Cache()


def remember(row: PlatformSettings | None) -> PlatformOverrides:
    _cache.value = (
        PlatformOverrides(row.shared_whatsapp_number, row.whatsapp_simulate_send)
        if row
        else PlatformOverrides()
    )
    _cache.loaded_at = time.monotonic()
    return _cache.value


async def platform_overrides() -> PlatformOverrides:
    if _cache.loaded_at is not None and time.monotonic() - _cache.loaded_at < CACHE_TTL_SECONDS:
        return _cache.value
    async with SessionLocal() as session:
        row = await session.get(PlatformSettings, SETTINGS_ID)
    return remember(row)
