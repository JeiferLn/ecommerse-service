import asyncio
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Company
from app.modules.ai.tools.base import BaseTool, ToolError, ToolResult


@dataclass
class ShippingToolOutput:
    is_configured: bool
    scopes: list[str] = field(default_factory=list)
    carriers: list[str] = field(default_factory=list)
    origin_city: str | None = None
    origin_region: str | None = None
    country_code: str | None = None


class ShippingTool(BaseTool):
    tool_name = "shipping"

    def __init__(self, company_id: str, session: AsyncSession) -> None:
        super().__init__(company_id)
        self.session = session

    async def execute(
        self,
        *,
        company_id: str,
        destination_city: str | None = None,
    ) -> ToolResult[ShippingToolOutput]:
        try:
            self.assert_tenant_access(company_id)
        except ToolError as err:
            return ToolResult(status="denied", error_message=err.message)

        try:
            return await asyncio.wait_for(
                self._execute_query(destination_city=destination_city),
                timeout=self.default_timeout_seconds,
            )
        except TimeoutError:
            return ToolResult(status="error", error_message="Tiempo de espera agotado al consultar envíos")
        except Exception as err:  # noqa: BLE001
            return ToolResult(status="error", error_message=str(err))

    async def _execute_query(self, *, destination_city: str | None) -> ToolResult[ShippingToolOutput]:
        company = await self.session.get(Company, self.company_id)
        if not company:
            return ToolResult(status="not_found", error_message="Empresa no encontrada")

        scopes = list(company.shipping_scopes or [])
        carriers = list(company.shipping_carriers or [])
        is_configured = bool(scopes and carriers)

        if not is_configured:
            return ToolResult(
                status="unavailable",
                data=ShippingToolOutput(is_configured=False),
                error_message="Políticas de envío aún no configuradas por la tienda",
            )

        output = ShippingToolOutput(
            is_configured=True,
            scopes=scopes,
            carriers=carriers,
            origin_city=company.shipping_city,
            origin_region=company.shipping_region,
            country_code=company.country_code,
        )
        return ToolResult(status="success", data=output)
