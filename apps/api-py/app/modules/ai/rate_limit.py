from dataclasses import dataclass
from datetime import timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.ai_events import record_ai_event
from app.core.config import get_settings
from app.core.ids import new_id, utcnow
from app.models import AiUsage
from app.modules.ai.template_replies import render_rate_limit

RateLimitScope = Literal["phone", "conversation", "company", None]


@dataclass
class RateLimitResult:
    allowed: bool
    exceeded_scope: RateLimitScope = None
    requires_handoff: bool = False
    safe_reply: str | None = None


async def check_and_record_rate_limit(
    session: AsyncSession,
    *,
    company_id: str,
    conversation_id: str | None = None,
    customer_phone: str | None = None,
) -> RateLimitResult:
    """Verifica límites de tasa (teléfono, conversación, empresa) y registra el consumo en AiUsage.
    
    Límites:
    - Teléfono: AI_MAX_MSGS_PER_PHONE_MINUTE (5/min) -> handoff
    - Conversación: AI_MAX_MSGS_PER_CONVERSATION_HOUR (20/hora) -> handoff
    - Empresa: AI_MAX_MSGS_PER_COMPANY_DAY (500/día) -> bloquear LLM, respuesta segura
    """
    settings = get_settings()
    if not settings.AI_RATE_LIMIT_ENABLED:
        return RateLimitResult(allowed=True)

    now = utcnow()

    # 1. Teléfono: último minuto
    if customer_phone:
        one_min_ago = now - timedelta(seconds=60)
        phone_count = (
            await session.scalar(
                select(func.count(AiUsage.id)).where(
                    AiUsage.customer_phone == customer_phone,
                    AiUsage.created_at >= one_min_ago,
                )
            )
            or 0
        )
        if phone_count >= settings.AI_MAX_MSGS_PER_PHONE_MINUTE:
            record_ai_event(
                "rate_limit_hit",
                company_id=company_id,
                conversation_id=conversation_id,
                customer_phone=customer_phone,
                details={"scope": "phone", "limit": settings.AI_MAX_MSGS_PER_PHONE_MINUTE, "count": phone_count},
            )
            return RateLimitResult(
                allowed=False,
                exceeded_scope="phone",
                requires_handoff=True,
                safe_reply=render_rate_limit("phone"),
            )

    # 2. Conversación: última hora
    if conversation_id:
        one_hour_ago = now - timedelta(seconds=3600)
        conv_count = (
            await session.scalar(
                select(func.count(AiUsage.id)).where(
                    AiUsage.conversation_id == conversation_id,
                    AiUsage.created_at >= one_hour_ago,
                )
            )
            or 0
        )
        if conv_count >= settings.AI_MAX_MSGS_PER_CONVERSATION_HOUR:
            record_ai_event(
                "rate_limit_hit",
                company_id=company_id,
                conversation_id=conversation_id,
                customer_phone=customer_phone,
                details={"scope": "conversation", "limit": settings.AI_MAX_MSGS_PER_CONVERSATION_HOUR, "count": conv_count},
            )
            return RateLimitResult(
                allowed=False,
                exceeded_scope="conversation",
                requires_handoff=True,
                safe_reply=render_rate_limit("conversation"),
            )

    # 3. Empresa: últimas 24 horas
    one_day_ago = now - timedelta(days=1)
    company_count = (
        await session.scalar(
            select(func.count(AiUsage.id)).where(
                AiUsage.company_id == company_id,
                AiUsage.created_at >= one_day_ago,
            )
        )
        or 0
    )
    if company_count >= settings.AI_MAX_MSGS_PER_COMPANY_DAY:
        record_ai_event(
            "rate_limit_hit",
            company_id=company_id,
            conversation_id=conversation_id,
            customer_phone=customer_phone,
            details={"scope": "company", "limit": settings.AI_MAX_MSGS_PER_COMPANY_DAY, "count": company_count},
        )
        return RateLimitResult(
            allowed=False,
            exceeded_scope="company",
            requires_handoff=False,
            safe_reply=render_rate_limit("company"),
        )

    # Registrar el nuevo uso
    usage = AiUsage(
        id=new_id(),
        company_id=company_id,
        conversation_id=conversation_id,
        customer_phone=customer_phone,
        created_at=now,
    )
    session.add(usage)
    await session.commit()

    return RateLimitResult(allowed=True)
