import re

from app.modules.orders.order_intent import (
    bot_offered_add_to_cart,
    detects_affirmative_cart_confirm,
    resolve_order_chat_intent,
)
from app.modules.orders.service import parse_quantity_from_text, significant_tokens, tokens_overlap
from app.modules.orders.shipping_coverage import (
    cities_match,
    describe_shipping_coverage,
    resolve_country_code,
    validate_shipping_coverage,
)


def test_detects_view_cart() -> None:
    assert resolve_order_chat_intent("ver carrito") == "view_cart"
    assert resolve_order_chat_intent("mi carrito") == "view_cart"


def test_detects_clear_and_checkout() -> None:
    assert resolve_order_chat_intent("vaciar carrito") == "clear_cart"
    assert resolve_order_chat_intent("confirmar pedido") == "checkout"


def test_detects_add_to_cart_natural_language() -> None:
    for text in (
        "agregar camisa al carrito",
        "agregar gorras colombianas",
        "me gustaria pedir una",
        "quiero pedir una",
        "dame una",
        "quiero 2 por favor",
        "quiero dos",
    ):
        assert resolve_order_chat_intent(text) == "add_to_cart", text
    assert resolve_order_chat_intent("tienen articulos relacionados con colombia") is None
    assert resolve_order_chat_intent("hola") is None


def test_catalog_inquiries_are_not_add_to_cart() -> None:
    for text in (
        "Quiero una gorra, cuales tienes disponibles?",
        "quiero una gorra cuales tienes",
        "tienen gorras?",
        "me interesa una gorra",
        "busco gorras disponibles",
    ):
        assert resolve_order_chat_intent(text) is None, text


def test_affirmative_confirm_and_bot_offer() -> None:
    assert detects_affirmative_cart_confirm("si por favor")
    assert detects_affirmative_cart_confirm("si por favor, no comprare nada mas")
    assert detects_affirmative_cart_confirm("dale")
    assert not detects_affirmative_cart_confirm("confirmar pedido")
    assert bot_offered_add_to_cart(
        "Las gorras colombianas cuestan $30000. ¿Quieres que te agregue 2 al carrito?"
    )
    assert bot_offered_add_to_cart("Perfecto, agregaremos 2 gorras a tu carrito.")
    assert not bot_offered_add_to_cart("Hola, ¿en qué te ayudo?")


def test_parse_quantity_and_tokens() -> None:
    assert parse_quantity_from_text("quiero 3 gorras") == 3
    assert parse_quantity_from_text("gorra x2") == 2
    assert parse_quantity_from_text("quiero dos gorras") == 2
    assert parse_quantity_from_text("agregar gorra") == 1
    assert significant_tokens("quiero una gorra roja") == ["gorra", "roja"]
    assert tokens_overlap(["gorras"], ["gorra", "roja"]) == ["gorra"]


def test_cities_match_with_accents_and_aliases() -> None:
    assert cities_match("Bogotá", "bogota")
    assert cities_match("Santiago de Cali", "Cali")
    assert not cities_match("Bogotá", "Cali")


def test_resolve_country_code() -> None:
    assert resolve_country_code("co") == "CO"
    assert resolve_country_code("Colombia") == "CO"


def test_local_only_same_city() -> None:
    assert (
        validate_shipping_coverage(
            company_country_code="CO",
            company_city="Bogotá",
            shipping_scopes=["local"],
            destination_country="CO",
            destination_city="Bogotá",
        )
        is None
    )
    error = validate_shipping_coverage(
        company_country_code="CO",
        company_city="Bogotá",
        shipping_scopes=["local"],
        destination_country="Colombia",
        destination_city="Cali",
    )
    assert error and re.search(r"solo hace envíos locales en Bogotá", error, re.IGNORECASE)


def test_national_allows_other_city() -> None:
    assert (
        validate_shipping_coverage(
            company_country_code="CO",
            company_city="Bogotá",
            shipping_scopes=["local", "national"],
            destination_country="CO",
            destination_city="Cali",
        )
        is None
    )


def test_blocks_international_without_scope() -> None:
    error = validate_shipping_coverage(
        company_country_code="CO",
        company_city="Bogotá",
        shipping_scopes=["local", "national"],
        destination_country="MX",
        destination_city="CDMX",
    )
    assert error and "no hace envíos internacionales" in error


def test_describe_local_coverage() -> None:
    summary = describe_shipping_coverage(
        country_code="CO", shipping_region="Bogotá, D.C.", shipping_city="Bogotá", shipping_scopes=["local"]
    )
    assert "Solo envíos locales en Bogotá (Bogotá, D.C.)" in summary
