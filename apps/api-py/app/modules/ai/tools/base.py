import asyncio
from dataclasses import dataclass, field
from typing import Any, Generic, Literal, TypeVar

T = TypeVar("T")

ToolStatus = Literal["success", "not_found", "unavailable", "denied", "error"]


class ToolError(Exception):
    """Error tipado en la capa de herramientas de la aplicación."""

    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


@dataclass
class ToolResult(Generic[T]):
    status: ToolStatus
    data: T | None = None
    error_message: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def is_success(self) -> bool:
        return self.status == "success"


class BaseTool:
    """Clase base para herramientas autorizadas.
    
    Exige company_id obligatorio y aislamiento de tenant estricto.
    """

    tool_name: str = "base"
    default_timeout_seconds: float = 5.0

    def __init__(self, company_id: str) -> None:
        if not company_id or not company_id.strip():
            raise ToolError("MISSING_TENANT", "company_id es obligatorio para ejecutar cualquier herramienta")
        self.company_id = company_id.strip()

    def assert_tenant_access(self, target_company_id: str) -> None:
        """Verifica aislamiento estricto de tenant. Si no coincide, levanta ToolError."""
        if target_company_id != self.company_id:
            raise ToolError(
                "TENANT_MISMATCH",
                f"Aislamiento de tenant violado: la tool pertenece a {self.company_id} pero se invocó con {target_company_id}",
            )
