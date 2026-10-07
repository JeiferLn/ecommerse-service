from app.core.config import get_settings
from app.modules.ai.intent_classifier import classify_intent
from app.modules.ai.intent_types import IntentType, RouteDecision


def route_intent(text: str) -> RouteDecision:
    """Enruta la intención determinando herramientas autorizadas y necesidad de LLM.
    
    Aplica umbrales estrictos de confianza:
    - >= AI_ROUTER_DIRECT_CONFIDENCE (default 0.90): ruta directa determinista si aplica.
    - AI_ROUTER_VALIDATED_CONFIDENCE .. DIRECT: ruta con validación.
    - < AI_ROUTER_VALIDATED_CONFIDENCE (default 0.78): UNKNOWN, requires_llm=False.
    """
    settings = get_settings()
    intent, confidence, reason, entities = classify_intent(text)

    direct_threshold = settings.AI_ROUTER_DIRECT_CONFIDENCE
    validated_threshold = settings.AI_ROUTER_VALIDATED_CONFIDENCE

    # Si la confianza es menor a 0.78, cae en UNKNOWN y no toca el LLM
    if confidence < validated_threshold and intent not in (IntentType.INJECTION, IntentType.OFF_TOPIC):
        return RouteDecision(
            intent=IntentType.UNKNOWN,
            confidence=confidence,
            entities=entities,
            allowed_tools=[],
            requires_llm=False,
            fallback_id="unknown",
            reason_code="CONFIDENCE_BELOW_THRESHOLD",
        )

    # 1. Seguridad: Inyección nunca toca LLM ni tools
    if intent == IntentType.INJECTION:
        return RouteDecision(
            intent=IntentType.INJECTION,
            confidence=confidence,
            entities=entities,
            allowed_tools=[],
            requires_llm=False,
            fallback_id="injection",
            reason_code=reason,
        )

    # 2. Fuera de tema: nunca toca LLM ni tools
    if intent == IntentType.OFF_TOPIC:
        return RouteDecision(
            intent=IntentType.OFF_TOPIC,
            confidence=confidence,
            entities=entities,
            allowed_tools=[],
            requires_llm=False,
            fallback_id="off_topic",
            reason_code=reason,
        )

    # 3. Saludos: respuesta determinista inmediata
    if intent == IntentType.GREETING:
        return RouteDecision(
            intent=IntentType.GREETING,
            confidence=confidence,
            entities=entities,
            allowed_tools=[],
            requires_llm=False,
            fallback_id="greeting",
            reason_code="GREETING_DETERMINISTIC",
        )

    # 4. Queja: plantilla de reconocimiento + handoff inmediato
    if intent == IntentType.COMPLAINT:
        return RouteDecision(
            intent=IntentType.COMPLAINT,
            confidence=confidence,
            entities=entities,
            allowed_tools=["handoff"],
            requires_llm=False,
            fallback_id="complaint",
            reason_code="COMPLAINT_HANDOFF_ROUTE",
        )

    # 5. Handoff explícito
    if intent == IntentType.HUMAN_HANDOFF:
        return RouteDecision(
            intent=IntentType.HUMAN_HANDOFF,
            confidence=confidence,
            entities=entities,
            allowed_tools=["handoff"],
            requires_llm=False,
            fallback_id="handoff",
            reason_code="USER_REQUESTED_HANDOFF",
        )

    # 6. Estado de pedido: tool de órdenes -> respuesta determinista
    if intent == IntentType.ORDER_STATUS:
        return RouteDecision(
            intent=IntentType.ORDER_STATUS,
            confidence=confidence,
            entities=entities,
            allowed_tools=["orders"],
            requires_llm=False,
            fallback_id="order_status",
            reason_code="ORDER_STATUS_DIRECT",
        )

    # 7. Envíos: tool de envíos -> respuesta determinista
    if intent == IntentType.SHIPPING:
        return RouteDecision(
            intent=IntentType.SHIPPING,
            confidence=confidence,
            entities=entities,
            allowed_tools=["shipping"],
            requires_llm=False,
            fallback_id="shipping",
            reason_code="SHIPPING_DIRECT",
        )

    # 8. Devoluciones: tool de knowledge -> respuesta determinista
    if intent == IntentType.RETURNS:
        return RouteDecision(
            intent=IntentType.RETURNS,
            confidence=confidence,
            entities=entities,
            allowed_tools=["knowledge"],
            requires_llm=False,
            fallback_id="returns",
            reason_code="RETURNS_DIRECT",
        )

    # 9. Consultas específicas de producto (precio, stock, variante)
    if intent in (IntentType.PRODUCT_PRICE, IntentType.PRODUCT_STOCK, IntentType.PRODUCT_VARIANT):
        # Si tiene alta confianza y entidad de producto clara -> direct deterministic template
        # requires_llm = False (tool -> BD -> plantilla)
        return RouteDecision(
            intent=intent,
            confidence=confidence,
            entities=entities,
            allowed_tools=["catalog"],
            requires_llm=False,
            fallback_id="catalog_single",
            reason_code="PRODUCT_SPECIFIC_TEMPLATE",
        )

    # 10. Comparativa de productos: LLM autorizado acotado a datos de la tool
    if intent == IntentType.PRODUCT_COMPARISON:
        return RouteDecision(
            intent=IntentType.PRODUCT_COMPARISON,
            confidence=confidence,
            entities=entities,
            allowed_tools=["catalog"],
            requires_llm=True,
            fallback_id="catalog_comparison",
            reason_code="PRODUCT_COMPARISON_LLM",
        )

    # 11. Búsqueda de productos en catálogo: LLM autorizado acotado a datos de la tool
    if intent == IntentType.PRODUCT_SEARCH:
        return RouteDecision(
            intent=IntentType.PRODUCT_SEARCH,
            confidence=confidence,
            entities=entities,
            allowed_tools=["catalog"],
            requires_llm=True,
            fallback_id="catalog_search",
            reason_code="PRODUCT_SEARCH_LLM",
        )

    # 12. FAQ de documentos
    if intent == IntentType.FAQ:
        return RouteDecision(
            intent=IntentType.FAQ,
            confidence=confidence,
            entities=entities,
            allowed_tools=["knowledge"],
            requires_llm=True,
            fallback_id="faq",
            reason_code="FAQ_KNOWLEDGE_LLM",
        )

    # 13. Ventas generales dentro del alcance
    if intent == IntentType.GENERAL_SALES:
        return RouteDecision(
            intent=IntentType.GENERAL_SALES,
            confidence=confidence,
            entities=entities,
            allowed_tools=["catalog"],
            requires_llm=True,
            fallback_id="general_sales",
            reason_code="GENERAL_SALES_LLM",
        )

    # Desconocido por defecto
    return RouteDecision(
        intent=IntentType.UNKNOWN,
        confidence=confidence,
        entities=entities,
        allowed_tools=[],
        requires_llm=False,
        fallback_id="unknown",
        reason_code="UNKNOWN_ROUTE",
    )
