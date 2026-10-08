"""Pipeline principal de respuesta del asistente de IA.

Responsabilidades (en orden de ejecución):
  1. Cargar historial de BD (solo para contexto del LLM; nunca para extraer precios/stock).
  2. Fact-check de la respuesta con FactSet construido SOLO desde la BD/tools.
  3. RAG con filtro company_id y vigencia de documentos.
  4. Quejas: clasificación de severidad y handoff contextual.
  5. Memoria de conversación en tres niveles (turno/sesión/cliente).
  6. Observabilidad: emitir eventos de la sección 15.

El output guard y el security gate no se debilitan.
El router de intents no se reabre.
"""

from __future__ import annotations

import contextlib
import logging
import re
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.text import fold
from app.models import Company, Message
from app.modules.ai.catalog_context import build_catalog_context
from app.modules.ai.commerce_prompt import CommerceSettings, format_commerce_prompt_block
from app.modules.ai.complaint_handler import classify_complaint
from app.modules.ai.fact_check import FactSet, verify_facts
from app.modules.ai.memory import ConversationMemory
from app.modules.ai.observability import (
    track_complaint_detected,
    track_fact_mismatch,
    track_handoff,
    track_rag_stale,
    track_reply_blocked,
    track_reply_generated,
)
from app.modules.ai.prompts import build_sales_assistant_system_prompt
from app.modules.ai.providers import HANDOFF_MARKER, PRODUCT_LINE_RE, ChatMessage, get_chat_provider
from app.modules.ai.sales_scope import (
    build_sales_scope_redirect,
    is_clearly_off_topic_sales_query,
    looks_like_off_topic_assistant_reply,
)
from app.modules.knowledge.retrieval import RetrievedChunk, retrieve, stale_citation

logger = logging.getLogger("app.ai.reply")

MAX_SUGGESTED_PRODUCTS = 10
PRODUCT_FOCUSED_RE = re.compile(
    r"(precio|cuanto|cuesta|talla|tallas|color|colores|stock|disponible|mostrar|muestra|muestrame|foto|fotos|"
    r"imagen|imagenes|variante|sku|producto|gorra|gorras|camisa|pantalon)"
)
CATALOG_OVERVIEW_RE = re.compile(
    r"(que venden|que tienen|que articulos|que productos|catalogo|en stock|disponibles|que hay|que ofrecen)"
)
FALLBACK_OVERVIEW_RE = re.compile(
    r"(que venden|que tienen|que articulos|que productos|catalogo|en stock|disponibles|que hay)"
)
WANTS_IMAGES_RE = re.compile(
    r"(mostrar|muestra|muestrame|ensename|enseñame|foto|fotos|imagen|imagenes|verlas|verlo|verla|puedes\s+mostrar)"
)
REASONING_SIGNALS = [
    re.compile(pattern, re.IGNORECASE | re.ASCII)
    for pattern in (
        r"\bwait,?\s+wait\b",
        r"\bhold on\b",
        r"\boh no\b",
        r"\bdiscrepanc",
        r"\baccording to the rules\b",
        r"\bthe assistant (made|previously|said)\b",
        r"\blet me (think|check|analyze|see)\b",
        r"\blooking at (the )?(catalog|history|previous)\b",
        r"\bi (need to|must|should) (correct|not invent|use|fix)\b",
        r"\bthis is a problem\b",
        r"\bchain of thought\b",
        r"Variantes:\s*.+\(sku\s+",
        r"\bsku\s+\w+,\s*\$\d",
    )
]
ENGLISH_WORDS_RE = re.compile(
    r"\b(the|this|that|there|according|because|however|catalog|assistant|previously|discrepancy)\b",
    re.IGNORECASE | re.ASCII,
)
SPANISH_MARKS_RE = re.compile(r"[áéíóúñ¿¡]", re.IGNORECASE)

# Detectar si el modelo citó un documento no vigente
_STALE_TAG_RE = re.compile(r"\[INFORMACIÓN NO VIGENTE\]", re.IGNORECASE)


@dataclass
class GenerateReplyResult:
    text: str
    requested_handoff: bool
    image_urls: list[str] = field(default_factory=list)
    """URLs públicas de imágenes a enviar por WhatsApp (Twilio MediaUrl)."""
    suggested_product_ids: list[str] | None = None
    """Productos de los que habla la respuesta (para lista o tarjeta en el chat)."""
    complaint_severity: str | None = None
    """Severidad de la queja si se detectó una (LOW/MEDIUM/HIGH/CRITICAL)."""


def is_product_focused_query(text: str) -> bool:
    """Preguntas de producto (precio/talla/foto): priorizar catálogo, no FAQ."""
    return bool(PRODUCT_FOCUSED_RE.search(fold(text)))


def is_catalog_overview_query(text: str) -> bool:
    return bool(CATALOG_OVERVIEW_RE.search(fold(text)))


def wants_product_images(text: str) -> bool:
    return bool(WANTS_IMAGES_RE.search(fold(text)))


def sanitize_model_output(raw: str) -> str:
    cleaned = raw
    for pattern, flags in (
        (r"^\s*User Safety\s*:\s*\w+\s*", re.IGNORECASE | re.MULTILINE),
        (r"^\s*Response Safety\s*:\s*\w+\s*", re.IGNORECASE | re.MULTILINE),
        (r"\bUser Safety\s*:\s*\w+\b", re.IGNORECASE),
        (r"\bResponse Safety\s*:\s*\w+\b", re.IGNORECASE),
        (r"^\s*Safety\s*:\s*\w+\s*", re.IGNORECASE | re.MULTILINE),
        (r"<think>[\s\S]*?</think>", re.IGNORECASE),
        (r"</?think>", re.IGNORECASE),
        # Eliminar marcas de documento no vigente que el modelo haya reproducido
        (r"\[INFORMACIÓN NO VIGENTE\]", re.IGNORECASE),
    ):
        cleaned = re.sub(pattern, "", cleaned, flags=flags | re.ASCII)
    cleaned = cleaned.strip()
    if not cleaned or re.fullmatch(r"(user|response)?\s*safety\s*:?\s*safe", cleaned, re.IGNORECASE):
        return ""
    return cleaned


def looks_like_internal_reasoning(text: str) -> bool:
    """Detecta monólogos / CoT que no deben llegar al cliente."""
    trimmed = text.strip()
    if len(trimmed) > 650:
        return True
    hits = sum(1 for pattern in REASONING_SIGNALS if pattern.search(trimmed))
    if hits >= 2 or (hits >= 1 and len(trimmed) > 320):
        return True
    spanish_marks = len(SPANISH_MARKS_RE.findall(trimmed))
    english_hits = len(ENGLISH_WORDS_RE.findall(trimmed))
    return english_hits >= 6 and spanish_marks == 0 and len(trimmed) > 180


def is_handoff(content: str) -> bool:
    normalized = content.strip()
    return (
        normalized == HANDOFF_MARKER
        or HANDOFF_MARKER in normalized.upper()
        or bool(re.fullmatch(r"\[?\s*handoff\s*\]?", normalized, re.IGNORECASE))
    )


def build_knowledge_fallback(chunks: list[RetrievedChunk]) -> str | None:
    """Si el modelo falla pero hay RAG, resume el fragmento más relevante.

    Si el chunk no es vigente, usa la fórmula de citación condicional.
    """
    best = chunks[0] if chunks else None
    if not best or not best.content.strip():
        return None
    cleaned = re.sub(r"^#+\s*", "", best.content, flags=re.MULTILINE)
    cleaned = re.sub(r"\s+", " ", cleaned.replace("**", "")).strip()
    snippet = f"{cleaned[:277].strip()}…" if len(cleaned) > 280 else cleaned
    if best.is_current:
        return f'Según nuestra información de "{best.document_title}": {snippet}'
    # Documento no vigente → citación condicional
    prefix = stale_citation(best)
    return f"{prefix}: {snippet}"


def build_catalog_overview_fallback(catalog_block: str, customer_text: str) -> str | None:
    """Si el modelo falla en una pregunta de catálogo, lista 2-3 nombres del bloque."""
    if not FALLBACK_OVERVIEW_RE.search(fold(customer_text)):
        return None
    names = [name.strip() for name in PRODUCT_LINE_RE.findall(catalog_block)]
    names = [name for name in names if name][:3]
    if not names:
        return None
    return f"Ahora mismo tenemos: {', '.join(names)}. ¿Quieres precio o más detalles de alguno?"


def _apply_stale_rewrite(content: str, chunks: list[RetrievedChunk]) -> str:
    """Si el modelo incluyó contenido de un chunk no vigente, añade la cita condicional.

    Solo aplica si el modelo reprodujo literalmente parte del contenido de un
    documento marcado como [STALE] en el bloque RAG.
    """
    stale_chunks = [c for c in chunks if not c.is_current]
    if not stale_chunks:
        return content
    # Si el contenido ya incluye la fórmula "Según la información publicada", está bien.
    if re.search(r"según\s+la\s+información\s+publicada", content, re.IGNORECASE):
        return content
    # Si el modelo afirma algo que puede venir de un chunk no vigente, añadir disclaimer.
    for chunk in stale_chunks:
        # Buscar coincidencia parcial (primeras 30 chars del chunk en el reply)
        snippet = fold(chunk.content[:40].strip())
        if snippet and fold(content).startswith(snippet[:20]):
            prefix = stale_citation(chunk)
            return f"{prefix}: {content}"
    return content


async def generate_reply(
    session: AsyncSession, *, company_id: str, conversation_id: str, customer_text: str
) -> GenerateReplyResult:
    settings = get_settings()
    fallback = settings.AI_FALLBACK_TEXT
    rag_chunks: list[RetrievedChunk] = []
    rag_block = ""
    image_urls: list[str] = []
    conv_memory = ConversationMemory()

    try:
        recent = (
            await session.execute(
                select(Message.direction, Message.body)
                .where(Message.conversation_id == conversation_id)
                .order_by(Message.created_at.desc())
                .limit(settings.AI_HISTORY_LIMIT)
            )
        ).all()

        # Follow-ups ("¿qué precio?", "muéstramelas") necesitan contexto del producto ya mencionado.
        prior_inbound = " ".join(body for direction, body in reversed(recent) if direction == "inbound")
        catalog = await build_catalog_context(session, company_id, f"{prior_inbound} {customer_text}".strip())

        if is_clearly_off_topic_sales_query(customer_text):
            logger.info("Off-topic sales query blocked conversation=%s", conversation_id)
            return GenerateReplyResult(build_sales_scope_redirect(catalog.company_name), False)

        # ------------------------------------------------------------------
        # Quejas: severidad + handoff contextual
        # ------------------------------------------------------------------
        complaint_ctx = None
        folded_customer = fold(customer_text)
        if re.search(
            r"\b(queja|reclamo|problema|dano|roto|no llego|nunca llego|reembolso|devolucion|"
            r"demanda|fraude|incorrecto|equivocado|molesto|decepcionado|urgente|tarde|demorado)\b",
            folded_customer,
        ):
            complaint_ctx = classify_complaint(customer_text)
            track_complaint_detected(
                company_id=company_id,
                conversation_id=conversation_id,
                severity=complaint_ctx.severity,
            )
            if complaint_ctx.needs_handoff:
                track_handoff(
                    company_id=company_id,
                    conversation_id=conversation_id,
                    reason="complaint",
                    complaint_severity=complaint_ctx.severity,
                )
                from app.modules.ai.complaint_handler import build_complaint_reply
                reply_text = build_complaint_reply(complaint_ctx, company_name=catalog.company_name)
                track_reply_generated(
                    company_id=company_id,
                    conversation_id=conversation_id,
                    guard_passed=True,
                    intent="COMPLAINT",
                )
                return GenerateReplyResult(
                    reply_text,
                    True,
                    complaint_severity=complaint_ctx.severity,
                )

        product_focused = is_product_focused_query(customer_text)
        if not product_focused:
            rag_block, rag_chunks = await retrieve(session, company_id, customer_text)

            # Observabilidad: avisar por cada chunk no vigente incluido
            for chunk in rag_chunks:
                if not chunk.is_current:
                    track_rag_stale(
                        company_id=company_id,
                        conversation_id=conversation_id,
                        document_title=chunk.document_title,
                    )

        # Sin catálogo ni documentos: no hay con qué responder.
        if catalog.product_count == 0 and not rag_chunks:
            return GenerateReplyResult(fallback, True)

        if wants_product_images(customer_text) or product_focused:
            image_urls = [url for product in catalog.matched_products for url in product.image_urls][:3]
        suggested = (
            [product.id for product in catalog.matched_products][:MAX_SUGGESTED_PRODUCTS]
            if product_focused or is_catalog_overview_query(customer_text)
            else []
        )

        # Actualizar memoria de conversación (nivel 2) con productos mencionados
        for product in catalog.matched_products[:3]:
            conv_memory.note_product(product.name if hasattr(product, "name") else "")

        company = await session.get(Company, company_id)
        configured, commerce_block = format_commerce_prompt_block(
            CommerceSettings(
                company.country_code if company else None,
                company.shipping_region if company else None,
                company.shipping_city if company else None,
                list(company.shipping_scopes) if company else [],
                list(company.shipping_carriers) if company else [],
            )
        )

        history = [
            ChatMessage("user" if direction == "inbound" else "assistant", body)
            for direction, body in reversed(recent)
        ]
        if not history or history[-1].content != customer_text:
            history.append(ChatMessage("user", customer_text))

        system = build_sales_assistant_system_prompt(
            company_name=catalog.company_name,
            catalog_block=catalog.catalog_block,
            categories_summary=catalog.categories_summary,
            total_active_count=catalog.total_active_count,
            commerce_block=commerce_block,
            commerce_configured=configured,
            rag_block=rag_block,
        )
        result = await get_chat_provider().complete(
            [ChatMessage("system", system), *history], max_tokens=220, temperature=0.2
        )
        content = sanitize_model_output(result.content)

        if is_handoff(content):
            logger.warning("AI handoff marker for conversation=%s", conversation_id)
            track_handoff(
                company_id=company_id,
                conversation_id=conversation_id,
                reason="model_requested",
            )
            return GenerateReplyResult(fallback, True)

        if not content or looks_like_internal_reasoning(content):
            logger.warning(
                "AI empty/garbage reply for conversation=%s; using RAG/catalog fallback", conversation_id
            )
            catalog_fallback = build_catalog_overview_fallback(catalog.catalog_block, customer_text)
            text = (
                (catalog_fallback if product_focused else None)
                or build_knowledge_fallback(rag_chunks)
                or catalog_fallback
                or fallback
            )
            track_reply_generated(
                company_id=company_id,
                conversation_id=conversation_id,
                guard_passed=False,
            )
            return GenerateReplyResult(text, False, image_urls, suggested)

        if looks_like_off_topic_assistant_reply(content):
            logger.warning("AI off-topic tutorial blocked conversation=%s", conversation_id)
            track_reply_blocked(
                company_id=company_id,
                conversation_id=conversation_id,
                reason_code="OFF_TOPIC_CONTENT",
            )
            return GenerateReplyResult(build_sales_scope_redirect(catalog.company_name), False)

        # ------------------------------------------------------------------
        # Fact-check estricto: FactSet construido SOLO desde catalog (BD).
        # El historial de conversación NO es fuente de precios ni stock.
        # ------------------------------------------------------------------
        if settings.AI_FACT_CHECK_ENABLED:
            facts = FactSet(
                allowed_prices={
                    float(p.price)
                    for product in catalog.matched_products
                    for p in (getattr(product, "variants", None) or [])
                    if getattr(p, "price", None) is not None
                },
                allowed_skus={
                    str(p.sku)
                    for product in catalog.matched_products
                    for p in (getattr(product, "variants", None) or [])
                    if getattr(p, "sku", None)
                },
                allowed_variants={
                    str(p.variant_label)
                    for product in catalog.matched_products
                    for p in (getattr(product, "variants", None) or [])
                    if getattr(p, "variant_label", None)
                },
            )
            fact_result = verify_facts(content, facts)
            if not fact_result.passed:
                event = fact_result.event_name or "factual_mismatch"
                track_fact_mismatch(
                    company_id=company_id,
                    conversation_id=conversation_id,
                    event_name=event,
                    reason_code=fact_result.reason_code or "UNKNOWN",
                    violating_items=fact_result.violating_items,
                )
                logger.warning(
                    "Fact-check FAILED conversation=%s reason=%s items=%s",
                    conversation_id,
                    fact_result.reason_code,
                    fact_result.violating_items,
                )
                # Volver al fallback RAG/catalog sin la respuesta alucinada
                fallback_text = build_knowledge_fallback(rag_chunks) or build_catalog_overview_fallback(
                    catalog.catalog_block, customer_text
                ) or fallback
                track_reply_blocked(
                    company_id=company_id,
                    conversation_id=conversation_id,
                    reason_code=fact_result.reason_code or "FACT_CHECK_FAILED",
                )
                return GenerateReplyResult(fallback_text, False, image_urls, suggested)

        # ------------------------------------------------------------------
        # RAG no vigente: reescribir con citación condicional si aplica
        # ------------------------------------------------------------------
        if rag_chunks:
            content = _apply_stale_rewrite(content, rag_chunks)

        # ------------------------------------------------------------------
        # Queja LOW/MEDIUM: reconocer + continuar (sin pitch de ventas)
        # ------------------------------------------------------------------
        if complaint_ctx is not None:
            from app.modules.ai.complaint_handler import build_complaint_reply
            ack_text = build_complaint_reply(complaint_ctx, company_name=catalog.company_name)
            # Prepend el reconocimiento antes de la respuesta del modelo
            content = f"{ack_text} {content}".strip()

        text = content.replace(HANDOFF_MARKER, "", 1).strip() or fallback
        wants_images = wants_product_images(customer_text)
        if wants_images and image_urls:
            text = f"{text}\n\nTe envío {'la foto' if len(image_urls) == 1 else 'las fotos'} del producto."
        elif wants_images:
            text = f"{text}\n\nPor ahora no tengo fotos cargadas de ese producto en el catálogo."

        track_reply_generated(
            company_id=company_id,
            conversation_id=conversation_id,
            guard_passed=True,
        )
        return GenerateReplyResult(text, False, image_urls if wants_images else [], suggested)

    except Exception as error:  # noqa: BLE001
        logger.error("AI reply failed: %s", error)
        # Si el modelo falló pero ya teníamos documentos, responde con ellos.
        if not rag_chunks and not is_product_focused_query(customer_text):
            with contextlib.suppress(Exception):
                _, rag_chunks = await retrieve(session, company_id, customer_text)
        return GenerateReplyResult(build_knowledge_fallback(rag_chunks) or fallback, False)
