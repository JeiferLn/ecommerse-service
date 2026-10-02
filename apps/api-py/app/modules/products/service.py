import contextlib
import math
from decimal import Decimal
from typing import Any

from sqlalchemy import exists, func, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.errors import bad_request, conflict, not_found
from app.core.ids import iso
from app.core.numbers import num, num_or_none
from app.core.storage import get_storage
from app.core.text import detect_image_mime
from app.core.validation import is_unique_violation
from app.models import Category, Product, ProductImage, ProductVariant
from app.modules.billing.service import BillingService
from app.modules.categories.service import category_dto

DUPLICATE_SKU = "Ya existe una variante con ese SKU en el producto"
ALLOWED_IMAGE_MIMES = ("image/jpeg", "image/png", "image/webp", "image/gif")
UNSET: Any = object()


def _require_company(company_id: str | None) -> str:
    if not company_id:
        raise bad_request("No perteneces a una empresa")
    return company_id


def variant_dto(variant: ProductVariant) -> dict[str, Any]:
    attributes = variant.attributes if isinstance(variant.attributes, dict) else None
    return {
        "id": variant.id,
        "sku": variant.sku,
        "name": variant.name,
        "price": num(variant.price),
        "compareAtPrice": num_or_none(variant.compare_at_price),
        "stock": variant.stock,
        "attributes": attributes,
        "createdAt": iso(variant.created_at),
        "updatedAt": iso(variant.updated_at),
    }


def image_dto(image: ProductImage) -> dict[str, Any]:
    return {
        "id": image.id,
        "url": get_storage().browser_url(image.url),
        "key": image.key,
        "alt": image.alt,
        "sortOrder": image.sort_order,
        "createdAt": iso(image.created_at),
    }


def product_details(product: Product) -> dict[str, Any]:
    return {
        "id": product.id,
        "name": product.name,
        "description": product.description,
        "status": product.status,
        "categoryId": product.category_id,
        "category": category_dto(product.category) if product.category else None,
        "variants": [variant_dto(variant) for variant in product.variants],
        "images": [image_dto(image) for image in product.images],
        "createdAt": iso(product.created_at),
        "updatedAt": iso(product.updated_at),
    }


def product_summary(product: Product) -> dict[str, Any]:
    prices = [num(variant.price) for variant in product.variants]
    cover = product.images[0] if product.images else None
    return {
        "id": product.id,
        "name": product.name,
        "description": product.description,
        "status": product.status,
        "categoryId": product.category_id,
        "categoryName": product.category.name if product.category else None,
        "variantsCount": len(product.variants),
        "totalStock": sum(variant.stock for variant in product.variants),
        "minPrice": min(prices) if prices else None,
        "coverImageUrl": get_storage().browser_url(cover.url) if cover else None,
        "createdAt": iso(product.created_at),
        "updatedAt": iso(product.updated_at),
    }


def _new_variant(data: Any) -> ProductVariant:
    return ProductVariant(
        sku=data.sku.strip(),
        name=data.name.strip(),
        price=Decimal(data.price),
        compare_at_price=None if data.compare_at_price is None else Decimal(data.compare_at_price),
        stock=data.stock if data.stock is not None else 0,
    )


class ProductsService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def list_products(
        self,
        company_id: str | None,
        *,
        q: str | None,
        category_id: str | None,
        status: str | None,
        page: int,
        per_page: int,
    ) -> dict[str, Any]:
        scoped = _require_company(company_id)
        conditions: list[Any] = [Product.company_id == scoped]
        if category_id:
            conditions.append(Product.category_id == category_id)
        if status:
            conditions.append(Product.status == status)
        if q:
            pattern = f"%{q}%"
            conditions.append(
                or_(
                    Product.name.ilike(pattern),
                    Product.description.ilike(pattern),
                    exists().where(
                        ProductVariant.product_id == Product.id, ProductVariant.sku.ilike(pattern)
                    ),
                )
            )

        total = await self.session.scalar(select(func.count(Product.id)).where(*conditions)) or 0
        products = (
            await self.session.scalars(
                select(Product)
                .where(*conditions)
                .options(
                    selectinload(Product.category),
                    selectinload(Product.variants),
                    selectinload(Product.images),
                )
                .order_by(Product.updated_at.desc())
                .offset((page - 1) * per_page)
                .limit(per_page)
            )
        ).all()
        return {
            "items": [product_summary(product) for product in products],
            "page": page,
            "perPage": per_page,
            "total": total,
            "totalPages": max(1, math.ceil(total / per_page)),
        }

    async def get_by_id(self, company_id: str | None, product_id: str) -> dict[str, Any]:
        return product_details(await self._find_owned_product(company_id, product_id))

    async def create(self, company_id: str | None, data: Any) -> dict[str, Any]:
        scoped = _require_company(company_id)
        billing = BillingService(self.session)
        await billing.assert_can(scoped, "create_product")
        await self._assert_category(scoped, data.category_id)

        variants = [_new_variant(variant) for variant in data.variants] if data.variants else []
        if not variants:
            variants = [ProductVariant(sku="DEFAULT", name="Default", price=Decimal(0), stock=0)]
        # La primera variante del producto nuevo cuenta como create_product; extras como variantes.
        for _ in variants[1:]:
            await billing.assert_can(scoped, "create_variant")
        self._assert_unique_skus([variant.sku for variant in variants])

        product = Product(
            company_id=scoped,
            name=data.name.strip(),
            description=(data.description or "").strip() or None,
            category_id=data.category_id or None,
            status=data.status or "draft",
        )
        self.session.add(product)
        await self.session.flush()
        for variant in variants:
            variant.product_id = product.id
            self.session.add(variant)
        await self._commit_or_conflict(DUPLICATE_SKU)
        return await self.get_by_id(scoped, product.id)

    async def update(self, company_id: str | None, product_id: str, data: Any) -> dict[str, Any]:
        scoped = _require_company(company_id)
        product = await self._find_owned_product(scoped, product_id)
        fields = data.model_fields_set
        if "category_id" in fields:
            await self._assert_category(scoped, data.category_id)
        if "name" in fields and data.name is not None:
            product.name = data.name.strip()
        if "description" in fields:
            product.description = (data.description or "").strip() or None
        if "category_id" in fields:
            product.category_id = data.category_id or None
        if "status" in fields and data.status is not None:
            product.status = data.status
        await self.session.commit()
        return await self.get_by_id(scoped, product_id)

    async def remove(self, company_id: str | None, product_id: str) -> None:
        product = await self._find_owned_product(company_id, product_id)
        storage = get_storage()
        for image in product.images:
            # Continuar aunque falle el borrado remoto
            with contextlib.suppress(Exception):
                await storage.delete_object(image.key)
        await self.session.delete(product)
        await self.session.commit()

    async def add_variant(self, company_id: str | None, product_id: str, data: Any) -> dict[str, Any]:
        scoped = _require_company(company_id)
        await BillingService(self.session).assert_can(scoped, "create_variant")
        await self._find_owned_product(company_id, product_id)
        variant = _new_variant(data)
        variant.product_id = product_id
        self.session.add(variant)
        await self._commit_or_conflict(DUPLICATE_SKU)
        return variant_dto(variant)

    async def update_variant(
        self, company_id: str | None, product_id: str, variant_id: str, data: Any
    ) -> dict[str, Any]:
        variant = await self._find_owned_variant(company_id, product_id, variant_id)
        fields = data.model_fields_set
        if "sku" in fields and data.sku is not None:
            variant.sku = data.sku.strip()
        if "name" in fields and data.name is not None:
            variant.name = data.name.strip()
        if "price" in fields and data.price is not None:
            variant.price = Decimal(data.price)
        if "compare_at_price" in fields:
            variant.compare_at_price = (
                None if data.compare_at_price is None else Decimal(data.compare_at_price)
            )
        if "stock" in fields and data.stock is not None:
            variant.stock = data.stock
        await self._commit_or_conflict(DUPLICATE_SKU)
        return variant_dto(variant)

    async def remove_variant(self, company_id: str | None, product_id: str, variant_id: str) -> None:
        product = await self._find_owned_product(company_id, product_id)
        variant = await self._find_owned_variant(company_id, product_id, variant_id)
        if len(product.variants) <= 1:
            raise bad_request("El producto debe tener al menos una variante")
        await self.session.delete(variant)
        await self.session.commit()

    async def update_stock(
        self,
        company_id: str | None,
        product_id: str,
        variant_id: str,
        *,
        stock: int | None,
        delta: int | None,
    ) -> dict[str, Any]:
        variant = await self._find_owned_variant(company_id, product_id, variant_id)
        if stock is None and delta is None:
            raise bad_request("Indica stock o delta")
        next_stock = stock if stock is not None else variant.stock + (delta or 0)
        if next_stock < 0:
            raise bad_request("El stock no puede quedar negativo")
        variant.stock = next_stock
        await self.session.commit()
        return variant_dto(variant)

    async def add_image(
        self,
        company_id: str | None,
        product_id: str,
        *,
        file_name: str | None,
        body: bytes | None,
        alt: str | None,
    ) -> dict[str, Any]:
        product = await self._find_owned_product(company_id, product_id)
        scoped = _require_company(company_id)
        if not body:
            raise bad_request("Debes subir una imagen")
        mime = detect_image_mime(body)
        if not mime or mime not in ALLOWED_IMAGE_MIMES:
            raise bad_request(
                "Formato de imagen no soportado o archivo inválido (se requiere JPEG, PNG, WebP o GIF)"
            )
        uploaded = await get_storage().upload_product_image(
            company_id=scoped, product_id=product_id, file_name=file_name or "", content_type=mime, body=body
        )
        max_order = max((image.sort_order for image in product.images), default=-1)
        image = ProductImage(
            product_id=product_id,
            url=uploaded.url,
            key=uploaded.key,
            alt=(alt or "").strip() or None,
            sort_order=max_order + 1,
        )
        self.session.add(image)
        await self.session.commit()
        return image_dto(image)

    async def remove_image(self, company_id: str | None, product_id: str, image_id: str) -> None:
        await self._find_owned_product(company_id, product_id)
        image = await self.session.scalar(
            select(ProductImage).where(ProductImage.id == image_id, ProductImage.product_id == product_id)
        )
        if not image:
            raise not_found("Imagen no encontrada")
        with contextlib.suppress(Exception):
            await get_storage().delete_object(image.key)
        await self.session.delete(image)
        await self.session.commit()

    async def reorder_images(
        self, company_id: str | None, product_id: str, image_ids: list[str]
    ) -> list[dict]:
        product = await self._find_owned_product(company_id, product_id)
        if sorted(image.id for image in product.images) != sorted(image_ids):
            raise bad_request(
                "La lista de imágenes no coincide con las del producto. Recarga e inténtalo de nuevo."
            )
        for index, image_id in enumerate(image_ids):
            await self.session.execute(
                update(ProductImage).where(ProductImage.id == image_id).values(sort_order=index)
            )
        await self.session.commit()
        self.session.expunge_all()
        refreshed = await self._find_owned_product(company_id, product_id)
        return [image_dto(image) for image in refreshed.images]

    async def _commit_or_conflict(self, message: str) -> None:
        try:
            await self.session.commit()
        except IntegrityError as error:
            await self.session.rollback()
            if is_unique_violation(error):
                raise conflict(message) from error
            raise

    @staticmethod
    def _assert_unique_skus(skus: list[str]) -> None:
        normalized = [sku.strip().lower() for sku in skus]
        if len(set(normalized)) != len(normalized):
            raise bad_request("Los SKU de las variantes deben ser únicos")

    async def _assert_category(self, company_id: str, category_id: str | None) -> None:
        if not category_id:
            return
        found = await self.session.scalar(
            select(Category.id).where(Category.id == category_id, Category.company_id == company_id)
        )
        if not found:
            raise bad_request("La categoría no pertenece a tu empresa")

    async def _find_owned_product(self, company_id: str | None, product_id: str) -> Product:
        scoped = _require_company(company_id)
        product = await self.session.scalar(
            select(Product)
            .where(Product.id == product_id, Product.company_id == scoped)
            .options(
                selectinload(Product.category),
                selectinload(Product.variants),
                selectinload(Product.images),
            )
            .execution_options(populate_existing=True)
        )
        if not product:
            raise not_found("Producto no encontrado")
        return product

    async def _find_owned_variant(
        self, company_id: str | None, product_id: str, variant_id: str
    ) -> ProductVariant:
        await self._find_owned_product(company_id, product_id)
        variant = await self.session.scalar(
            select(ProductVariant).where(
                ProductVariant.id == variant_id, ProductVariant.product_id == product_id
            )
        )
        if not variant:
            raise not_found("Variante no encontrada")
        return variant
