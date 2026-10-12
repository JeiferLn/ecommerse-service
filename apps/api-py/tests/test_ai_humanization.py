"""Tests para la humanización del asistente de IA.

Verifica:
  1. Extracción de nombre solo cuando el cliente lo declara explícitamente y uso moderado.
  2. Variantes de mensajes fijos deterministas (hash(conversation_id + counter), 3 a 5 variantes).
  3. Persona por empresa (nombre, tono casual/neutral/formal, estilo warm/professional/friendly, emojis).
  4. Honestidad ante preguntas de identidad ("¿eres un bot?") sin fingir ser humano.
  5. Referencia breve al último producto para preguntas de seguimiento.
  6. Splitting semántico (<300, 300-700, >700) sin cortar precios, SKUs, pedidos ni URLs.
  7. Criterio fundamental: una respuesta humana que contradiga la BD se bloquea en fact-check.
"""

from __future__ import annotations

from app.modules.ai.complaint_handler import classify_complaint
from app.modules.ai.fact_check import FactSet, verify_facts
from app.modules.ai.humanization import (
    BOT_IDENTITY_VARIANTS,
    GREETING_VARIANTS,
    HANDOFF_VARIANTS,
    UNAVAILABLE_VARIANTS,
    UNKNOWN_VARIANTS,
    extract_client_name,
    is_bot_identity_inquiry,
    pick_variant,
    render_bot_identity,
    split_ai_message,
)
from app.modules.ai.persona import AssistantPersona
from app.modules.ai.prompts import build_sales_assistant_system_prompt
from app.modules.ai.template_replies import (
    render_complaint,
    render_greeting,
    render_handoff,
)


class TestClientNameExtraction:
    def test_extracts_name_soy(self) -> None:
        assert extract_client_name("Hola, soy Laura") == "Laura"
        assert extract_client_name("Buenos días, soy Andres") == "Andres"

    def test_extracts_name_me_llamo(self) -> None:
        assert extract_client_name("Me llamo Carlos y busco una camisa") == "Carlos"

    def test_extracts_name_mi_nombre_es(self) -> None:
        assert extract_client_name("Mi nombre es Sofia") == "Sofia"

    def test_ignores_common_non_names(self) -> None:
        assert extract_client_name("Soy un cliente nuevo") is None
        assert extract_client_name("Soy de Bogota") is None
        assert extract_client_name("Soy nuevo por aca") is None
        assert extract_client_name("Soy cliente frecuente") is None

    def test_prompt_includes_name_and_use_little_rule(self) -> None:
        prompt = build_sales_assistant_system_prompt(
            company_name="Moda Express",
            catalog_block="Pantalón $50.000",
            categories_summary="Ropa",
            total_active_count=1,
            commerce_block="",
            commerce_configured=False,
            rag_block="",
            client_name="Laura",
        )
        assert "El cliente se llama Laura" in prompt
        assert "ÚSALO POCO" in prompt


class TestDeterministicVariants:
    def test_reproducibility_same_seed(self) -> None:
        conv_id = "conv_12345"
        counter = 2
        var1 = pick_variant(GREETING_VARIANTS, conv_id, counter)
        var2 = pick_variant(GREETING_VARIANTS, conv_id, counter)
        assert var1 == var2

    def test_counter_rotates_deterministically(self) -> None:
        conv_id = "conv_test_session"
        seen: set[str] = set()
        for c in range(10):
            var = pick_variant(GREETING_VARIANTS, conv_id, c)
            seen.add(var)
        # Debe haber cubierto más de una variante al iterar
        assert len(seen) > 1

    def test_variant_lists_have_3_to_5_elements(self) -> None:
        for name, variants in [
            ("GREETING", GREETING_VARIANTS),
            ("HANDOFF", HANDOFF_VARIANTS),
            ("UNKNOWN", UNKNOWN_VARIANTS),
            ("UNAVAILABLE", UNAVAILABLE_VARIANTS),
            ("BOT_IDENTITY", BOT_IDENTITY_VARIANTS),
        ]:
            assert 3 <= len(variants) <= 5, f"{name} tiene {len(variants)} variantes (debe ser 3 a 5)"

    def test_template_replies_use_variants(self) -> None:
        g1 = render_greeting("Mi Tienda", conversation_id="c1", message_counter=0)
        g2 = render_greeting("Mi Tienda", conversation_id="c1", message_counter=1)
        assert "Mi Tienda" in g1
        assert "Mi Tienda" in g2

        h1 = render_handoff(conversation_id="c1", message_counter=0)
        assert "asesor" in h1.lower() or "equipo" in h1.lower()


class TestAssistantPersona:
    def test_default_persona(self) -> None:
        persona = AssistantPersona()
        assert persona.assistant_name is None
        assert persona.assistant_tone == "neutral"
        assert persona.assistant_style == "friendly"
        assert persona.assistant_emoji_level == "none"

    def test_casual_tone_snippet(self) -> None:
        persona = AssistantPersona(assistant_tone="casual", assistant_style="friendly")
        snippet = persona.to_system_prompt_snippet("Urban Chic")
        assert "casual" in snippet
        assert "tuteo" in snippet

    def test_formal_tone_snippet(self) -> None:
        persona = AssistantPersona(assistant_tone="formal", assistant_style="professional")
        snippet = persona.to_system_prompt_snippet("Boutique Elegance")
        assert "formal" in snippet
        assert "trato de usted" in snippet

    def test_named_persona(self) -> None:
        persona = AssistantPersona(assistant_name="Valeria", assistant_tone="neutral")
        snippet = persona.to_system_prompt_snippet("Tienda ABC")
        assert "Te llamas Valeria" in snippet

    def test_emoji_levels(self) -> None:
        p_none = AssistantPersona(assistant_emoji_level="none")
        assert "NINGUNO" in p_none.to_system_prompt_snippet("T")

        p_expressive = AssistantPersona(assistant_emoji_level="expressive")
        assert "expresivo" in p_expressive.to_system_prompt_snippet("T")


class TestBotIdentityInquiry:
    def test_detects_bot_questions(self) -> None:
        assert is_bot_identity_inquiry("¿Eres un bot?")
        assert is_bot_identity_inquiry("¿eres un robot o una persona?")
        assert is_bot_identity_inquiry("hablo con una persona real o con un bot?")
        assert is_bot_identity_inquiry("eres humano?")

    def test_does_not_trigger_on_normal_questions(self) -> None:
        assert not is_bot_identity_inquiry("¿Qué precio tiene el pantalón?")
        assert not is_bot_identity_inquiry("Quiero hacer un pedido")

    def test_honest_reply_never_fakes_human(self) -> None:
        reply = render_bot_identity("Calzados Reyes")
        assert "asistente virtual" in reply.lower() or "bot" in reply.lower() or "inteligencia artificial" in reply.lower()
        # No debe afirmar ser una persona de carne y hueso
        assert "soy una persona real" not in reply.lower()
        assert "asesor" in reply.lower()

    def test_named_bot_identifies_with_name(self) -> None:
        persona = AssistantPersona(assistant_name="Sofía")
        reply = render_bot_identity("Calzados Reyes", persona=persona)
        assert "Sofía" in reply


class TestLastProductFollowUp:
    def test_prompt_includes_last_product_reference(self) -> None:
        prompt = build_sales_assistant_system_prompt(
            company_name="Sport Shop",
            catalog_block="Zapatillas $120.000",
            categories_summary="Calzado",
            total_active_count=1,
            commerce_block="",
            commerce_configured=False,
            rag_block="",
            last_product_name="Zapatillas Runner",
        )
        assert "Último producto consultado" in prompt
        assert "Zapatillas Runner" in prompt


class TestMessageSplitting:
    def test_short_message_remains_single(self) -> None:
        short = "¡Hola! Con gusto te ayudo con las tallas disponibles de nuestra camiseta básica."
        assert len(short) < 300
        result = split_ai_message(short)
        assert len(result) == 1
        assert result[0] == short

    def test_medium_message_300_to_700_splits_if_paragraphs(self) -> None:
        para1 = "¡Hola! Qué gusto saludarte en nuestra tienda oficial. Tenemos disponible la chaqueta de cuero en color negro y café con envío inmediato a todo el país."
        para2 = "El precio de lanzamiento incluye transporte asegurado hasta tu domicilio en cualquier ciudad principal del territorio. ¿Te gustaría apartar tu talla ahora mismo?"
        full = f"{para1}\n\n{para2}"
        assert 300 <= len(full) <= 700
        result = split_ai_message(full)
        assert len(result) == 2
        assert result[0] == para1
        assert result[1] == para2

    def test_long_message_splits_within_max_chars(self) -> None:
        # Texto largo de más de 800 caracteres
        paragraph = (
            "Contamos con una amplia variedad de artículos en nuestro catálogo para entrega inmediata. "
            "Todas nuestras prendas están fabricadas con materiales de primera calidad y garantía directa. "
        )
        long_text = "\n\n".join([f"Párrafo {i}: {paragraph}" for i in range(1, 6)])
        assert len(long_text) > 700
        result = split_ai_message(long_text, max_chars=700)
        assert len(result) >= 2
        for part in result:
            assert len(part) <= 700

    def test_never_cuts_price(self) -> None:
        # Generar texto de ~750 caracteres donde un precio está exactamente cerca del corte de 700
        prefix = "Detalle de nuestra colección: " + ("Muy buena calidad en cada prenda. " * 22)
        price_tag = "El valor promocional es $185.000 COP con descuento especial."
        suffix = " Aprovecha esta oferta antes de que finalice la temporada."
        full = f"{prefix}\n\n{price_tag}\n\n{suffix}"
        result = split_ai_message(full, max_chars=700)

        # Verificar que el precio completo "$185.000 COP" esté intacto en alguna de las partes
        full_joined = " ".join(result)
        assert "$185.000 COP" in full_joined
        for part in result:
            # Nunca debe quedar un fragmento roto como "$185." o "000 COP"
            if "$185" in part:
                assert "$185.000" in part

    def test_never_cuts_sku(self) -> None:
        prefix = "Catálogo de repuestos: " + ("Piezas originales certificadas por fábrica. " * 20)
        sku_tag = "Para pedir utiliza el SKU: CAM-9945 en el sistema."
        suffix = " Un asesor te confirmará la disponibilidad del pedido."
        full = f"{prefix}\n\n{sku_tag}\n\n{suffix}"
        result = split_ai_message(full, max_chars=700)

        full_joined = " ".join(result)
        assert "SKU: CAM-9945" in full_joined or "CAM-9945" in full_joined
        for part in result:
            if "SKU" in part and "CAM" in part:
                assert "CAM-9945" in part

    def test_never_cuts_order_number(self) -> None:
        prefix = "Actualización de envíos: " + ("Información de seguimiento actualizada hoy. " * 20)
        order_tag = "Tu envío corresponde al pedido #987654321 con transportadora nacional."
        suffix = " Llegará en los próximos días hábiles a tu domicilio."
        full = f"{prefix}\n\n{order_tag}\n\n{suffix}"
        result = split_ai_message(full, max_chars=700)

        for part in result:
            if "#987654" in part:
                assert "#987654321" in part

    def test_never_cuts_url(self) -> None:
        prefix = "Información de compra: " + ("Revisa todos los términos en nuestro sitio oficial. " * 18)
        url_tag = "Puedes ver el seguimiento en https://tiendaxyz.com/orders/track/998877665544."
        suffix = " Gracias por confiar en nuestra tienda."
        full = f"{prefix}\n\n{url_tag}\n\n{suffix}"
        result = split_ai_message(full, max_chars=700)

        found_url = False
        for part in result:
            if "https://tiendaxyz.com" in part:
                assert "https://tiendaxyz.com/orders/track/998877665544" in part
                found_url = True
        assert found_url


class TestComplaintEmpathyWithoutSalesPitch:
    def test_critical_complaint_acknowledges_without_sales_pitch(self) -> None:
        reply = render_complaint(
            customer_text="Mi pedido nunca llegó y es un fraude, exijo mi dinero ya",
            company_name="ElectroTech",
        )
        lower = reply.lower()
        # Debe reconocer el problema
        assert "lamentamos" in lower or "sentimos" in lower or "comprendemos" in lower
        # NUNCA pitch de ventas
        assert "comprar" not in lower
        assert "¿deseas llevar" not in lower
        assert "oferta" not in lower
        assert "catálogo" not in lower
        # Debe pasar a asesor / handoff
        assert "asesor" in lower

    def test_high_severity_handoff_with_context(self) -> None:
        ctx = classify_complaint("El producto me llegó completamente roto y dañado")
        assert ctx.severity == "HIGH"
        assert ctx.needs_handoff


class TestFactCheckOverridesHumanizedReply:
    def test_humanized_reply_blocked_if_price_mismatch(self) -> None:
        """Una respuesta humana y cordial NO puede alucinar precios no autorizados."""
        facts = FactSet(allowed_prices={50000.0})
        # El bot saluda con cordialidad y nombre pero cita un precio que no existe en BD
        humanized_text = "¡Hola Laura, qué alegría saludarte! Con mucho gusto te cuento que la chaqueta vale $20.000 pesos."
        result = verify_facts(humanized_text, facts)
        assert not result.passed
        assert result.event_name == "price_mismatch"

    def test_humanized_reply_blocked_if_stock_contradiction(self) -> None:
        """Una respuesta cordial NO puede afirmar stock cuando en BD está agotado."""
        facts = FactSet(in_stock=False)
        humanized_text = "¡Hola! Con mucho gusto te confirmo que sí tenemos disponible para compra inmediata."
        result = verify_facts(humanized_text, facts)
        assert not result.passed
        assert result.reason_code == "STOCK_CONTRADICTION"
        assert result.event_name == "factual_mismatch"
