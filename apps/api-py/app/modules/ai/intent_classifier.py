import re
from typing import Any

from app.core.text import strip_accents
from app.modules.ai.intent_types import IntentType
from app.modules.ai.sales_scope import is_clearly_off_topic_sales_query
from app.modules.ai.security_gate import check_security_gate

_A = re.IGNORECASE | re.ASCII

COMPLAINT_RE = re.compile(
    r"\b(estoy\s+molesto|estoy\s+enojad[oa]|estoy\s+furios[oa]|pesimo\s+servicio|terrible|estafa|ladrones|"
    r"nunca\s+llego|nunca\s+me\s+llego|mala\s+atencion|queja|reclamo|inaceptable|denunciar|demanda)\b",
    _A,
)

HANDOFF_RE = re.compile(
    r"\b(asesor|humano|persona|operador|agente|alguien\s+real|hablar\s+con\s+un\s+humano|atencion\s+humana|"
    r"quiero\s+un\s+asesor|pasame\s+con\s+alguien|atencion\s+al\s+cliente)\b",
    _A,
)

ORDER_STATUS_RE = re.compile(
    r"\b(donde\s+esta\s+mi\s+pedido|estado\s+de\s+(mi\s+)?pedido|rastre(ar|o)|seguimiento(\s+del\s+pedido)?|"
    r"mi\s+orden|guia\s+de\s+envio|numero\s+de\s+guia|cuando\s+llega\s+mi\s+pedido|mi\s+paquete)\b",
    _A,
)

RETURNS_RE = re.compile(
    r"\b(quiero\s+devolverlo|quiero\s+devolverla|quiero\s+devolver|devolv(er|erlo|erla|i)|devolucion|devoluciones|"
    r"cambio\s+de\s+producto|cambiar(lo|la)?|reembolso|garantia|defectuoso|danad[oa]|roto)\b",
    _A,
)

SHIPPING_RE = re.compile(
    r"\b(hacen\s+envios|costo\s+de\s+envio|cuanto\s+vale\s+el\s+envio|precio\s+del?\s+envio|cuanto\s+cuesta\s+el\s+envio|"
    r"envio|envios|despacho|flete|cobertura|transportadora|envian\s+a)\b",
    _A,
)

COMPARISON_RE = re.compile(
    r"\b(diferencia\s+entre|comparar|comparativa|cual\s+es\s+mejor|que\s+diferencia\s+hay|"
    r"que\s+me\s+recomiendas\s+entre)\b",
    _A,
)

PRICE_RE = re.compile(
    r"\b(cuanto\s+cuesta|que\s+precio\s+tiene|cual\s+es\s+el\s+precio|precio\s+de|cuanto\s+vale|a\s+como|valor\s+de|precio)\b",
    _A,
)

VARIANT_RE = re.compile(
    r"\b(talla\s+[xsml]|talla\s+\d+|talla|tallas|color\s+\w+|color|colores|tamano|medida)\b",
    _A,
)

STOCK_RE = re.compile(
    r"\b(tienen\s+disponible|hay\s+disponible|en\s+stock|hay\s+stock|tienen\s+stock|disponible|disponibles|"
    r"quedan|les\s+queda|existencia|existencias|agotad[oa])\b",
    _A,
)

SEARCH_RE = re.compile(
    r"\b(busco|que\s+productos\s+tienen|que\s+venden|muestrame|que\s+articulos|catalogo|tienen\s+\w+)\b",
    _A,
)

GREETING_RE = re.compile(
    r"\b(hola|buenos\s+dias|buenas\s+tardes|buenas\s+noches|hey|saludos|que\s+tal|buen\s+dia)\b",
    _A,
)

FAQ_RE = re.compile(
    r"\b(horario|horarios|donde\s+estan\s+ubicados|direccion|tienda\s+fisica|como\s+puedo\s+pagar|metodos\s+de\s+pago)\b",
    _A,
)

ORDER_NUMBER_RE = re.compile(r"#?([A-Z0-9-]{4,20})", _A)


def extract_entities(text: str) -> dict[str, Any]:
    entities: dict[str, Any] = {}
    normalized = strip_accents(text.lower())

    # Detectar número de orden si parece un código o #1234
    order_match = re.search(r"#([a-zA-Z0-9-]+)|\b(pedido|orden)\s*#?\s*([a-zA-Z0-9-]+)\b", text, re.IGNORECASE)
    if order_match:
        entities["order_number"] = order_match.group(1) or order_match.group(3)

    # Detectar tallas comunes
    variant_match = re.search(r"\btalla\s+([xsml\d]+)\b", normalized)
    if variant_match:
        entities["variant"] = variant_match.group(1).upper()

    # Detectar producto consultado
    for product_term in ("gorra", "gorras", "camiseta", "camisetas", "camisa", "camisas", "pantalon", "pantalones", "jean", "jeans"):
        if product_term in normalized:
            entities["product_query"] = product_term
            break

    return entities


def classify_intent(text: str) -> tuple[IntentType, float, str, dict[str, Any]]:
    """Clasificador v1 determinista de intención.
    
    Devuelve (IntentType, confidence, reason_code, entities).
    """
    # 1. Seguridad siempre primero: inyecciones por regex no pueden ser anuladas
    sec_check = check_security_gate(text)
    if sec_check.action == "BLOCK":
        return IntentType.INJECTION, 1.0, sec_check.reason_code or "INJECTION_BLOCKED", {}

    # 2. Fuera de ámbito claro (poemas, código, tareas ajenas)
    if is_clearly_off_topic_sales_query(text):
        return IntentType.OFF_TOPIC, 1.0, "OFF_TOPIC_MATCH", {}

    normalized = strip_accents(text.lower()).strip()
    entities = extract_entities(text)

    # 3. Quejas / reclamos
    if COMPLAINT_RE.search(normalized):
        return IntentType.COMPLAINT, 0.95, "COMPLAINT_MATCH", entities

    # 4. Solicitud explícita de asesor / humano
    if HANDOFF_RE.search(normalized):
        return IntentType.HUMAN_HANDOFF, 0.95, "HANDOFF_MATCH", entities

    # 5. Estado de pedido
    if ORDER_STATUS_RE.search(normalized):
        return IntentType.ORDER_STATUS, 0.95, "ORDER_STATUS_MATCH", entities

    # 6. Devoluciones / Garantías
    if RETURNS_RE.search(normalized):
        return IntentType.RETURNS, 0.95, "RETURNS_MATCH", entities

    # 7. Envíos
    if SHIPPING_RE.search(normalized):
        return IntentType.SHIPPING, 0.92, "SHIPPING_MATCH", entities

    # 8. Comparativa de productos
    if COMPARISON_RE.search(normalized):
        return IntentType.PRODUCT_COMPARISON, 0.90, "COMPARISON_MATCH", entities

    # 9. Precio de producto
    if PRICE_RE.search(normalized):
        return IntentType.PRODUCT_PRICE, 0.95, "PRICE_MATCH", entities

    # 10. Variantes (tallas, colores)
    if VARIANT_RE.search(normalized):
        return IntentType.PRODUCT_VARIANT, 0.95, "VARIANT_MATCH", entities

    # 11. Stock / disponibilidad
    if STOCK_RE.search(normalized):
        return IntentType.PRODUCT_STOCK, 0.95, "STOCK_MATCH", entities

    # 12. Búsqueda de productos
    if SEARCH_RE.search(normalized):
        return IntentType.PRODUCT_SEARCH, 0.92, "SEARCH_MATCH", entities

    # 13. FAQ
    if FAQ_RE.search(normalized):
        return IntentType.FAQ, 0.90, "FAQ_MATCH", entities

    # 14. Saludo (si no tiene preguntas de producto)
    if GREETING_RE.search(normalized):
        return IntentType.GREETING, 0.95, "GREETING_MATCH", entities

    # 15. Mensaje ambiguo o sin coincidencia suficiente
    return IntentType.UNKNOWN, 0.50, "UNKNOWN_FALLBACK", entities
