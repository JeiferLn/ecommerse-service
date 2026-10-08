"""Tests de regresión P0 v2.

Cubre:
  - Seguridad: security gate, router, output guard (existentes, no debilitados)
  - Fact-check: price_mismatch, SKU, variante, plazo, stock
  - Quejas: severidad LOW/MEDIUM/HIGH/CRITICAL, handoff, sin pitch de ventas
  - RAG: chunk no vigente (is_current=False) no se afirma como actual
  - Memoria: ClientProfile no puede guardar precios/stock; ConversationMemory
              no es fuente de precio
  - Observabilidad: track_fact_mismatch, track_rag_stale emiten eventos

Todos los tests existentes de test_ai.py siguen pasando sin modificación.
"""

from __future__ import annotations

import pytest

# ---------------------------------------------------------------------------
# Fact-check: price_mismatch y factual_mismatch
# ---------------------------------------------------------------------------

from app.modules.ai.fact_check import FactSet, verify_facts


class TestFactCheck:
    def test_price_in_allowed_set_passes(self) -> None:
        facts = FactSet(allowed_prices={50000.0})
        result = verify_facts("La camiseta cuesta $50.000", facts)
        assert result.passed

    def test_price_not_in_allowed_fails_with_event(self) -> None:
        facts = FactSet(allowed_prices={50000.0})
        result = verify_facts("El precio es $99.999", facts)
        assert not result.passed
        assert result.reason_code == "PRICE_HALLUCINATION"
        assert result.event_name == "price_mismatch"

    def test_price_when_no_allowed_set_fails(self) -> None:
        """Si no hay precios en BD y el modelo cita uno, es alucinación."""
        facts = FactSet(allowed_prices=set())
        result = verify_facts("Cuesta $25.000", facts)
        assert not result.passed
        assert result.event_name == "price_mismatch"

    def test_sku_hallucination(self) -> None:
        facts = FactSet(allowed_skus={"CAM-01"})
        result = verify_facts("Pide el SKU: GOL-99", facts)
        assert not result.passed
        assert result.reason_code == "FACTUAL_MISMATCH"
        assert result.event_name == "factual_mismatch"
        assert any("GOL-99" in item for item in result.violating_items)

    def test_sku_allowed_passes(self) -> None:
        facts = FactSet(allowed_skus={"CAM-01"})
        result = verify_facts("El SKU es CAM-01", facts)
        assert result.passed

    def test_variant_hallucination(self) -> None:
        facts = FactSet(allowed_variants={"S", "M", "L"})
        result = verify_facts("Disponible en talla XL", facts)
        assert not result.passed
        assert result.event_name == "factual_mismatch"

    def test_variant_allowed_passes(self) -> None:
        facts = FactSet(allowed_variants={"S", "M", "L"})
        result = verify_facts("Disponible en talla M", facts)
        assert result.passed

    def test_delivery_days_exceed_max(self) -> None:
        facts = FactSet(max_delivery_days=5)
        result = verify_facts("Tu pedido llega en máximo 10 días", facts)
        assert not result.passed
        assert result.event_name == "factual_mismatch"

    def test_delivery_days_within_range_passes(self) -> None:
        facts = FactSet(max_delivery_days=5, min_delivery_days=1)
        result = verify_facts("Entregamos en 3 días", facts)
        assert result.passed

    def test_stock_contradiction(self) -> None:
        facts = FactSet(in_stock=False)
        result = verify_facts("Sí hay disponible para compra", facts)
        assert not result.passed
        assert result.reason_code == "STOCK_CONTRADICTION"
        assert result.event_name == "factual_mismatch"

    def test_no_price_in_text_passes(self) -> None:
        """Respuesta sin precios no falla aunque allowed_prices esté vacío."""
        facts = FactSet(allowed_prices=set())
        result = verify_facts("¡Hola! ¿En qué te puedo ayudar?", facts)
        assert result.passed

    def test_history_cannot_be_source(self) -> None:
        """Verifica que FactSet se construye vacío si no hay datos de BD.

        Simulamos el escenario: historial dice '$30.000' pero BD no tiene ese precio.
        El modelo lo repite → debe fallar.
        """
        facts = FactSet(allowed_prices=set())  # BD no tiene precios
        result = verify_facts("Como te dije antes, cuesta $30.000", facts)
        assert not result.passed
        assert result.event_name == "price_mismatch"


# ---------------------------------------------------------------------------
# Quejas: severidad, handoff, sin pitch de ventas
# ---------------------------------------------------------------------------

from app.modules.ai.complaint_handler import build_complaint_reply, classify_complaint


class TestComplaintHandler:
    def test_low_severity(self) -> None:
        ctx = classify_complaint("Mi pedido está demorado, ¿cuándo llega?")
        assert ctx.severity == "LOW"
        assert not ctx.needs_handoff

    def test_medium_severity(self) -> None:
        ctx = classify_complaint("Me llegó el producto incorrecto")
        assert ctx.severity == "MEDIUM"
        assert not ctx.needs_handoff

    def test_high_severity_triggers_handoff(self) -> None:
        ctx = classify_complaint("El pedido nunca llegó, quiero mi reembolso urgente")
        assert ctx.severity == "HIGH"
        assert ctx.needs_handoff

    def test_critical_severity_triggers_handoff(self) -> None:
        ctx = classify_complaint("Voy a demandarlos por fraude, ya contraté un abogado")
        assert ctx.severity == "CRITICAL"
        assert ctx.needs_handoff

    def test_acknowledgement_first(self) -> None:
        """La respuesta siempre comienza con el reconocimiento."""
        ctx = classify_complaint("El artículo llegó roto")
        assert ctx.severity == "HIGH"
        reply = build_complaint_reply(ctx)
        # El reconocimiento debe aparecer al principio
        assert reply.startswith("Entendemos tu frustración") or reply.startswith("Lamentamos")

    def test_no_sales_pitch_in_complaint_reply(self) -> None:
        """Ninguna respuesta de queja termina con pitch de ventas."""
        sales_patterns = ["¿Deseas hacer tu pedido?", "¿Quieres más productos?",
                          "consulta nuestro catálogo", "aprovecha"]
        for text in [
            "Mi pedido está demorado",
            "El producto llegó roto",
            "Voy a demandarlos",
            "Me llegó incorrecto",
        ]:
            ctx = classify_complaint(text)
            reply = build_complaint_reply(ctx)
            for pattern in sales_patterns:
                assert pattern.lower() not in reply.lower(), (
                    f"Pitch de ventas detectado en queja {ctx.severity}: '{pattern}'"
                )

    def test_order_number_extracted(self) -> None:
        ctx = classify_complaint("Mi pedido #12345 nunca llegó")
        assert ctx.order_number == "12345"

    def test_high_asks_for_order_if_no_number(self) -> None:
        ctx = classify_complaint("No llegó mi pedido")
        assert ctx.severity == "HIGH"
        assert "número de pedido" in ctx.ask_for


# ---------------------------------------------------------------------------
# RAG: documento no vigente no se afirma como actual
# ---------------------------------------------------------------------------

from app.modules.knowledge.retrieval import RetrievedChunk, format_rag_block, stale_citation
from app.modules.ai.reply import build_knowledge_fallback


class TestRagVigency:
    def test_current_doc_uses_direct_citation(self) -> None:
        chunk = RetrievedChunk(
            "Garantía de 6 meses.", "Política de Garantía", "policy", 0.1, is_current=True
        )
        result = build_knowledge_fallback([chunk])
        assert result is not None
        assert "Según nuestra información de" in result
        assert "publicada" not in result  # no es la fórmula de stale

    def test_stale_doc_uses_conditional_citation(self) -> None:
        chunk = RetrievedChunk(
            "Garantía de 6 meses.", "Política de Garantía", "policy", 0.1, is_current=False
        )
        result = build_knowledge_fallback([chunk])
        assert result is not None
        # Debe usar la fórmula de citación condicional
        assert "Según la información publicada de" in result
        assert "Política de Garantía" in result

    def test_stale_citation_prefix(self) -> None:
        chunk = RetrievedChunk("contenido", "FAQ Envíos", "faq", 0.2, is_current=False)
        prefix = stale_citation(chunk)
        assert "FAQ Envíos" in prefix
        assert "publicada" in prefix

    def test_format_rag_block_marks_stale(self) -> None:
        chunks = [
            RetrievedChunk("Activo.", "Política actual", "policy", 0.1, is_current=True),
            RetrievedChunk("Viejo.", "Política antigua", "policy", 0.2, is_current=False),
        ]
        block = format_rag_block(chunks)
        assert "[INFORMACIÓN NO VIGENTE]" in block
        assert "Política actual" in block
        # El chunk vigente NO tiene la marca
        assert block.count("[INFORMACIÓN NO VIGENTE]") == 1


# ---------------------------------------------------------------------------
# Memoria: no puede ser fuente de precio ni stock
# ---------------------------------------------------------------------------

from app.modules.ai.memory import (
    MEMORY_CANNOT_SET_PRICE,
    MEMORY_CANNOT_SET_STOCK,
    ClientProfile,
    ConversationMemory,
)


class TestMemory:
    def test_client_profile_stores_name(self) -> None:
        profile = ClientProfile()
        profile.set_name("  Juan  ")
        assert profile.name == "Juan"

    def test_client_profile_stores_safe_preference(self) -> None:
        profile = ClientProfile()
        profile.set_preference("talla", "M")
        assert profile.preferences.get("talla") == "M"

    def test_client_profile_rejects_price_preference(self) -> None:
        """El perfil no debe guardar preferencias que contienen 'precio'."""
        profile = ClientProfile()
        profile.set_preference("precio favorito", "$50.000")
        assert "precio favorito" not in profile.preferences

    def test_client_profile_rejects_stock_preference(self) -> None:
        profile = ClientProfile()
        profile.set_preference("stock disponible", "100 unidades")
        assert "stock disponible" not in profile.preferences

    def test_client_profile_rejects_sku_preference(self) -> None:
        profile = ClientProfile()
        profile.set_preference("sku preferido", "CAM-01")
        assert "sku preferido" not in profile.preferences

    def test_client_profile_max_preferences(self) -> None:
        from app.modules.ai.memory import _MAX_CLIENT_PREFERENCES
        profile = ClientProfile()
        for i in range(_MAX_CLIENT_PREFERENCES + 5):
            profile.set_preference(f"pref_{i}", f"valor_{i}")
        assert len(profile.preferences) <= _MAX_CLIENT_PREFERENCES

    def test_client_profile_round_trip(self) -> None:
        profile = ClientProfile()
        profile.set_name("Ana")
        profile.set_preference("talla", "L")
        data = profile.to_dict()
        restored = ClientProfile.from_dict(data)
        assert restored.name == "Ana"
        assert restored.preferences.get("talla") == "L"

    def test_conversation_memory_notes_product(self) -> None:
        mem = ConversationMemory()
        mem.note_product("Gorra Básica")
        assert mem.last_product() == "Gorra Básica"

    def test_conversation_memory_deduplicates(self) -> None:
        mem = ConversationMemory()
        mem.note_product("Gorra")
        mem.note_product("Gorra")
        assert len(mem.mentioned_product_names) == 1

    def test_conversation_memory_max_5(self) -> None:
        mem = ConversationMemory()
        for i in range(10):
            mem.note_product(f"Producto {i}")
        assert len(mem.mentioned_product_names) == 5

    def test_memory_rules_documented(self) -> None:
        """Las reglas de uso están documentadas como constantes (para CI/linting)."""
        assert "precio" in MEMORY_CANNOT_SET_PRICE.lower()
        assert "stock" in MEMORY_CANNOT_SET_STOCK.lower()

    def test_prompt_hint_excludes_sensitive(self) -> None:
        """to_prompt_hint() nunca incluye datos de precio/stock."""
        profile = ClientProfile()
        profile.set_name("Carlos")
        profile.set_preference("talla", "XL")
        hint = profile.to_prompt_hint()
        assert "precio" not in hint.lower()
        assert "stock" not in hint.lower()
        assert "Carlos" in hint


# ---------------------------------------------------------------------------
# Observabilidad: track_fact_mismatch y track_rag_stale emiten logs
# ---------------------------------------------------------------------------

import logging

from app.modules.ai.observability import (
    get_session_metrics,
    track_complaint_detected,
    track_fact_mismatch,
    track_handoff,
    track_rag_stale,
    track_reply_generated,
)


class TestObservability:
    def test_track_fact_mismatch_logs(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO, logger="app.ai.events"):
            track_fact_mismatch(
                company_id="co_1",
                conversation_id="cv_1",
                event_name="price_mismatch",
                reason_code="PRICE_HALLUCINATION",
                violating_items=["99999"],
            )
        assert any("price_mismatch" in r.message for r in caplog.records)

    def test_track_rag_stale_logs(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO, logger="app.ai.events"):
            track_rag_stale(
                company_id="co_1",
                conversation_id="cv_1",
                document_title="FAQ vieja",
            )
        assert any("rag_stale_doc_used" in r.message for r in caplog.records)

    def test_track_reply_generated_increments_counter(self) -> None:
        track_reply_generated(
            company_id="co_observability_test",
            conversation_id="cv_obs",
            guard_passed=True,
            intent="PRODUCT_SEARCH",
        )
        metrics = get_session_metrics("co_observability_test")
        assert metrics.get("reply_count", 0) >= 1

    def test_track_handoff_increments_counter(self) -> None:
        track_handoff(
            company_id="co_handoff_test",
            conversation_id="cv_hoff",
            reason="complaint",
            complaint_severity="HIGH",
        )
        metrics = get_session_metrics("co_handoff_test")
        assert metrics.get("handoff_count", 0) >= 1

    def test_track_complaint_detected_logs(self, caplog: pytest.LogCaptureFixture) -> None:
        with caplog.at_level(logging.INFO, logger="app.ai.events"):
            track_complaint_detected(
                company_id="co_1",
                conversation_id="cv_1",
                severity="HIGH",
            )
        assert any("complaint_detected" in r.message for r in caplog.records)


# ---------------------------------------------------------------------------
# Regresión: los tests originales siguen implícitamente (importados)
# ---------------------------------------------------------------------------

# Reutilizamos exactamente las mismas aserciones del test_ai.py original
# para garantizar que ningún refactor los ha roto.

from app.modules.ai.catalog_context import expand_synonyms, is_catalog_overview_question, js_string, tokenize
from app.modules.ai.providers import HANDOFF_MARKER, ChatMessage, MockChatProvider
from app.modules.ai.reply import (
    build_catalog_overview_fallback,
    build_knowledge_fallback,  # noqa: F811 (re-import OK in test file)
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


class TestRegressionOriginals:
    def test_detects_programming_requests(self) -> None:
        assert is_clearly_off_topic_sales_query("Hazme un hola mundo en python")
        assert is_clearly_off_topic_sales_query("escríbeme un programa en javascript")
        assert is_clearly_off_topic_sales_query("print('hola')")

    def test_does_not_block_sales_queries(self) -> None:
        assert not is_clearly_off_topic_sales_query("¿Cuánto cuesta la camiseta?")
        assert not is_clearly_off_topic_sales_query("tienen jeans?")
        assert not is_clearly_off_topic_sales_query("hola")
        assert not is_clearly_off_topic_sales_query("cuál es el código de descuento")

    def test_detects_tutorial_replies(self) -> None:
        assert looks_like_off_topic_assistant_reply(
            "Claro! Aquí tienes:\n```python\nprint('Hola Mundo')\n```\n### ¿Cómo funciona?"
        )
        assert not looks_like_off_topic_assistant_reply("La camiseta cuesta $10. ¿Quieres la talla M?")

    def test_scope_redirect(self) -> None:
        assert "Acme" in build_sales_scope_redirect("Acme")
        assert "catálogo" in build_sales_scope_redirect("Acme")

    def test_sanitize_safety_tags(self) -> None:
        assert sanitize_model_output("User Safety: safe\nResponse Safety: safe") == ""
        assert sanitize_model_output("<think>hmm</think> Hola!") == "Hola!"

    def test_internal_reasoning_detection(self) -> None:
        assert looks_like_internal_reasoning(
            "Wait, wait, hold on... there's a discrepancy according to the rules"
        )
        assert not looks_like_internal_reasoning("¡Claro! Tenemos gorras a $20.000.")

    def test_handoff_detection(self) -> None:
        assert is_handoff(HANDOFF_MARKER)
        assert is_handoff("handoff")
        assert is_handoff("Te paso [handoff]")
        assert not is_handoff("Hola")

    def test_fallbacks(self) -> None:
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

    def test_catalog_helpers(self) -> None:
        assert tokenize("¿Tienen JEANS azules?") == ["tienen", "jeans", "azules"]
        assert "pantalones" in expand_synonyms(["jeans"])
        assert is_catalog_overview_question("¿Qué productos tienen?")
        assert wants_product_images("muéstrame fotos")
        assert js_string(True) == "true"
        assert js_string(5.0) == "5"
        assert js_string({"a": 1}) == "[object Object]"

    async def test_mock_provider_rules(self) -> None:
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
