import json
import logging
import time
from dataclasses import dataclass

import httpx

from app.core.config import get_settings
from app.modules.whatsapp.phone import to_twilio_whatsapp_address

logger = logging.getLogger("app.whatsapp.twilio")

TIMEOUT = httpx.Timeout(15.0)


@dataclass(frozen=True)
class SendResult:
    simulated: bool
    wamid: str | None


def credentials() -> tuple[str, str] | None:
    """Credenciales reales de la cuenta, o None si los envíos se simulan."""
    settings = get_settings()
    account_sid = (settings.TWILIO_ACCOUNT_SID or "").strip()
    auth_token = (settings.TWILIO_AUTH_TOKEN or "").strip()
    simulate = (
        settings.WHATSAPP_SIMULATE_SEND
        or not account_sid
        or not auth_token
        or account_sid.startswith(("dummy", "test-"))
        or auth_token.startswith(("dummy", "test-"))
    )
    return None if simulate else (account_sid, auth_token)


async def send_text(*, from_: str, to: str, text: str) -> SendResult:
    return await _dispatch(from_=from_, to=to, body=text)


async def send_media(*, from_: str, to: str, media_url: str, caption: str | None = None) -> SendResult:
    return await _dispatch(from_=from_, to=to, body=(caption or "").strip() or None, media_url=media_url)


async def send_content(
    *, from_: str, to: str, content_sid: str, variables: dict[str, str] | None = None
) -> SendResult:
    return await _dispatch(from_=from_, to=to, content_sid=content_sid, content_variables=variables)


async def _dispatch(
    *,
    from_: str,
    to: str,
    body: str | None = None,
    media_url: str | None = None,
    content_sid: str | None = None,
    content_variables: dict[str, str] | None = None,
) -> SendResult:
    account = credentials()
    if not account:
        wamid = f"SM_sim_{int(time.time() * 1000)}"
        logger.info(
            "Envío local simulado (sin Twilio) to %s from %s%s%s%s",
            to,
            from_,
            f" media={media_url}" if media_url else "",
            f" content={content_sid}" if content_sid else "",
            f": {body[:80]}" if body else "",
        )
        return SendResult(simulated=True, wamid=wamid)
    account_sid, auth_token = account

    form = {"From": to_twilio_whatsapp_address(from_), "To": to_twilio_whatsapp_address(to)}
    if body:
        form["Body"] = body
    if media_url:
        form["MediaUrl"] = media_url
    if content_sid:
        form["ContentSid"] = content_sid
        if content_variables:
            form["ContentVariables"] = json.dumps(
                content_variables, ensure_ascii=False, separators=(",", ":")
            )

    async with httpx.AsyncClient(timeout=TIMEOUT) as client:
        response = await client.post(
            f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json",
            data=form,
            auth=(account_sid, auth_token),
        )
    if response.status_code >= 400:
        logger.error("Twilio API error %s: %s", response.status_code, response.text)
        raise RuntimeError(f"Twilio respondió {response.status_code}")
    data = response.json()
    return SendResult(simulated=False, wamid=data.get("sid") if isinstance(data, dict) else None)
