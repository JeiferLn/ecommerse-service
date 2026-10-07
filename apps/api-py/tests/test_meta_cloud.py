import json
from typing import Any

import httpx
import pytest

from app.core.config import get_settings
from app.core.errors import ApiError
from app.modules.whatsapp import meta_cloud


@pytest.fixture
def cloud_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "META_WA_ACCESS_TOKEN", "tok_test")
    monkeypatch.setattr(settings, "META_WA_PHONE_NUMBER_ID", "123456789")
    monkeypatch.setattr(settings, "META_WA_DISPLAY_PHONE_NUMBER", "+15551234567")
    monkeypatch.setattr(settings, "META_GRAPH_API_VERSION", "v21.0")


async def test_send_text_calls_graph_api(
    cloud_settings: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    captured: dict[str, Any] = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured["url"] = str(request.url)
        captured["auth"] = request.headers.get("Authorization")
        captured["payload"] = json.loads(request.content.decode())
        return httpx.Response(200, json={"messages": [{"id": "wamid.ABC"}]})

    real_client = httpx.AsyncClient

    def client_factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        return real_client(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client_factory)

    result = await meta_cloud.send_text(
        to="+57 300 111 2233",
        text="Hola, prueba de Meta",
        from_display="+15551234567",
    )

    assert result["messageId"] == "wamid.ABC"
    assert result["to"] == "+573001112233"
    assert result["from"] == "+15551234567"
    assert captured["url"].endswith("/v21.0/123456789/messages")
    assert captured["auth"] == "Bearer tok_test"
    assert captured["payload"]["to"] == "573001112233"
    assert captured["payload"]["text"]["body"] == "Hola, prueba de Meta"


async def test_send_rejects_wrong_from_display(cloud_settings: None) -> None:
    with pytest.raises(ApiError) as error:
        await meta_cloud.send_text(
            to="+573001112233",
            text="Hola",
            from_display="+19998887777",
        )
    assert error.value.status_code == 400


async def test_send_requires_credentials(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "META_WA_ACCESS_TOKEN", None)
    monkeypatch.setattr(settings, "META_WA_PHONE_NUMBER_ID", None)
    with pytest.raises(ApiError) as error:
        await meta_cloud.send_text(to="+573001112233", text="Hola", from_display="+15551234567")
    assert error.value.status_code == 503
