import json
import re
from typing import Any

import httpx
import pytest

from app.core.config import get_settings
from app.core.errors import ApiError
from app.modules.whatsapp import twilio_client
from app.modules.whatsapp.conversation_handler import (
    detects_bot_choice,
    detects_human_request,
    extract_residual_after_bot_choice,
)
from app.modules.whatsapp.interactive import (
    WA_LIST_ITEM_DESCRIPTION,
    WA_LIST_ITEM_TITLE,
    SuggestedProduct,
    cart_action_buttons,
    format_money,
    parse_action_id,
    product_card_interactive,
    product_list_interactive,
    render_as_fallback_text,
    resolve_typed_action,
)
from app.modules.whatsapp.store_code import extract_store_code
from app.modules.whatsapp.twilio_content import TwilioContentService
from app.modules.whatsapp.webhook_service import assert_twilio_signature, is_only_greeting, twilio_signature

SHIRT: SuggestedProduct = {
    "id": "prod1",
    "name": "Camiseta Oversize Algodón Premium",
    "imageUrl": "https://cdn.example.com/shirt.jpg",
    "currency": "COP",
    "variants": [
        {"id": "var1", "name": "M", "price": 50000, "stock": 3},
        {"id": "var2", "name": "L", "price": 52000, "stock": 0},
    ],
}


def test_parse_action_id() -> None:
    assert parse_action_id("cart:checkout") == {"type": "cart_checkout"}
    assert parse_action_id("variant:abc123") == {"type": "variant", "variantId": "abc123"}
    assert parse_action_id("product:p1") == {"type": "product", "productId": "p1"}
    assert parse_action_id("variant:../x") is None
    assert parse_action_id("otra:cosa") is None
    assert parse_action_id(None) is None


def test_list_only_in_stock_and_within_limits() -> None:
    listing = product_list_interactive([SHIRT])
    assert listing is not None
    assert listing["kind"] == "list"
    assert listing["button"] == "Ver productos"
    assert len(listing["items"]) == 1
    item = listing["items"][0]
    assert item["id"] == "variant:var1"
    assert len(item["title"]) <= WA_LIST_ITEM_TITLE
    assert len(item["description"]) <= WA_LIST_ITEM_DESCRIPTION


def test_list_titles_single_vs_several_products() -> None:
    single = product_list_interactive([SHIRT])
    assert single is not None
    assert single["items"][0]["title"] == "M"
    assert re.match(
        r"^Camiseta Oversize Algodón Premium · .*3 disponibles$", single["items"][0]["description"]
    )

    cap: SuggestedProduct = {
        **SHIRT,
        "id": "prod2",
        "name": "Gorra",
        "variants": [{"id": "var3", "name": "Única", "price": 30000, "stock": 1}],
    }
    several = product_list_interactive([SHIRT, cap])
    assert several is not None
    first, second = several["items"]
    assert first["title"] == "Camiseta Oversize Algod…"
    assert first["description"].startswith("M · ")
    assert second["title"] == "Gorra"
    assert "Única" not in second["description"]


def test_list_caps_at_ten_and_none_without_stock() -> None:
    many: SuggestedProduct = {
        **SHIRT,
        "variants": [{"id": f"v{i}", "name": f"T{i}", "price": 1000, "stock": 1} for i in range(14)],
    }
    listing = product_list_interactive([many])
    assert listing is not None
    assert len(listing["items"]) == 10
    empty: SuggestedProduct = {**SHIRT, "variants": [{"id": "x", "name": "U", "price": 1, "stock": 0}]}
    assert product_list_interactive([empty]) is None


def test_card_asks_to_choose_with_several_variants() -> None:
    card = product_card_interactive(SHIRT)
    assert card is not None
    assert card["kind"] == "product_card"
    assert card["title"] == SHIRT["name"]
    assert card["actions"] == [
        {"id": "product:prod1", "title": "Elegir opción"},
        {"id": "cart:view", "title": "Ver carrito"},
    ]


def test_card_adds_directly_with_single_variant() -> None:
    card = product_card_interactive({**SHIRT, "variants": [SHIRT["variants"][0]]})
    assert card is not None
    assert card["actions"][0] == {"id": "variant:var1", "title": "Agregar al carrito"}


def test_fallback_text_numbers_options() -> None:
    text = render_as_fallback_text("Tu carrito: …", cart_action_buttons())
    assert "1. Confirmar pedido" in text
    assert "3. Vaciar carrito" in text
    assert (
        render_as_fallback_text(
            "Pedido listo",
            {"kind": "link_button", "title": "Pagar pedido", "url": "https://x.co/checkout/t1"},
        )
        == "Pedido listo\n\nPagar pedido: https://x.co/checkout/t1"
    )


def test_typed_number_or_title_resolves_action() -> None:
    interactive = cart_action_buttons()
    assert resolve_typed_action("1", interactive) == "cart:checkout"
    assert resolve_typed_action("  seguir comprando! ", interactive) == "cart:continue"
    assert resolve_typed_action("9", interactive) is None
    assert resolve_typed_action("quiero otra cosa", interactive) is None
    assert resolve_typed_action("1", None) is None


def test_format_money_matches_intl_es_co() -> None:
    assert format_money(50000, "COP") == "$\u00a050.000"
    assert format_money(1000, "COP") == "$\u00a01.000"
    assert format_money(1234.5, "USD") == "US$\u00a01.234,5"
    assert format_money(99.999, "EUR") == "EUR\u00a0100"


def test_detects_human_request() -> None:
    assert detects_human_request("quiero un asesor")
    assert detects_human_request("persona real por favor")
    assert detects_human_request("pásame con un asesor")
    assert not detects_human_request("hola jeans")


def test_detects_bot_choice() -> None:
    assert detects_bot_choice("bot")
    assert detects_bot_choice("un bot")
    assert detects_bot_choice("asistente virtual")
    assert detects_bot_choice("el mas rapido por favor")
    assert not detects_bot_choice("asesor")
    assert not detects_bot_choice("no quiero un asistente")
    assert not detects_bot_choice("no me comunico bien con las personas")


def test_extract_residual_after_bot_choice() -> None:
    assert extract_residual_after_bot_choice("bot") is None
    assert extract_residual_after_bot_choice("un bot por favor") is None
    assert (
        extract_residual_after_bot_choice("bot, disculpa que productos tienen disponibles")
        == "que productos tienen disponibles"
    )


def test_is_only_greeting() -> None:
    assert is_only_greeting("Hola!")
    assert is_only_greeting("buenos días")
    assert not is_only_greeting("hola, tienen jeans?")


def test_extract_store_code() -> None:
    assert extract_store_code("#tienda-uno hola") == ("tienda-uno", "hola")
    assert extract_store_code("hola") == (None, "hola")


class _FakeSession:
    def __init__(self, cached: str | None = None) -> None:
        self.cached = cached
        self.scalar_calls = 0
        self.executed: list[Any] = []

    async def scalar(self, _statement: Any) -> str | None:
        self.scalar_calls += 1
        return self.cached

    async def execute(self, statement: Any) -> None:
        self.executed.append(statement)

    async def commit(self) -> None:
        return None


@pytest.fixture
def content_api(monkeypatch: pytest.MonkeyPatch) -> list[httpx.Request]:
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"sid": "HX123"})

    real_client = httpx.AsyncClient

    def client_factory(*args: Any, **kwargs: Any) -> httpx.AsyncClient:
        return real_client(*args, transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", client_factory)
    monkeypatch.setattr(twilio_client, "credentials", lambda: ("AC1", "tok"))
    monkeypatch.setattr(get_settings(), "TWILIO_CHECKOUT_CONTENT_SID", None)
    return requests


def _content_service(session: _FakeSession) -> TwilioContentService:
    fake: Any = session
    return TwilioContentService(fake)


async def test_content_creates_quick_reply_once(content_api: list[httpx.Request]) -> None:
    session = _FakeSession()
    result = await _content_service(session).resolve(cart_action_buttons(), "Tu carrito: 1 producto")
    assert result is not None
    assert result.content_sid == "HX123"
    assert result.variables == {"1": "Tu carrito: 1 producto"}
    sent = json.loads(content_api[0].content)
    assert sent["types"]["twilio/quick-reply"] == {
        "body": "{{1}}",
        "actions": [
            {"title": "Confirmar pedido", "id": "cart:checkout"},
            {"title": "Seguir comprando", "id": "cart:continue"},
            {"title": "Vaciar carrito", "id": "cart:clear"},
        ],
    }
    assert len(session.executed) == 1


async def test_content_reuses_cache(content_api: list[httpx.Request]) -> None:
    result = await _content_service(_FakeSession(cached="HXcached")).resolve(
        cart_action_buttons(), "Otro cuerpo"
    )
    assert result is not None
    assert result.content_sid == "HXcached"
    assert not content_api


async def test_content_simulated_without_credentials(
    content_api: list[httpx.Request], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(twilio_client, "credentials", lambda: None)
    session = _FakeSession()
    result = await _content_service(session).resolve(cart_action_buttons(), "Hola")
    assert result is not None
    assert result.content_sid.startswith("HX_sim_")
    assert not content_api
    assert session.scalar_calls == 0


async def test_checkout_button_uses_configured_template(
    content_api: list[httpx.Request], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "TWILIO_CHECKOUT_CONTENT_SID", "HXpay")
    result = await _content_service(_FakeSession()).resolve(
        {"kind": "link_button", "title": "Pagar pedido", "url": "https://shop.co/checkout/tok_9?x=1"},
        "Pedido registrado",
    )
    assert result is not None
    assert (result.content_sid, result.variables) == ("HXpay", {"1": "tok_9"})


async def test_checkout_button_without_template_is_not_content(content_api: list[httpx.Request]) -> None:
    result = await _content_service(_FakeSession()).resolve(
        {"kind": "link_button", "title": "Pagar pedido", "url": "https://shop.co/checkout/tok_9"},
        "Pedido registrado",
    )
    assert result is None


@pytest.fixture
def signed_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "TWILIO_SKIP_SIGNATURE", False)
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "12345")
    monkeypatch.setattr(settings, "TWILIO_WEBHOOK_URL", "https://example.ngrok.app/api/v1/whatsapp/webhook")


def test_twilio_signature_validation(signed_settings: None) -> None:
    params = {"From": "whatsapp:+573001112233", "To": "whatsapp:+14155238886", "Body": "hola"}
    signature = twilio_signature("12345", "https://example.ngrok.app/api/v1/whatsapp/webhook", params)
    assert_twilio_signature(signature, params)

    with pytest.raises(ApiError) as invalid:
        assert_twilio_signature(signature, {**params, "Body": "otro"})
    assert (invalid.value.status_code, invalid.value.message) == (401, "Firma de webhook Twilio inválida")

    with pytest.raises(ApiError) as missing:
        assert_twilio_signature(None, params)
    assert missing.value.message == "Firma de webhook Twilio ausente"


def test_twilio_signature_requires_configuration(
    signed_settings: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "TWILIO_WEBHOOK_URL", None)
    with pytest.raises(ApiError) as error:
        assert_twilio_signature("x", {})
    assert error.value.message == "TWILIO_WEBHOOK_URL no configurado"
