from app.modules.ai.complaint_handler import ComplaintSeverity, build_complaint_reply, classify_complaint
from app.modules.ai.sales_scope import build_sales_scope_redirect


def render_greeting(company_name: str) -> str:
    name = company_name.strip() or "nuestra tienda"
    return f"¡Hola! Te damos la bienvenida a {name}. ¿En qué te podemos ayudar hoy?"


def render_product_price(
    product_name: str, price: float | int | str, currency: str = "COP", extra_info: str | None = None
) -> str:
    price_str = f"{price:,}" if isinstance(price, int | float) else str(price)
    msg = f"El precio de {product_name} es de ${price_str} {currency}."
    if extra_info:
        msg = f"{msg} {extra_info}"
    return f"{msg} ¿Deseas hacer tu pedido o consultar algún otro producto?"


def render_product_stock(
    product_name: str, in_stock: bool, quantity: int | None = None
) -> str:
    if in_stock:
        qty_text = f" (tenemos {quantity} en stock)" if quantity is not None else ""
        return f"Sí, contamos con {product_name} disponible{qty_text}. ¿Te gustaría adquirir una?"
    return f"Actualmente no tenemos {product_name} en stock disponible. ¿Te gustaría consultar otro artículo?"


def render_product_variant(
    product_name: str, variants_summary: list[str]
) -> str:
    if not variants_summary:
        return f"Para {product_name} no tenemos variantes específicas registradas. ¿Deseas más detalles?"
    variants_str = ", ".join(variants_summary)
    return f"Para {product_name} tenemos disponibles las siguientes opciones: {variants_str}. ¿Cuál prefieres?"


def render_complaint(
    customer_text: str = "",
    company_name: str = "",
    severity: ComplaintSeverity | None = None,
) -> str:
    """Reconoce la queja según su severidad y crea handoff si aplica.

    Nunca cierra con pitch de ventas.
    """
    if customer_text:
        ctx = classify_complaint(customer_text)
    else:
        from app.modules.ai.complaint_handler import ComplaintContext, _ACKNOWLEDGEMENTS

        sev: ComplaintSeverity = severity or "MEDIUM"
        ctx = ComplaintContext(
            severity=sev,
            summary=f"[{sev}] Queja detectada",
            needs_handoff=sev in ("HIGH", "CRITICAL"),
            acknowledgement=_ACKNOWLEDGEMENTS[sev],
        )
    return build_complaint_reply(ctx, company_name=company_name)


def render_complaint_by_severity(severity: ComplaintSeverity, company_name: str = "") -> str:
    """Plantilla directa por severidad (para uso en el router o tests)."""
    return render_complaint(severity=severity, company_name=company_name)


def render_handoff() -> str:
    return "Con gusto te comunico con un asesor de la tienda. En un momento continuará atendiéndote por aquí."


def render_off_topic(company_name: str) -> str:
    return build_sales_scope_redirect(company_name)


def render_injection_block(company_name: str) -> str:
    return build_sales_scope_redirect(company_name)


def render_unknown(company_name: str) -> str:
    name = company_name.strip() or "la tienda"
    return (
        f"No logré comprender tu consulta. En {name} te puedo ayudar con información de catálogo, "
        "precios, existencias y compras. ¿Buscas algún producto o prefieres hablar con un asesor?"
    )


def render_unavailable(topic: str = "este servicio") -> str:
    return (
        f"En este momento no cuento con la información exacta sobre {topic}. "
        "Un asesor de nuestro equipo te responderá con gusto para confirmarte los detalles."
    )


def render_order_status(order_number: str, status: str, total: str | None = None) -> str:
    total_str = f" por un total de {total}" if total else ""
    return f"Tu pedido #{order_number} se encuentra actualmente en estado: {status}{total_str}."


def render_order_not_found(order_number: str | None = None) -> str:
    ref = f" con el número #{order_number}" if order_number else ""
    return f"No encontramos ningún pedido registrado{ref}. Por favor verifica el número o pide la ayuda de un asesor."


def render_rate_limit(scope: str) -> str:
    if scope == "phone":
        return "Has enviado muchos mensajes en un período muy corto. Por seguridad, te transferimos con un asesor."
    if scope == "conversation":
        return "Has alcanzado el límite de mensajes automáticos para esta consulta. Un asesor te atenderá pronto."
    return "El asistente automático no está disponible en este momento. Un asesor de la tienda te atenderá pronto."
