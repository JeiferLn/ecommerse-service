"""Manejo de quejas con clasificación de severidad y handoff contextual.

Niveles de severidad
--------------------
- LOW      : Queja menor (retraso leve, pregunta sin respuesta).
- MEDIUM   : Insatisfacción clara (producto incorrecto, cobro erróneo).
- HIGH     : Problema grave (artículo dañado, no llegó el pedido, reembolso).
- CRITICAL : Amenaza legal, acoso, emergencia, fraude reportado.

Reglas
------
1. Siempre reconocer primero el problema antes de pedir datos.
2. Si hay pedido mencionado → intentar consultar OrderTool antes de pedir el número.
3. HIGH y CRITICAL siempre crean handoff con contexto (severidad + resumen).
4. Nunca cerrar una queja con pitch de ventas.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Literal

from app.core.text import strip_accents

# ---------------------------------------------------------------------------
# Tipos
# ---------------------------------------------------------------------------

ComplaintSeverity = Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]


@dataclass
class ComplaintContext:
    severity: ComplaintSeverity
    summary: str
    """Resumen de la queja para el handoff (sin datos sensibles)."""
    needs_handoff: bool
    """True para HIGH y CRITICAL."""
    order_number: str | None = None
    """Número de pedido extraído si hay uno en el texto."""
    acknowledgement: str = ""
    """Texto de reconocimiento que debe enviarse al cliente antes de cualquier otra acción."""
    ask_for: list[str] = field(default_factory=list)
    """Datos mínimos que falta pedir (si no hay pedido identificado)."""


# ---------------------------------------------------------------------------
# Patrones de detección de severidad
# ---------------------------------------------------------------------------

# CRITICAL: amenazas legales, fraude, acoso
_CRITICAL_RE = re.compile(
    r"\b(demanda(r)?|abogado|tribunal|denuncia(r)?|fraude|estafo|robo|estafaron|"
    r"juzgado|ilegal|policia|acoso|amenazo|amenaza)\b",
    re.IGNORECASE | re.ASCII,
)

# HIGH: productos dañados, pérdida de pedido, reembolso urgente
_HIGH_RE = re.compile(
    r"\b(danado|roto|no llego|nunca llego|no recibi|perdido|falta(n)?|"
    r"reembolso|devolucion|cobro doble|cobro mal|no funciona|defectuoso|"
    r"urgente|escalo|escalar|quiero hablar con|quiero que me llame)\b",
    re.IGNORECASE | re.ASCII,
)

# MEDIUM: insatisfacción clara, errores concretos
_MEDIUM_RE = re.compile(
    r"\b(incorrecto|equivocado|mal producto|talla errada|color diferente|"
    r"precio diferente|cobro extra|problema|queja|molesto|decepcionado|"
    r"no es lo que pedi|no corresponde)\b",
    re.IGNORECASE | re.ASCII,
)

# LOW: retraso leve, duda, solicitud de información
_LOW_COMPLAINT_RE = re.compile(
    r"\b(tarde|demorado|demora|no ha llegado aun|cuando llega|"
    r"sin respuesta|no contestaron|duda sobre|no me explicaron)\b",
    re.IGNORECASE | re.ASCII,
)

# Extracción de número de pedido
_ORDER_NUMBER_RE = re.compile(
    r"(?:pedido|orden|order|factura)\s*[#n°nro.]?\s*([a-z0-9\-]+)\b",
    re.IGNORECASE | re.ASCII,
)


def _extract_order_number(text: str) -> str | None:
    m = _ORDER_NUMBER_RE.search(text)
    return m.group(1).strip() if m else None


def _classify_severity(normalized: str) -> ComplaintSeverity:
    if _CRITICAL_RE.search(normalized):
        return "CRITICAL"
    if _HIGH_RE.search(normalized):
        return "HIGH"
    if _MEDIUM_RE.search(normalized):
        return "MEDIUM"
    return "LOW"


# ---------------------------------------------------------------------------
# Plantillas de reconocimiento (sin pitch de ventas)
# ---------------------------------------------------------------------------

_ACK_CRITICAL = (
    "Lamentamos profundamente lo ocurrido. Tu caso es muy serio para nosotros "
    "y lo estamos escalando de inmediato a nuestra dirección."
)
_ACK_HIGH = (
    "Entendemos tu frustración y lamentamos este inconveniente. "
    "Vamos a resolver esto de inmediato."
)
_ACK_MEDIUM = (
    "Lamentamos el inconveniente que has tenido. "
    "Queremos ayudarte a solucionarlo lo antes posible."
)
_ACK_LOW = "Entendemos tu preocupación y queremos ayudarte."

_ACKNOWLEDGEMENTS: dict[ComplaintSeverity, str] = {
    "CRITICAL": _ACK_CRITICAL,
    "HIGH": _ACK_HIGH,
    "MEDIUM": _ACK_MEDIUM,
    "LOW": _ACK_LOW,
}


# ---------------------------------------------------------------------------
# Clasificación principal
# ---------------------------------------------------------------------------


def classify_complaint(customer_text: str) -> ComplaintContext:
    """Clasifica la queja y devuelve el contexto para el handler.

    El llamador debe:
    1. Enviar ``acknowledgement`` al cliente ANTES de cualquier otra acción.
    2. Si ``needs_handoff`` → crear handoff con ``summary`` y ``severity``.
    3. Si ``order_number`` → consultar OrderTool (no pedir el número al cliente).
    4. Si ``ask_for`` y no hay pedido → pedir solo esos datos.
    5. NUNCA agregar pitch de ventas al cierre de una queja.
    """
    normalized = strip_accents(customer_text.lower())
    severity = _classify_severity(normalized)
    order_number = _extract_order_number(customer_text)

    ack = _ACKNOWLEDGEMENTS[severity]
    needs_handoff = severity in ("HIGH", "CRITICAL")

    # Resumen corto para el handoff (sin texto completo del cliente)
    summary = f"[{severity}] Queja detectada"
    if order_number:
        summary += f" — pedido #{order_number}"

    # Si no hay pedido y severidad >= MEDIUM → pedir número de pedido
    ask_for: list[str] = []
    if not order_number and severity in ("MEDIUM", "HIGH", "CRITICAL"):
        ask_for.append("número de pedido")

    return ComplaintContext(
        severity=severity,
        summary=summary,
        needs_handoff=needs_handoff,
        order_number=order_number,
        acknowledgement=ack,
        ask_for=ask_for,
    )


def build_complaint_reply(ctx: ComplaintContext, *, company_name: str = "") -> str:
    """Construye la respuesta al cliente para una queja.

    Reglas aplicadas aquí:
    - Primero el reconocimiento.
    - Si necesita datos → pedirlos.
    - Si ya hay handoff → anunciar la transferencia sin pitch.
    - Nunca cierra con promoción de ventas.
    """
    parts: list[str] = [ctx.acknowledgement]

    if ctx.needs_handoff:
        parts.append(
            "En este momento te estamos transfiriendo con un asesor "
            f"{'de ' + company_name if company_name else ''} "
            "quien se pondrá en contacto contigo de inmediato para darte una solución.".strip()
        )
    elif ctx.ask_for:
        fields_str = " y ".join(ctx.ask_for)
        parts.append(f"Para ayudarte, ¿podrías indicarnos tu {fields_str}?")
    else:
        parts.append("Un asesor revisará tu caso y te responderá a la brevedad.")

    return " ".join(parts)
