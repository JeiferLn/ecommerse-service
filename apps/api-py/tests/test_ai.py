from app.modules.ai.catalog_context import expand_synonyms, is_catalog_overview_question, js_string, tokenize
from app.modules.ai.providers import HANDOFF_MARKER, ChatMessage, MockChatProvider
from app.modules.ai.reply import (
    build_catalog_overview_fallback,
    build_knowledge_fallback,
    is_handoff,
    looks_like_internal_reasoning,
    sanitize_model_output,
    wants_product_images,
)
from app.modules.ai.sales_scope import (
    build_sales_scope_redirect,
    is_clearly_off_topic_sales_query,
    looks_like_off_topic_assistant_reply,
)
from app.modules.knowledge.retrieval import RetrievedChunk


def test_detects_programming_requests() -> None:
    assert is_clearly_off_topic_sales_query("Hazme un hola mundo en python")
    assert is_clearly_off_topic_sales_query("escríbeme un programa en javascript")
    assert is_clearly_off_topic_sales_query("print('hola')")


def test_does_not_block_sales_queries() -> None:
    assert not is_clearly_off_topic_sales_query("¿Cuánto cuesta la camiseta?")
    assert not is_clearly_off_topic_sales_query("tienen jeans?")
    assert not is_clearly_off_topic_sales_query("hola")
    assert not is_clearly_off_topic_sales_query("cuál es el código de descuento")


def test_detects_tutorial_replies() -> None:
    assert looks_like_off_topic_assistant_reply(
        "Claro! Aquí tienes:\n```python\nprint('Hola Mundo')\n```\n### ¿Cómo funciona?"
    )
    assert not looks_like_off_topic_assistant_reply("La camiseta cuesta $10. ¿Quieres la talla M?")


def test_scope_redirect() -> None:
    assert "Acme" in build_sales_scope_redirect("Acme")
    assert "catálogo" in build_sales_scope_redirect("Acme")


def test_sanitize_safety_tags() -> None:
    assert sanitize_model_output("User Safety: safe\nResponse Safety: safe") == ""
    assert sanitize_model_output("<think>hmm</think> Hola!") == "Hola!"


def test_internal_reasoning_detection() -> None:
    assert looks_like_internal_reasoning(
        "Wait, wait, hold on... there's a discrepancy according to the rules"
    )
    assert not looks_like_internal_reasoning("¡Claro! Tenemos gorras a $20.000.")


def test_handoff_detection() -> None:
    assert is_handoff(HANDOFF_MARKER)
    assert is_handoff("handoff")
    assert is_handoff("Te paso [handoff]")
    assert not is_handoff("Hola")


def test_fallbacks() -> None:
    chunk = RetrievedChunk("## Garantia\n**Cubre** defectos de fábrica.", "Garantía", "warranty", 0.1)
    assert (
        build_knowledge_fallback([chunk])
        == 'Según nuestra información de "Garantía": Garantia Cubre defectos de fábrica.'
    )
    block = "- Camiseta [Ropa] | Variantes: S\n- Gorra — linda | Variantes: U"
    assert build_catalog_overview_fallback(block, "qué artículos venden?") == (
        "Ahora mismo tenemos: Camiseta, Gorra. ¿Quieres precio o más detalles de alguno?"
    )
    assert build_catalog_overview_fallback(block, "hola") is None


def test_catalog_helpers() -> None:
    assert tokenize("¿Tienen JEANS azules?") == ["tienen", "jeans", "azules"]
    assert "pantalones" in expand_synonyms(["jeans"])
    assert is_catalog_overview_question("¿Qué productos tienen?")
    assert wants_product_images("muéstrame fotos")
    assert js_string(True) == "true"
    assert js_string(5.0) == "5"
    assert js_string({"a": 1}) == "[object Object]"


async def test_mock_provider_rules() -> None:
    provider = MockChatProvider()
    system = ChatMessage("system", "Catálogo:\n- Camiseta [Ropa] | Variantes: S\n- Gorra | Variantes: U")
    handoff = await provider.complete([system, ChatMessage("user", "quiero un asesor")])
    assert handoff.content == HANDOFF_MARKER
    greeting = await provider.complete([system, ChatMessage("user", "Hola!")])
    assert greeting.content.startswith("¡Hola!")
    overview = await provider.complete([system, ChatMessage("user", "qué productos tienen")])
    assert (
        overview.content == "Ahora mismo tenemos: Camiseta, Gorra. ¿Quieres precio o más detalles de alguno?"
    )
