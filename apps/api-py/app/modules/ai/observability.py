"""Observabilidad de la sección 15: métricas mínimas y eventos ya definidos.

Eventos (ya definidos en ai_events.py):
  - ai_reply_generated   → respuesta producida con éxito
  - ai_reply_blocked     → output guard bloqueó la respuesta
  - ai_security_blocked  → security gate bloqueó el mensaje entrante
  - ai_handoff_triggered → handoff creado (con contexto de queja si aplica)
  - ai_rate_limited      → límite de cuota alcanzado
  - price_mismatch       → precio citado ≠ BD
  - factual_mismatch     → SKU / variante / plazo / nombre incorrecto
  - rag_stale_doc_used   → chunk de documento no vigente incluido en contexto
  - complaint_detected   → queja clasificada

Métricas mínimas por empresa (en memoria de proceso, exportables a un webhook):
  - reply_count          → total de respuestas generadas
  - block_count          → total de respuestas bloqueadas
  - handoff_count        → total de handoffs
  - company_msg_day      → mensajes del día para calcular cuota

Alerta de cuota: si hay webhook/logger operativo y la empresa supera el 80%
de AI_MAX_MSGS_PER_COMPANY_DAY, se emite un evento "quota_alert_80pct".
No se envía el texto completo del cliente.
"""

from __future__ import annotations

import logging
import threading
from collections import defaultdict
from datetime import date
from typing import Any

from app.core.ai_events import record_ai_event
from app.core.config import get_settings

logger = logging.getLogger("app.ai.observability")

# ---------------------------------------------------------------------------
# Contador en memoria (ligero, sin dependencia externa)
# ---------------------------------------------------------------------------

_lock = threading.Lock()

# { company_id: { "date": date, "count": int } }
_daily_counters: dict[str, dict[str, Any]] = defaultdict(lambda: {"date": date.min, "count": 0})

# Métricas acumuladas de sesión: { company_id: { metric: int } }
_session_metrics: dict[str, dict[str, int]] = defaultdict(lambda: defaultdict(int))


def _increment_daily(company_id: str) -> tuple[int, int]:
    """Incrementa el contador diario y devuelve (count_today, max_per_day)."""
    settings = get_settings()
    today = date.today()
    with _lock:
        entry = _daily_counters[company_id]
        if entry["date"] != today:
            entry["date"] = today
            entry["count"] = 0
        entry["count"] += 1
        return entry["count"], settings.AI_MAX_MSGS_PER_COMPANY_DAY


def _inc_metric(company_id: str, metric: str) -> None:
    with _lock:
        _session_metrics[company_id][metric] += 1


# ---------------------------------------------------------------------------
# Funciones públicas de observabilidad
# ---------------------------------------------------------------------------


def track_reply_generated(
    *,
    company_id: str,
    conversation_id: str,
    guard_passed: bool,
    intent: str | None = None,
) -> None:
    """Registra una respuesta generada y emite alerta de cuota si corresponde."""
    count_today, max_day = _increment_daily(company_id)
    _inc_metric(company_id, "reply_count")

    details: dict[str, Any] = {"guard_passed": guard_passed}
    if intent:
        details["intent"] = intent
    details["company_daily_count"] = count_today

    record_ai_event(
        "ai_reply_generated",
        company_id=company_id,
        conversation_id=conversation_id,
        details=details,
    )

    # Alerta al 80% de cuota diaria
    threshold = int(max_day * 0.8)
    if count_today == threshold:
        record_ai_event(
            "quota_alert_80pct",
            company_id=company_id,
            details={"daily_count": count_today, "daily_limit": max_day},
        )
        logger.warning(
            "QUOTA_ALERT company=%s ha alcanzado el 80%% de su cuota diaria (%d/%d)",
            company_id,
            count_today,
            max_day,
        )


def track_reply_blocked(
    *,
    company_id: str,
    conversation_id: str,
    reason_code: str,
) -> None:
    """Respuesta bloqueada por el output guard."""
    _inc_metric(company_id, "block_count")
    record_ai_event(
        "ai_reply_blocked",
        company_id=company_id,
        conversation_id=conversation_id,
        details={"reason_code": reason_code},
    )


def track_security_blocked(
    *,
    company_id: str,
    conversation_id: str,
    reason_code: str,
) -> None:
    """Mensaje de entrada bloqueado por el security gate."""
    record_ai_event(
        "ai_security_blocked",
        company_id=company_id,
        conversation_id=conversation_id,
        details={"reason_code": reason_code},
    )


def track_handoff(
    *,
    company_id: str,
    conversation_id: str,
    reason: str,
    complaint_severity: str | None = None,
) -> None:
    """Handoff creado, con contexto de queja si aplica."""
    _inc_metric(company_id, "handoff_count")
    details: dict[str, Any] = {"reason": reason}
    if complaint_severity:
        details["complaint_severity"] = complaint_severity
    record_ai_event(
        "ai_handoff_triggered",
        company_id=company_id,
        conversation_id=conversation_id,
        details=details,
    )


def track_rate_limited(*, company_id: str, conversation_id: str, scope: str) -> None:
    record_ai_event(
        "ai_rate_limited",
        company_id=company_id,
        conversation_id=conversation_id,
        details={"scope": scope},
    )


def track_fact_mismatch(
    *,
    company_id: str,
    conversation_id: str,
    event_name: str,
    reason_code: str,
    violating_items: list[str],
) -> None:
    """price_mismatch o factual_mismatch: el modelo citó un dato incorrecto."""
    record_ai_event(
        event_name,
        company_id=company_id,
        conversation_id=conversation_id,
        details={"reason_code": reason_code, "violating_items": violating_items[:3]},
    )


def track_rag_stale(
    *,
    company_id: str,
    conversation_id: str,
    document_title: str,
) -> None:
    """Documento RAG no vigente fue consultado (no debe afirmarse como actual)."""
    record_ai_event(
        "rag_stale_doc_used",
        company_id=company_id,
        conversation_id=conversation_id,
        details={"document_title": document_title},
    )


def track_complaint_detected(
    *,
    company_id: str,
    conversation_id: str,
    severity: str,
) -> None:
    record_ai_event(
        "complaint_detected",
        company_id=company_id,
        conversation_id=conversation_id,
        details={"severity": severity},
    )


def get_session_metrics(company_id: str) -> dict[str, int]:
    """Devuelve métricas acumuladas de sesión para una empresa (solo lectura)."""
    with _lock:
        return dict(_session_metrics.get(company_id, {}))
