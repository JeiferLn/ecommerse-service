from decimal import Decimal
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest

from app.core.config import get_settings
from app.core.errors import ApiError
from app.modules.payments.connection_service import MercadoPagoConnectionService, verify_state
from app.modules.payments.router import WebhookQuery, _resolve_resource_id
from app.modules.payments.webhook_service import amounts_match


@pytest.fixture
def oauth_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "MP_CLIENT_ID", "app-123")
    monkeypatch.setattr(settings, "MP_CLIENT_SECRET", "secret-456")
    monkeypatch.setattr(
        settings,
        "MP_REDIRECT_URI",
        "https://example.ngrok-free.app/api/v1/payments/mercadopago/oauth/callback",
    )


def _service() -> MercadoPagoConnectionService:
    session: Any = None
    return MercadoPagoConnectionService(session)


def test_oauth_start_requires_configuration(oauth_settings: None, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "MP_CLIENT_ID", None)
    with pytest.raises(ApiError) as error:
        _service().build_oauth_start_url("co-1", "user-1")
    assert error.value.status_code == 503


def test_oauth_start_builds_authorization_url(oauth_settings: None) -> None:
    url = _service().build_oauth_start_url("co-1", "user-1")["authorizationUrl"]
    assert url.startswith("https://auth.mercadopago.com/authorization?")
    query = parse_qs(urlparse(url).query)
    assert query["client_id"] == ["app-123"]
    payload = verify_state(query["state"][0])
    assert payload["companyId"] == "co-1"
    assert payload["userId"] == "user-1"


def test_oauth_start_requires_company(oauth_settings: None) -> None:
    with pytest.raises(ApiError):
        _service().build_oauth_start_url(None, "user-1")


def test_amounts_match_with_tolerance_and_currency() -> None:
    assert amounts_match(
        {"transaction_amount": 30000.5, "currency_id": "cop"}, total=Decimal("30000.50"), currency="COP"
    )
    assert amounts_match({"transaction_amount": 100.04}, total=Decimal("100"), currency="COP")
    assert not amounts_match({"transaction_amount": 100.1}, total=Decimal("100"), currency="COP")
    assert not amounts_match(
        {"transaction_amount": 100, "currency_id": "USD"}, total=Decimal("100"), currency="COP"
    )
    assert not amounts_match({}, total=Decimal("100"), currency="COP")


def test_resolve_resource_id_priority() -> None:
    assert _resolve_resource_id(WebhookQuery(data_id="q1", id="q2"), {"data": {"id": 9}}) == "q1"
    assert _resolve_resource_id(WebhookQuery(id="q2"), {"data": {"id": 9}}) == "q2"
    assert _resolve_resource_id(WebhookQuery(), {"data": {"id": 9}}) == "9"
    assert (
        _resolve_resource_id(WebhookQuery(), {"resource": "https://api.mercadopago.com/v1/payments/77"})
        == "77"
    )
    assert _resolve_resource_id(WebhookQuery(), {}) is None
