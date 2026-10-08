from typing import Any

import httpx
import pytest

from app.core.config import get_settings
from app.core.errors import ApiError
from app.modules.whatsapp import twilio_client


@pytest.fixture
def twilio_account(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "AC1")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "tok")
    monkeypatch.setattr(settings, "WHATSAPP_SIMULATE_SEND", True)


async def test_admin_test_sends_live_even_when_simulated(
    twilio_account: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["body"] = request.content.decode()
        return httpx.Response(201, json={"sid": "SM123"})

    real_client = httpx.AsyncClient

    def client_factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        return real_client(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client_factory)

    result = await twilio_client.send_admin_test_text(
        from_="+1 415 523 8886",
        to="+57 300 111 2233",
        text="Hola, prueba de Commerce AI",
    )

    assert result["provider"] == "twilio"
    assert result["messageId"] == "SM123"
    assert result["from"] == "+14155238886"
    assert "From=whatsapp%3A%2B14155238886" in captured["body"]
    assert "To=whatsapp%3A%2B573001112233" in captured["body"]
    assert captured["url"].endswith("/Accounts/AC1/Messages.json")


async def test_admin_test_surfaces_twilio_error(
    twilio_account: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(400, json={"message": "El destino no está habilitado", "code": 63007})

    real_client = httpx.AsyncClient

    def client_factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        return real_client(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client_factory)

    with pytest.raises(ApiError) as error:
        await twilio_client.send_admin_test_text(
            from_="+14155238886", to="+573001112233", text="Hola"
        )
    assert error.value.status_code == 400
    assert error.value.message == "El destino no está habilitado"
