import asyncio
from dataclasses import dataclass, field

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.text import fold
from app.models import Product, ProductVariant
from app.modules.ai.catalog_context import expand_synonyms, score_product, tokenize
from app.modules.ai.tools.base import BaseTool, ToolError, ToolResult


@dataclass
class CatalogVariantFact:
    id: str
    name: str
    price: float
    stock: int
    sku: str | None = None


@dataclass
class CatalogProductFact:
    id: str
    name: str
    price: float
    currency: str
    stock: int
    in_stock: bool
    variants: list[CatalogVariantFact] = field(default_factory=list)
    image_urls: list[str] = field(default_factory=list)


@dataclass
class CatalogToolOutput:
    products: list[CatalogProductFact]
    single_product: CatalogProductFact | None
    matched_count: int


class CatalogTool(BaseTool):
    tool_name = "catalog"

    def __init__(self, company_id: str, session: AsyncSession) -> None:
        super().__init__(company_id)
        self.session = session

    async def execute(
        self,
        *,
        company_id: str,
        query: str = "",
        product_id: str | None = None,
    ) -> ToolResult[CatalogToolOutput]:
        try:
            self.assert_tenant_access(company_id)
        except ToolError as err:
            return ToolResult(status="denied", error_message=err.message)

        try:
            return await asyncio.wait_for(
                self._execute_query(query=query, product_id=product_id),
                timeout=self.default_timeout_seconds,
            )
        except TimeoutError:
            return ToolResult(status="error", error_message="Tiempo de espera agotado al consultar el catálogo")
        except Exception as err:  # noqa: BLE001
            return ToolResult(status="error", error_message=str(err))

    async def _execute_query(
        self,
        *,
        query: str,
        product_id: str | None,
    ) -> ToolResult[CatalogToolOutput]:
        stmt = (
            select(Product)
            .where(Product.company_id == self.company_id, Product.status == "active")
            .options(
                selectinload(Product.category),
                selectinload(Product.variants),
                selectinload(Product.images),
            )
            .order_by(Product.updated_at.desc())
        )

        if product_id:
            stmt = stmt.where(Product.id == product_id)

        result = await self.session.execute(stmt)
        products = list(result.scalars().all())

        if not products:
            return ToolResult(status="not_found", data=None, error_message="Producto no encontrado")

        # Filtrar o ordenar por relevancia si hay query de búsqueda
        if query and not product_id:
            tokens = expand_synonyms(tokenize(query))
            if tokens:
                scored = [
                    (p, score_product(p, tokens))
                    for p in products
                ]
                scored.sort(key=lambda item: -item[1])
                matching = [p for p, score in scored if score > 0]
                if matching:
                    products = matching
                else:
                    return ToolResult(status="not_found", data=None, error_message="Ningún producto coincide con la búsqueda")

        facts: list[CatalogProductFact] = []
        for p in products:
            variant_facts = [
                CatalogVariantFact(
                    id=v.id,
                    name=v.name,
                    price=float(v.price),
                    stock=v.stock,
                    sku=v.sku,
                )
                for v in (p.variants or [])
            ]
            total_stock = sum(v.stock for v in variant_facts)
            min_price = min((v.price for v in variant_facts), default=0.0)
            images = [img.url for img in sorted(p.images or [], key=lambda i: i.sort_order)]

            facts.append(
                CatalogProductFact(
                    id=p.id,
                    name=p.name,
                    price=min_price,
                    currency="COP",
                    stock=total_stock,
                    in_stock=total_stock > 0,
                    variants=variant_facts,
                    image_urls=images,
                )
            )

        single = facts[0] if len(facts) == 1 else None
        return ToolResult(
            status="success",
            data=CatalogToolOutput(
                products=facts,
                single_product=single,
                matched_count=len(facts),
            ),
        )
