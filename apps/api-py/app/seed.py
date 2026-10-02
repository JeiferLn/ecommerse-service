"""Datos base: usuario administrador de plataforma y planes Free/Pro/Business.

Uso: `uv run python -m app.seed` (idempotente).
"""

import asyncio
from typing import Any

from sqlalchemy.dialects.postgresql import insert

from app.core.db import SessionLocal, engine
from app.core.ids import new_id, utcnow
from app.core.security import hash_password
from app.models import Plan, User

ADMIN_EMAIL = "admin@admin.com"
ADMIN_PASSWORD = "admin@admin.com"

PLANS: list[dict[str, Any]] = [
    {
        "code": "free",
        "name": "Free",
        "price_usd_cents": 0,
        "max_members": 2,
        "max_products": 30,
        "max_variants": 80,
        "max_wa_messages_month": 100,
        "max_ai_replies_month": 50,
        "max_knowledge_docs": 4,
        "sort_order": 0,
    },
    {
        "code": "pro",
        "name": "Pro",
        "price_usd_cents": 3900,
        "max_members": 5,
        "max_products": 300,
        "max_variants": 1000,
        "max_wa_messages_month": 2000,
        "max_ai_replies_month": 1500,
        "max_knowledge_docs": 4,
        "sort_order": 1,
    },
    {
        "code": "business",
        "name": "Business",
        "price_usd_cents": 9900,
        "max_members": 25,
        "max_products": 2000,
        "max_variants": 8000,
        "max_wa_messages_month": 10000,
        "max_ai_replies_month": 8000,
        "max_knowledge_docs": 4,
        "sort_order": 2,
    },
]


async def seed() -> None:
    now = utcnow()
    async with SessionLocal() as session:
        await session.execute(
            insert(User)
            .values(
                id=new_id(),
                name="Administrador",
                email=ADMIN_EMAIL,
                password_hash=hash_password(ADMIN_PASSWORD),
                role="admin",
                created_at=now,
                updated_at=now,
            )
            .on_conflict_do_update(index_elements=["email"], set_={"role": "admin", "updatedAt": now})
        )
        for plan in PLANS:
            values = {**plan, "is_public": True}
            columns = Plan.__mapper__.columns
            update = {columns[key].name: value for key, value in values.items() if key != "code"}
            await session.execute(
                insert(Plan)
                .values(id=new_id(), created_at=now, updated_at=now, **values)
                .on_conflict_do_update(index_elements=["code"], set_={**update, "updatedAt": now})
            )
        await session.commit()
    await engine.dispose()
    print(f"Seed completado: {ADMIN_EMAIL} (rol admin) + planes Free/Pro/Business")


if __name__ == "__main__":
    asyncio.run(seed())
