from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import bad_request, forbidden
from app.core.ids import iso, utcnow
from app.core.numbers import num
from app.models import Category, Company, CompanyMembership, Order, Product, User

LOW_STOCK_THRESHOLD = 5
RECENT_COMPANIES_LIMIT = 8
TOP_PRODUCTS_LIMIT = 8
PAID_STATUSES = ("paid", "preparing", "shipped", "delivered")
OPEN_STATUSES = ("draft", "confirmed", "awaiting_payment", "paid", "preparing", "shipped")


def to_daily_series(dates: list[datetime], since: datetime) -> list[dict[str, Any]]:
    buckets = {(since + timedelta(days=offset)).date().isoformat(): 0 for offset in range(30)}
    for date in dates:
        key = date.date().isoformat()
        if key in buckets:
            buckets[key] += 1
    return [{"date": day, "count": count} for day, count in buckets.items()]


class DashboardService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def _count(self, model: Any, *conditions: Any) -> int:
        return await self.session.scalar(select(func.count(model.id)).where(*conditions)) or 0

    async def _revenue(self, *conditions: Any) -> int | float:
        total = await self.session.scalar(
            select(func.sum(Order.total)).where(Order.status.in_(PAID_STATUSES), *conditions)
        )
        return num(total or 0)

    async def get_company_stats(self, company_id: str | None) -> dict[str, Any]:
        if not company_id:
            raise bad_request("Selecciona una empresa activa")
        in_company = Order.company_id == company_id

        products = (
            await self.session.scalars(
                select(Product)
                .where(Product.company_id == company_id)
                .options(selectinload(Product.variants))
            )
        ).all()
        status_map = {"draft": 0, "active": 0, "archived": 0}
        summaries: list[dict[str, Any]] = []
        variants_total = 0
        total_stock = 0
        for product in products:
            status_map[product.status] += 1
            product_stock = sum(variant.stock for variant in product.variants)
            variants_total += len(product.variants)
            total_stock += product_stock
            summaries.append({"id": product.id, "name": product.name, "totalStock": product_stock})

        low_stock = [
            item
            for item in sorted(summaries, key=lambda s: s["totalStock"])
            if item["totalStock"] <= LOW_STOCK_THRESHOLD
        ][:TOP_PRODUCTS_LIMIT]
        top_by_stock = sorted(summaries, key=lambda s: s["totalStock"], reverse=True)[:TOP_PRODUCTS_LIMIT]

        return {
            "productsTotal": len(products),
            "productsByStatus": [{"status": status, "count": count} for status, count in status_map.items()],
            "variantsTotal": variants_total,
            "totalStock": total_stock,
            "lowStockThreshold": LOW_STOCK_THRESHOLD,
            "lowStockProducts": low_stock,
            "categoriesTotal": await self._count(Category, Category.company_id == company_id),
            "membersTotal": await self._count(CompanyMembership, CompanyMembership.company_id == company_id),
            "topProductsByStock": top_by_stock,
            "ordersTotal": await self._count(Order, in_company),
            "ordersAwaitingPayment": await self._count(Order, in_company, Order.status == "awaiting_payment"),
            "ordersPaid": await self._count(Order, in_company, Order.status == "paid"),
            "ordersOpen": await self._count(Order, in_company, Order.status.in_(OPEN_STATUSES)),
            "ordersWhatsapp": await self._count(Order, in_company, Order.channel == "whatsapp"),
            "ordersInStore": await self._count(Order, in_company, Order.channel == "in_store"),
            "revenueTotal": await self._revenue(in_company),
            "revenueWhatsapp": await self._revenue(in_company, Order.channel == "whatsapp"),
            "revenueInStore": await self._revenue(in_company, Order.channel == "in_store"),
        }

    async def get_platform_stats(self, role: str) -> dict[str, Any]:
        if role != "admin":
            raise forbidden("Solo administradores de plataforma")
        since = utcnow().replace(hour=0, minute=0, second=0, microsecond=0) - timedelta(days=29)
        not_admin = User.role != "admin"

        companies_created = (
            await self.session.scalars(
                select(Company.created_at).where(Company.created_at >= since).order_by(Company.created_at)
            )
        ).all()
        users_created = (
            await self.session.scalars(
                select(User.created_at).where(not_admin, User.created_at >= since).order_by(User.created_at)
            )
        ).all()

        members_count = (
            select(func.count(CompanyMembership.id))
            .where(CompanyMembership.company_id == Company.id)
            .scalar_subquery()
        )
        products_count = (
            select(func.count(Product.id)).where(Product.company_id == Company.id).scalar_subquery()
        )
        recent = (
            await self.session.execute(
                select(Company, User.name, User.email, members_count, products_count)
                .join(User, User.id == Company.owner_id)
                .order_by(Company.created_at.desc())
                .limit(RECENT_COMPANIES_LIMIT)
            )
        ).all()

        return {
            "companiesTotal": await self._count(Company),
            "usersTotal": await self._count(User, not_admin),
            "productsTotal": await self._count(Product),
            "membershipsTotal": await self._count(CompanyMembership),
            "companiesLast30Days": to_daily_series(list(companies_created), since),
            "usersLast30Days": to_daily_series(list(users_created), since),
            "recentCompanies": [
                {
                    "id": company.id,
                    "name": company.name,
                    "type": company.type,
                    "ownerName": owner_name,
                    "ownerEmail": owner_email,
                    "membersCount": members,
                    "productsCount": product_total,
                    "createdAt": iso(company.created_at),
                }
                for company, owner_name, owner_email, members, product_total in recent
            ],
        }
