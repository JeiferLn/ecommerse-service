import json
import re
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from app.core.config import get_settings
from app.core.errors import ApiError
from app.models import WhatsAppConnection, WhatsAppNumberRequest
from app.modules.platform.overrides import PlatformOverrides
from app.modules.whatsapp import connection_service, twilio_client
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
from app.modules.whatsapp.phone import build_wa_me_link
from app.modules.whatsapp.twilio_content import TwilioContentService
from app.modules.whatsapp.webhook_service import (
    InboundMessage,
    WhatsAppWebhookService,
    assert_twilio_signature,
    is_only_greeting,
    twilio_signature,
)

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

    async def real_credentials() -> tuple[str, str]:
        return ("AC1", "tok")

    monkeypatch.setattr(twilio_client, "credentials", real_credentials)
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
    async def no_credentials() -> None:
        return None

    monkeypatch.setattr(twilio_client, "credentials", no_credentials)
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


@pytest.fixture
def panel_overrides(monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    saved: dict[str, Any] = {"whatsapp_simulate_send": None}

    async def fake_overrides() -> PlatformOverrides:
        return PlatformOverrides(**saved)

    monkeypatch.setattr(twilio_client, "platform_overrides", fake_overrides)
    settings = get_settings()
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "AC1")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "tok")
    monkeypatch.setattr(settings, "WHATSAPP_SIMULATE_SEND", True)
    monkeypatch.setattr(settings, "TWILIO_TECH_PROVIDER_ENABLED", False)
    monkeypatch.setattr(settings, "META_APP_ID", None)
    monkeypatch.setattr(settings, "META_APP_SECRET", None)
    monkeypatch.setattr(settings, "META_EMBEDDED_SIGNUP_CONFIG_ID", None)
    return saved


async def test_simulate_send_from_panel_except_in_production(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    assert await twilio_client.credentials() is None
    panel_overrides["whatsapp_simulate_send"] = False
    assert await twilio_client.credentials() == ("AC1", "tok")
    monkeypatch.setattr(get_settings(), "NODE_ENV", "production")
    assert await twilio_client.credentials() is None
    assert twilio_client.resolve_simulate_send(False) == (True, "env")


def _connection(**overrides: Any) -> WhatsAppConnection:
    values: dict[str, Any] = {
        "id": "wc1",
        "company_id": "c1",
        "twilio_whatsapp_number": "+15554447456",
        "display_phone_number": "+573001112233",
        "mode": "dedicated",
        "connection_kind": "platform_number",
        "onboarding_status": "online",
        "onboarding_error": None,
        "waba_id": None,
        "meta_phone_number_id": None,
        "twilio_subaccount_sid": None,
        "twilio_sender_sid": None,
        "is_active": True,
        "created_at": datetime(2026, 10, 2, tzinfo=UTC),
        "updated_at": datetime(2026, 10, 2, tzinfo=UTC),
    }
    return WhatsAppConnection(**{**values, **overrides})


def test_connection_dto_online_links_to_sender() -> None:
    dto = connection_service.connection_dto(_connection())
    assert dto["twilioWhatsAppNumber"] == "+15554447456"
    assert dto["connectionKind"] == "platform_number"
    assert dto["onboardingStatus"] == "online"
    assert dto["waMeLink"] == "https://wa.me/15554447456"
    assert "storeCode" not in dto
    assert "mode" not in dto


def test_connection_dto_hides_link_until_online() -> None:
    dto = connection_service.connection_dto(
        _connection(onboarding_status="registering", twilio_whatsapp_number=None)
    )
    assert dto["waMeLink"] is None
    assert dto["onboardingStatus"] == "registering"


def test_wa_me_link_from_number() -> None:
    assert build_wa_me_link("whatsapp:+1 555 444 7456") == "https://wa.me/15554447456"
    assert build_wa_me_link("") is None
    assert build_wa_me_link(None) is None


class _ConnectionSession:
    def __init__(self, taken_by: str | None = None) -> None:
        self.taken_by = taken_by
        self.statements: list[Any] = []
        self.added: list[Any] = []
        self.executed: list[Any] = []
        self.commits = 0

    async def scalar(self, statement: Any) -> str | None:
        self.statements.append(statement)
        return self.taken_by

    async def execute(self, statement: Any) -> None:
        self.executed.append(statement)

    def add(self, instance: Any) -> None:
        self.added.append(instance)

    async def commit(self) -> None:
        self.commits += 1

    async def rollback(self) -> None:
        return None


def _connection_service(
    session: _ConnectionSession,
    monkeypatch: pytest.MonkeyPatch,
    existing: WhatsAppConnection | None = None,
    *,
    paid: bool = True,
) -> connection_service.WhatsAppConnectionService:
    fake: Any = session
    service = connection_service.WhatsAppConnectionService(fake)

    async def find(_company_id: str) -> WhatsAppConnection | None:
        return existing

    async def find_request(_company_id: str) -> None:
        return None

    async def prerequisites(*_args: Any, **_kwargs: Any) -> None:
        return None

    async def is_paid(_company_id: str) -> bool:
        return paid

    monkeypatch.setattr(service, "_find", find)
    monkeypatch.setattr(service, "_find_request", find_request)
    monkeypatch.setattr(service, "assert_whatsapp_prerequisites", prerequisites)
    monkeypatch.setattr(service, "_is_paid_plan", is_paid)
    return service


async def test_connect_start_requires_tech_provider(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch)
    with pytest.raises(ApiError) as error:
        await service.start_own_number_connect("c1")
    assert error.value.status_code == 400
    assert "Meta" in error.value.message
    assert not session.added


async def test_connect_start_when_tech_provider_ready(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "TWILIO_TECH_PROVIDER_ENABLED", True)
    monkeypatch.setattr(settings, "META_APP_ID", "app123")
    monkeypatch.setattr(settings, "META_APP_SECRET", "secret")
    monkeypatch.setattr(settings, "META_EMBEDDED_SIGNUP_CONFIG_ID", "cfg1")
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch)

    data = await service.start_own_number_connect("c1")

    [connection] = session.added
    assert isinstance(connection, WhatsAppConnection)
    assert connection.connection_kind == "own_number"
    assert connection.onboarding_status == "awaiting_meta"
    assert data["techProviderReady"] is True
    assert session.commits == 1


async def test_number_request_requires_paid_plan(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch, paid=False)
    with pytest.raises(ApiError) as error:
        await service.request_number("c1", "platform_number", None)
    assert error.value.status_code == 403
    assert not session.added


async def test_number_request_rejects_own_number_kind(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch)
    with pytest.raises(ApiError) as error:
        await service.request_number("c1", "own_number", "+573001112233")
    assert error.value.status_code == 400
    assert not session.added


async def test_platform_number_request(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch)
    dto = await service.request_number("c1", "platform_number", None)
    [request] = session.added
    assert isinstance(request, WhatsAppNumberRequest)
    assert (request.company_id, request.kind, request.phone_number) == ("c1", "platform_number", None)
    assert dto["kind"] == "platform_number"
    assert session.commits == 1


@pytest.fixture
def twilio_senders(panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    panel_overrides["whatsapp_simulate_send"] = False
    sender: dict[str, Any] = {"status": "ONLINE", "error": False, "lookups": []}

    async def find_status(number: str) -> str | None:
        sender["lookups"].append(number)
        if sender["error"]:
            raise RuntimeError("Twilio respondió 500")
        return sender["status"]

    monkeypatch.setattr(twilio_client, "find_whatsapp_sender_status", find_status)
    return sender


async def _assign(service: connection_service.WhatsAppConnectionService, number: str) -> dict[str, Any]:
    return await service.upsert(
        "c1", twilio_whatsapp_number=number, display_phone_number=None, is_active=True
    )


async def test_admin_upsert_marks_platform_number_online(
    twilio_senders: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch)
    dto = await _assign(service, "+15550001111")
    [connection] = session.added
    assert connection.connection_kind == "platform_number"
    assert connection.onboarding_status == "online"
    assert connection.twilio_whatsapp_number == "+15550001111"
    assert dto["waMeLink"] == "https://wa.me/15550001111"
    assert twilio_senders["lookups"] == ["+15550001111"]
    assert session.commits == 1


@pytest.mark.parametrize(
    ("status", "error", "message"),
    [
        (None, False, "Ese sender no existe en la cuenta de Twilio de la plataforma."),
        (
            "PENDING_VERIFICATION",
            False,
            "El sender aún no está activo en WhatsApp (estado: PENDING_VERIFICATION). "
            "Inténtalo cuando esté en línea.",
        ),
        ("ONLINE", True, "No pudimos verificar el sender con Twilio. Inténtalo de nuevo en unos minutos."),
    ],
)
async def test_admin_sender_must_exist_and_be_online(
    twilio_senders: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    status: str | None,
    error: bool,
    message: str,
) -> None:
    twilio_senders.update(status=status, error=error)
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch)
    with pytest.raises(ApiError) as raised:
        await _assign(service, "+15550001111")
    assert (raised.value.status_code, raised.value.message) == (400, message)
    assert not session.added


async def test_admin_sender_check_skipped_in_simulated_mode(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    lookups: list[str] = []

    async def find_status(number: str) -> str | None:
        lookups.append(number)
        return None

    monkeypatch.setattr(twilio_client, "find_whatsapp_sender_status", find_status)
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch)
    await _assign(service, "+15550001111")
    assert lookups == []
    assert session.commits == 1


class _InboundSession:
    def __init__(self, connection: WhatsAppConnection | None) -> None:
        self.connection = connection
        self.statements: list[Any] = []

    async def scalar(self, statement: Any) -> WhatsAppConnection | None:
        self.statements.append(statement)
        return self.connection


async def test_inbound_routes_by_sender(monkeypatch: pytest.MonkeyPatch) -> None:
    connection = _connection()
    session = _InboundSession(connection)
    fake: Any = session
    service = WhatsAppWebhookService(fake)
    ingested: list[tuple[WhatsAppConnection, InboundMessage]] = []

    async def ingest(target: WhatsAppConnection, message: InboundMessage) -> dict[str, str]:
        ingested.append((target, message))
        return {"conversationId": "conv1", "messageId": "m1"}

    monkeypatch.setattr(service, "_ingest_for_connection", ingest)
    message = InboundMessage(twilio_whatsapp_number="+15554447456", from_="+573005556677", text="Hola")

    assert await service.ingest_inbound(message) == {"conversationId": "conv1", "messageId": "m1"}
    assert ingested == [(connection, message)]
    sql = str(session.statements[0].compile(compile_kwargs={"literal_binds": True}))
    assert '"WhatsAppConnection"."twilioWhatsAppNumber" = \'+15554447456\'' in sql
    assert "online" in sql


async def test_inbound_to_unknown_sender_is_rejected() -> None:
    fake: Any = _InboundSession(None)
    with pytest.raises(ApiError) as error:
        await WhatsAppWebhookService(fake).ingest_inbound(
            InboundMessage(twilio_whatsapp_number="+19998887777", from_="+573005556677", text="Hola")
        )
    assert error.value.status_code == 400
