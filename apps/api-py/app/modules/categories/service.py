from typing import Any

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import bad_request, conflict, not_found
from app.core.ids import iso
from app.core.text import slugify
from app.core.validation import is_unique_violation
from app.models import Category

DUPLICATE_MESSAGE = "Ya existe una categoría con ese nombre"


def category_dto(category: Category) -> dict[str, Any]:
    return {
        "id": category.id,
        "name": category.name,
        "slug": category.slug,
        "createdAt": iso(category.created_at),
        "updatedAt": iso(category.updated_at),
    }


def _require_company(company_id: str | None) -> str:
    if not company_id:
        raise bad_request("No perteneces a una empresa")
    return company_id


class CategoriesService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_categories(self, company_id: str | None) -> list[dict[str, Any]]:
        scoped = _require_company(company_id)
        categories = (
            await self.session.scalars(
                select(Category).where(Category.company_id == scoped).order_by(Category.name)
            )
        ).all()
        return [category_dto(category) for category in categories]

    async def create(self, company_id: str | None, name: str) -> dict[str, Any]:
        scoped = _require_company(company_id)
        category = Category(company_id=scoped, name=name.strip(), slug=await self._unique_slug(scoped, name))
        self.session.add(category)
        await self._commit_or_conflict()
        return category_dto(category)

    async def update(self, company_id: str | None, category_id: str, name: str) -> dict[str, Any]:
        scoped = _require_company(company_id)
        category = await self._find_owned(scoped, category_id)
        category.slug = await self._unique_slug(scoped, name, category_id)
        category.name = name.strip()
        await self._commit_or_conflict()
        return category_dto(category)

    async def remove(self, company_id: str | None, category_id: str) -> None:
        scoped = _require_company(company_id)
        category = await self._find_owned(scoped, category_id)
        await self.session.delete(category)
        await self.session.commit()

    async def _commit_or_conflict(self) -> None:
        try:
            await self.session.commit()
        except IntegrityError as error:
            await self.session.rollback()
            if is_unique_violation(error):
                raise conflict(DUPLICATE_MESSAGE) from error
            raise

    async def _find_owned(self, company_id: str, category_id: str) -> Category:
        category = await self.session.scalar(
            select(Category).where(Category.id == category_id, Category.company_id == company_id)
        )
        if not category:
            raise not_found("Categoría no encontrada")
        return category

    async def _unique_slug(self, company_id: str, name: str, exclude_id: str | None = None) -> str:
        base = slugify(name) or "categoria"
        candidate = base
        suffix = 2
        while True:
            query = select(Category.id).where(Category.company_id == company_id, Category.slug == candidate)
            if exclude_id:
                query = query.where(Category.id != exclude_id)
            if not await self.session.scalar(query):
                return candidate
            candidate = f"{base}-{suffix}"
            suffix += 1
