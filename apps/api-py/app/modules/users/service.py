from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import CompanyMembership, User
from app.modules.billing.service import BillingService


class UsersService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def find_by_email(self, email: str) -> User | None:
        return await self.session.scalar(select(User).where(User.email == email))

    async def find_by_id(self, user_id: str) -> User | None:
        return await self.session.scalar(select(User).where(User.id == user_id))

    async def to_auth_user(self, user_id: str, company_id: str | None) -> dict[str, Any] | None:
        user = await self.session.scalar(
            select(User)
            .where(User.id == user_id)
            .options(selectinload(User.memberships).selectinload(CompanyMembership.company))
            .execution_options(populate_existing=True)
        )
        if not user:
            return None

        memberships = sorted(user.memberships, key=lambda membership: membership.created_at)
        companies = [
            {
                "id": membership.company_id,
                "name": membership.company.name,
                "type": membership.company.type,
                "role": membership.role,
            }
            for membership in memberships
        ]
        active = next((m for m in memberships if m.company_id == company_id), None)
        subscription = (
            await BillingService(self.session).get_subscription_summary(company_id) if active else None
        )
        return {
            "id": user.id,
            "name": user.name,
            "email": user.email,
            "role": active.role if active else user.role,
            "companyId": company_id if active else None,
            "companies": companies,
            "subscription": subscription,
        }

    async def count(self) -> int:
        return int(await self.session.scalar(select(func.count()).select_from(User)) or 0)
