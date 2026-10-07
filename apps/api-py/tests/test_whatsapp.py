import json
import re
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest

from app.core.config import get_settings
from app.core.errors import ApiError
from app.models import Company, WhatsAppConnection, WhatsAppNumberRequest
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
from app.modules.whatsapp.store_code import build_wa_me_link, extract_store_code
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
    saved: dict[str, Any] = {"shared_whatsapp_number": None, "whatsapp_simulate_send": None}

    async def fake_overrides() -> PlatformOverrides:
        return PlatformOverrides(**saved)

    monkeypatch.setattr(connection_service, "platform_overrides", fake_overrides)
    monkeypatch.setattr(twilio_client, "platform_overrides", fake_overrides)
    settings = get_settings()
    monkeypatch.setattr(settings, "TWILIO_SHARED_WHATSAPP_NUMBER", "whatsapp:+14155238886")
    monkeypatch.setattr(settings, "TWILIO_ACCOUNT_SID", "AC1")
    monkeypatch.setattr(settings, "TWILIO_AUTH_TOKEN", "tok")
    monkeypatch.setattr(settings, "WHATSAPP_SIMULATE_SEND", True)
    return saved


async def test_shared_number_prefers_panel_over_env(panel_overrides: dict[str, Any]) -> None:
    assert await connection_service.shared_number() == "+14155238886"
    panel_overrides["shared_whatsapp_number"] = "+15554447456"
    assert await connection_service.shared_number() == "+15554447456"


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
        "display_phone_number": None,
        "mode": "shared",
        "store_code": "sentix",
        "is_active": True,
        "created_at": datetime(2026, 10, 2, tzinfo=UTC),
        "updated_at": datetime(2026, 10, 2, tzinfo=UTC),
    }
    return WhatsAppConnection(**{**values, **overrides})


def test_shared_connection_hides_number_from_store(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(get_settings(), "FRONTEND_URL", "https://app.example.com/")

    store_view = connection_service.connection_dto(_connection(), "Sentix")
    admin_view = connection_service.connection_dto(_connection(), "Sentix", expose_shared_number=True)

    assert store_view["twilioWhatsAppNumber"] is None
    assert store_view["waMeLink"] == "https://app.example.com/w/sentix"
    assert "5554447456" not in json.dumps(store_view)
    assert admin_view["twilioWhatsAppNumber"] == "+15554447456"


def test_dedicated_connection_links_to_its_sender() -> None:
    dto = connection_service.connection_dto(
        _connection(mode="dedicated", store_code=None, display_phone_number="+573001112233"), "Sentix"
    )

    assert dto["twilioWhatsAppNumber"] == "+15554447456"
    assert dto["displayPhoneNumber"] == "+573001112233"
    assert dto["waMeLink"] == "https://wa.me/15554447456"


def test_store_link_redirects_to_current_shared_number() -> None:
    assert build_wa_me_link(number="+15554447456", store_code="sentix", store_name="Sentix") == (
        "https://wa.me/15554447456?text=Hola%20Sentix%20%23sentix"
    )


class _ConnectionSession:
    """Sesión mínima: `scalar` responde si el número ya lo usa otra empresa."""

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

    async def next_code(base: str) -> str:
        return base

    monkeypatch.setattr(service, "_find", find)
    monkeypatch.setattr(service, "_find_request", find_request)
    monkeypatch.setattr(service, "assert_whatsapp_prerequisites", prerequisites)
    monkeypatch.setattr(service, "_is_paid_plan", is_paid)
    monkeypatch.setattr(service, "_next_free_store_code", next_code)
    return service


async def test_activate_shared_saves_store_number(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(get_settings(), "FRONTEND_URL", "https://app.example.com")
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch)

    dto = await service.activate_shared("c1", "+57 300 111 2233")

    [connection] = session.added
    assert isinstance(connection, WhatsAppConnection)
    assert (
        connection.twilio_whatsapp_number,
        connection.display_phone_number,
        connection.mode,
        connection.store_code,
    ) == ("+14155238886", "+573001112233", "shared", "tienda")
    assert dto["twilioWhatsAppNumber"] is None
    assert dto["waMeLink"] == "https://app.example.com/w/tienda"
    assert session.commits == 1


@pytest.mark.parametrize(
    ("phone", "message"),
    [
        ("123", "Usa formato internacional con +: +573001112233"),
        ("+14155238886", "Ese es el número de la plataforma; escribe el WhatsApp de tu tienda."),
    ],
)
async def test_activate_shared_rejects_invalid_store_number(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch, phone: str, message: str
) -> None:
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch)
    with pytest.raises(ApiError) as error:
        await service.activate_shared("c1", phone)
    assert (error.value.status_code, error.value.message) == (400, message)
    assert not session.added


async def test_activate_shared_rejects_number_of_other_company(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    session = _ConnectionSession(taken_by="wc-other")
    service = _connection_service(session, monkeypatch)
    with pytest.raises(ApiError) as error:
        await service.activate_shared("c1", "+573001112233")
    assert (error.value.status_code, error.value.message) == (409, connection_service.NUMBER_TAKEN_MESSAGE)
    assert not session.added

    sql = str(session.statements[0].compile(compile_kwargs={"literal_binds": True}))
    assert '"WhatsAppConnection"."companyId" != \'c1\'' in sql
    assert '"WhatsAppConnection"."displayPhoneNumber" = \'+573001112233\'' in sql
    assert "\"WhatsAppConnection\".mode = 'dedicated'" in sql


async def test_activate_shared_returns_existing_connection(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    connection = _connection()
    connection.company = Company(id="c1", name="Sentix")
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch, existing=connection)
    dto = await service.activate_shared("c1", "+573001112233")
    assert dto["id"] == "wc1"
    assert not session.added


async def test_update_company_number(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    connection = _connection(display_phone_number="+573001112233")
    connection.company = Company(id="c1", name="Sentix")
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch, existing=connection)

    dto = await service.update_company_number("c1", "+57 300 999 8877")

    assert dto["displayPhoneNumber"] == "+573009998877"
    assert dto["storeCode"] == "sentix"
    assert session.commits == 1


async def test_update_company_number_requires_connection(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    service = _connection_service(_ConnectionSession(), monkeypatch)
    with pytest.raises(ApiError) as error:
        await service.update_company_number("c1", "+573001112233")
    assert error.value.status_code == 404


async def test_number_request_requires_paid_plan(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch, paid=False)
    with pytest.raises(ApiError) as error:
        await service.request_number("c1", "platform_number", None)
    assert error.value.status_code == 403
    assert not session.added


async def test_platform_number_request(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch)

    dto = await service.request_number("c1", "platform_number", "+573001112233")

    [request] = session.added
    assert isinstance(request, WhatsAppNumberRequest)
    assert (request.company_id, request.kind, request.phone_number) == ("c1", "platform_number", None)
    assert dto["kind"] == "platform_number"
    assert session.commits == 1


async def test_own_number_request_validates_phone(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    missing = _connection_service(_ConnectionSession(), monkeypatch)
    with pytest.raises(ApiError) as no_phone:
        await missing.request_number("c1", "own_number", None)
    assert no_phone.value.status_code == 400

    taken = _connection_service(_ConnectionSession(taken_by="wc-other"), monkeypatch)
    with pytest.raises(ApiError) as conflict:
        await taken.request_number("c1", "own_number", "+573001112233")
    assert conflict.value.status_code == 409

    session = _ConnectionSession()
    ok = _connection_service(session, monkeypatch)
    dto = await ok.request_number("c1", "own_number", "+57 300 111 2233")
    assert dto["phoneNumber"] == "+573001112233"
    assert session.added[0].phone_number == "+573001112233"


class _RequestedNumberSession(_ConnectionSession):
    """El número no está en ninguna conexión, pero otra empresa ya pidió conectarlo."""

    async def scalar(self, statement: Any) -> str | None:
        self.statements.append(statement)
        return "req-other" if len(self.statements) == 2 else None


async def test_store_number_taken_by_pending_request(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    session = _RequestedNumberSession()
    service = _connection_service(session, monkeypatch)
    with pytest.raises(ApiError) as error:
        await service.activate_shared("c1", "+573001112233")
    assert error.value.status_code == 409

    sql = str(session.statements[1].compile(compile_kwargs={"literal_binds": True}))
    assert '"WhatsAppNumberRequest"."companyId" != \'c1\'' in sql
    assert '"WhatsAppNumberRequest"."phoneNumber" = \'+573001112233\'' in sql


@pytest.fixture
def twilio_senders(panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch) -> dict[str, Any]:
    """Envíos reales con la Senders API simulada: `status` es lo que Twilio devuelve para el sender."""
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


async def test_admin_assigns_sender_replacing_shared_connection(
    twilio_senders: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    connection = _connection(display_phone_number="+573001112233")
    session = _ConnectionSession()
    service = _connection_service(session, monkeypatch, existing=connection)

    dto = await _assign(service, "+15550001111")

    assert twilio_senders["lookups"] == ["+15550001111"]
    assert (connection.mode, connection.store_code, connection.twilio_whatsapp_number) == (
        "dedicated",
        None,
        "+15550001111",
    )
    assert dto["waMeLink"] == "https://wa.me/15550001111"
    assert len(session.executed) == 2
    assert session.commits == 1


async def test_admin_cannot_assign_shared_number(
    panel_overrides: dict[str, Any], monkeypatch: pytest.MonkeyPatch
) -> None:
    service = _connection_service(_ConnectionSession(), monkeypatch)
    with pytest.raises(ApiError) as error:
        await _assign(service, "+14155238886")
    assert error.value.status_code == 400


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
