import asyncio
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import Order
from app.modules.ai.tools.base import BaseTool, ToolError, ToolResult


@dataclass
class OrderToolOutput:
    order_number: str
    status: str
    total: str
    currency: str
    items_count: int


class OrdersTool(BaseTool):
    tool_name = "orders"

    def __init__(self, company_id: str, session: AsyncSession) -> None:
        super().__init__(company_id)
        self.session = session

    async def execute(
        self,
        *,
        company_id: str,
        order_number: str | None = None,
        customer_phone: str | None = None,
    ) -> ToolResult[OrderToolOutput]:
        try:
            self.assert_tenant_access(company_id)
        except ToolError as err:
            return ToolResult(status="denied", error_message=err.message)

        if not order_number and not customer_phone:
            return ToolResult(
                status="unavailable",
                data=None,
                error_message="Se requiere un número de pedido o teléfono del cliente",
            )

        try:
            return await asyncio.wait_for(
                self._execute_query(order_number=order_number, customer_phone=customer_phone),
                timeout=self.default_timeout_seconds,
            )
        except TimeoutError:
            return ToolResult(status="error", error_message="Tiempo de espera agotado al consultar el pedido")
        except Exception as err:  # noqa: BLE001
            return ToolResult(status="error", error_message=str(err))

    async def _execute_query(
        self,
        *,
        order_number: str | None,
        customer_phone: str | None,
    ) -> ToolResult[OrderToolOutput]:
        stmt = (
            select(Order)
            .where(Order.company_id == self.company_id)
            .options(selectinload(Order.items))
            .order_by(Order.created_at.desc())
        )

        if order_number:
            clean_num = order_number.lstrip("#").strip()
            stmt = stmt.where(Order.number == clean_num)
        elif customer_phone:
            stmt = stmt.where(Order.customer_wa_id == customer_phone)

        result = await self.session.execute(stmt)
        order = result.scalars().first()

        if not order:
            return ToolResult(status="not_found", data=None, error_message="Pedido no encontrado")

        output = OrderToolOutput(
            order_number=order.number,
            status=order.status,
            total=str(order.total),
            currency=order.currency or "COP",
            items_count=len(order.items or []),
        )
        return ToolResult(status="success", data=output)
