from decimal import Decimal
from typing import Annotated, Any

from fastapi import APIRouter, File, Form, Query, UploadFile
from pydantic import field_validator

from app.core.db import DbSession
from app.core.errors import ApiError
from app.core.responses import ok
from app.core.schemas import QueryModel, RequestModel
from app.core.security import CurrentUser, require_roles
from app.core.validation import integer, money, one_of, text
from app.models import ProductStatusEnum
from app.modules.products.service import ProductsService

router = APIRouter(prefix="/products", tags=["products"])

MAX_IMAGE_BYTES = 5 * 1024 * 1024
EDITORS = [require_roles("owner", "manager")]

Sku = Annotated[
    str,
    text(
        min_len=1,
        max_len=64,
        min_msg="El SKU es obligatorio",
        max_msg="El SKU no puede exceder 64 caracteres",
    ),
]
VariantName = Annotated[
    str,
    text(
        min_len=1,
        max_len=120,
        min_msg="El nombre de la variante es obligatorio",
        max_msg="El nombre de la variante no puede exceder 120 caracteres",
    ),
]
Price = Annotated[Decimal, money("El precio debe ser un número válido", "El precio no puede ser negativo")]
CompareAtPrice = Annotated[
    Decimal | None,
    money("El precio comparado debe ser un número válido", "El precio comparado no puede ser negativo"),
]
Stock = Annotated[
    int | None, integer("El stock debe ser un entero", minimum=0, min_msg="El stock no puede ser negativo")
]
ProductName = Annotated[
    str,
    text(
        min_len=2,
        max_len=200,
        min_msg="El nombre debe tener al menos 2 caracteres",
        max_msg="El nombre no puede exceder 200 caracteres",
    ),
]
Description = Annotated[str, text(max_len=5000, max_msg="La descripción no puede exceder 5000 caracteres")]
Status = Annotated[str, one_of(ProductStatusEnum.enums, "Estado de producto inválido")]


class VariantBody(RequestModel):
    sku: Sku
    name: VariantName
    price: Price
    compare_at_price: CompareAtPrice = None
    stock: Stock = None


class CreateProductBody(RequestModel):
    name: ProductName
    description: Description | None = None
    category_id: str | None = None
    status: Status | None = None
    variants: list[VariantBody] | None = None


class UpdateProductBody(RequestModel):
    name: ProductName | None = None
    description: Description | None = None
    category_id: str | None = None
    status: Status | None = None


class UpdateVariantBody(RequestModel):
    sku: Sku | None = None
    name: VariantName | None = None
    price: Annotated[
        Decimal | None, money("El precio debe ser un número válido", "El precio no puede ser negativo")
    ] = None
    compare_at_price: CompareAtPrice = None
    stock: Stock = None


class UpdateStockBody(RequestModel):
    stock: Stock = None
    delta: Annotated[int | None, integer("El delta debe ser un entero")] = None


class ReorderImagesBody(RequestModel):
    image_ids: list[str]

    @field_validator("image_ids", mode="before")
    @classmethod
    def _image_ids(cls, value: Any) -> Any:
        if not isinstance(value, list):
            raise ValueError("Debes enviar un listado de imágenes")
        if not value:
            raise ValueError("Debes enviar al menos una imagen")
        if any(not isinstance(item, str) for item in value):
            raise ValueError("Cada id de imagen debe ser texto")
        return value


class ListProductsQuery(QueryModel):
    q: str | None = None
    category_id: str | None = None
    status: Status | None = None
    page: Annotated[
        int, integer("page must be an integer number", minimum=1, min_msg="page must not be less than 1")
    ] = 1
    per_page: Annotated[
        int,
        integer("perPage must be an integer number", minimum=1, min_msg="perPage must not be less than 1"),
    ] = 20


@router.get("")
async def list_products(
    user: CurrentUser, session: DbSession, query: Annotated[ListProductsQuery, Query()]
) -> Any:
    if query.per_page > 100:
        raise ApiError(400, "perPage must not be greater than 100")
    return ok(
        await ProductsService(session).list_products(
            user.company_id,
            q=query.q,
            category_id=query.category_id,
            status=query.status,
            page=query.page,
            per_page=query.per_page,
        )
    )


@router.get("/{product_id}")
async def get_product(product_id: str, user: CurrentUser, session: DbSession) -> Any:
    return ok(await ProductsService(session).get_by_id(user.company_id, product_id))


@router.post("", status_code=201, dependencies=EDITORS)
async def create_product(body: CreateProductBody, user: CurrentUser, session: DbSession) -> Any:
    return ok(await ProductsService(session).create(user.company_id, body))


@router.patch("/{product_id}", dependencies=EDITORS)
async def update_product(
    product_id: str, body: UpdateProductBody, user: CurrentUser, session: DbSession
) -> Any:
    return ok(await ProductsService(session).update(user.company_id, product_id, body))


@router.delete("/{product_id}", dependencies=EDITORS)
async def remove_product(product_id: str, user: CurrentUser, session: DbSession) -> Any:
    await ProductsService(session).remove(user.company_id, product_id)
    return ok(None, "Producto eliminado")


@router.post("/{product_id}/variants", status_code=201, dependencies=EDITORS)
async def add_variant(product_id: str, body: VariantBody, user: CurrentUser, session: DbSession) -> Any:
    return ok(await ProductsService(session).add_variant(user.company_id, product_id, body))


@router.patch("/{product_id}/variants/{variant_id}", dependencies=EDITORS)
async def update_variant(
    product_id: str, variant_id: str, body: UpdateVariantBody, user: CurrentUser, session: DbSession
) -> Any:
    return ok(await ProductsService(session).update_variant(user.company_id, product_id, variant_id, body))


@router.delete("/{product_id}/variants/{variant_id}", dependencies=EDITORS)
async def remove_variant(product_id: str, variant_id: str, user: CurrentUser, session: DbSession) -> Any:
    await ProductsService(session).remove_variant(user.company_id, product_id, variant_id)
    return ok(None, "Variante eliminada")


@router.patch("/{product_id}/variants/{variant_id}/stock", dependencies=EDITORS)
async def update_stock(
    product_id: str, variant_id: str, body: UpdateStockBody, user: CurrentUser, session: DbSession
) -> Any:
    variant = await ProductsService(session).update_stock(
        user.company_id, product_id, variant_id, stock=body.stock, delta=body.delta
    )
    return ok(variant)


@router.post("/{product_id}/images", status_code=201, dependencies=EDITORS)
async def add_image(
    product_id: str,
    user: CurrentUser,
    session: DbSession,
    file: Annotated[UploadFile | None, File()] = None,
    alt: Annotated[str | None, Form()] = None,
) -> Any:
    body = await file.read(MAX_IMAGE_BYTES + 1) if file else None
    if body and len(body) > MAX_IMAGE_BYTES:
        raise ApiError(413, "File too large")
    image = await ProductsService(session).add_image(user.company_id, product_id, body=body, alt=alt)
    return ok(image)


@router.patch("/{product_id}/images/reorder", dependencies=EDITORS)
async def reorder_images(
    product_id: str, body: ReorderImagesBody, user: CurrentUser, session: DbSession
) -> Any:
    return ok(await ProductsService(session).reorder_images(user.company_id, product_id, body.image_ids))


@router.delete("/{product_id}/images/{image_id}", dependencies=EDITORS)
async def remove_image(product_id: str, image_id: str, user: CurrentUser, session: DbSession) -> Any:
    await ProductsService(session).remove_image(user.company_id, product_id, image_id)
    return ok(None, "Imagen eliminada")
