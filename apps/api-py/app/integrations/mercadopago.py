"""Cliente REST de Mercado Pago."""

from typing import Any

import httpx

from app.core.config import get_settings

MP_API = "https://api.mercadopago.com"
TIMEOUT = httpx.Timeout(10.0)


class MercadoPagoError(Exception):
    def __init__(self, message: str, status: int | None = None, body: Any = None) -> None:
        super().__init__(message)
        self.status = status
        self.body = body


def _error_message(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return response.text or f"HTTP {response.status_code}"
    if isinstance(body, dict):
        for key in ("message", "error_description", "error"):
            value = body.get(key)
            if isinstance(value, str) and value:
                return value
    return f"HTTP {response.status_code}"


async def mp_request(
    method: str,
    path: str,
    *,
    access_token: str | None = None,
    json: Any = None,
    data: dict[str, str] | None = None,
    params: dict[str, Any] | None = None,
) -> Any:
    headers: dict[str, str] = {}
    if access_token is not None:
        token = access_token.strip()
        if not token:
            raise MercadoPagoError("Access Token de Mercado Pago vacío")
        headers["Authorization"] = f"Bearer {token}"
    async with httpx.AsyncClient(base_url=MP_API, timeout=TIMEOUT) as client:
        response = await client.request(method, path, headers=headers, json=json, data=data, params=params)
    if response.status_code >= 400:
        try:
            body = response.json()
        except ValueError:
            body = response.text
        raise MercadoPagoError(_error_message(response), response.status_code, body)
    if not response.content:
        return {}
    return response.json()


def webhook_notification_url() -> str | None:
    """URL que Mercado Pago llamará al cambiar el estado del pago."""
    settings = get_settings()
    explicit = (settings.MP_WEBHOOK_URL or "").strip()
    if explicit:
        return explicit.rstrip("/")
    api_public = (settings.API_PUBLIC_URL or "").strip()
    if not api_public:
        return None
    return f"{api_public.rstrip('/')}/api/v1/payments/mercadopago/webhook"


async def create_preapproval(
    access_token: str,
    *,
    reason: str,
    payer_email: str,
    external_reference: str,
    back_url: str,
    transaction_amount: int,
    currency_id: str,
    frequency: int,
    frequency_type: str,
    notification_url: str | None,
) -> dict[str, Any]:
    body: dict[str, Any] = {
        "reason": reason,
        "payer_email": payer_email,
        "external_reference": external_reference,
        "back_url": back_url,
        "auto_recurring": {
            "frequency": frequency,
            "frequency_type": frequency_type,
            "transaction_amount": transaction_amount,
            "currency_id": currency_id,
        },
        "status": "pending",
    }
    if notification_url:
        body["notification_url"] = notification_url
    return await mp_request("POST", "/preapproval", access_token=access_token, json=body)


async def get_preapproval(access_token: str, preapproval_id: str) -> dict[str, Any]:
    return await mp_request("GET", f"/preapproval/{preapproval_id}", access_token=access_token)


async def cancel_preapproval(access_token: str, preapproval_id: str) -> None:
    await mp_request(
        "PUT", f"/preapproval/{preapproval_id}", access_token=access_token, json={"status": "cancelled"}
    )


async def create_preference(access_token: str, body: dict[str, Any]) -> dict[str, Any]:
    return await mp_request("POST", "/checkout/preferences", access_token=access_token, json=body)


async def get_payment(access_token: str, payment_id: str | int) -> dict[str, Any]:
    return await mp_request("GET", f"/v1/payments/{payment_id}", access_token=access_token)
