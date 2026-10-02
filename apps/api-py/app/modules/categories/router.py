from typing import Annotated, Any

from fastapi import APIRouter

from app.core.db import DbSession
from app.core.responses import ok
from app.core.schemas import RequestModel
from app.core.security import CurrentUser, require_roles
from app.core.validation import text
from app.modules.categories.service import CategoriesService

router = APIRouter(prefix="/categories", tags=["categories"])

CategoryName = Annotated[
    str,
    text(
        min_len=2,
        max_len=100,
        min_msg="El nombre debe tener al menos 2 caracteres",
        max_msg="El nombre no puede exceder 100 caracteres",
    ),
]


class CategoryBody(RequestModel):
    name: CategoryName


@router.get("")
async def list_categories(user: CurrentUser, session: DbSession) -> Any:
    return ok(await CategoriesService(session).list_categories(user.company_id))


@router.post("", status_code=201, dependencies=[require_roles("owner", "manager")])
async def create_category(body: CategoryBody, user: CurrentUser, session: DbSession) -> Any:
    return ok(await CategoriesService(session).create(user.company_id, body.name))


@router.patch("/{category_id}", dependencies=[require_roles("owner", "manager")])
async def update_category(category_id: str, body: CategoryBody, user: CurrentUser, session: DbSession) -> Any:
    return ok(await CategoriesService(session).update(user.company_id, category_id, body.name))


@router.delete("/{category_id}", dependencies=[require_roles("owner", "manager")])
async def remove_category(category_id: str, user: CurrentUser, session: DbSession) -> Any:
    await CategoriesService(session).remove(user.company_id, category_id)
    return ok(None, "Categoría eliminada")
