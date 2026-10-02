import os
import secrets
import socket
import threading
import time
from datetime import UTC, datetime

_BASE36 = "0123456789abcdefghijklmnopqrstuvwxyz"
_BLOCK = 36**4
_lock = threading.Lock()
_counter = secrets.randbelow(_BLOCK)


def _to_base36(value: int) -> str:
    if value == 0:
        return "0"
    digits: list[str] = []
    while value:
        value, rem = divmod(value, 36)
        digits.append(_BASE36[rem])
    return "".join(reversed(digits))


def _pad(value: str, size: int) -> str:
    return value.rjust(size, "0")[-size:]


_FINGERPRINT = _pad(_to_base36(os.getpid()), 2) + _pad(
    _to_base36(sum(ord(char) for char in socket.gethostname()) + 36), 2
)


def new_id() -> str:
    """Id con formato cuid (v1), compatible con `@default(cuid())` de Prisma."""
    global _counter
    with _lock:
        _counter = (_counter + 1) % _BLOCK
        count = _counter
    timestamp = _to_base36(int(time.time() * 1000))
    random_block = _pad(_to_base36(secrets.randbelow(_BLOCK)), 4) + _pad(
        _to_base36(secrets.randbelow(_BLOCK)), 4
    )
    return "c" + timestamp + _pad(_to_base36(count), 4) + _FINGERPRINT + random_block


def utcnow() -> datetime:
    """Fecha UTC sin zona y en milisegundos: así guarda Prisma los `DateTime` (timestamp(3))."""
    now = datetime.now(UTC).replace(tzinfo=None)
    return now.replace(microsecond=(now.microsecond // 1000) * 1000)


def iso(value: datetime | None) -> str | None:
    """Mismo formato que `Date.toISOString()` (milisegundos y `Z`)."""
    if value is None:
        return None
    if value.tzinfo is not None:
        value = value.astimezone(UTC).replace(tzinfo=None)
    return value.strftime("%Y-%m-%dT%H:%M:%S.") + f"{value.microsecond // 1000:03d}Z"


def iso_required(value: datetime) -> str:
    result = iso(value)
    assert result is not None
    return result
