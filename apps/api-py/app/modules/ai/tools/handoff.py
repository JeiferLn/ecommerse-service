from dataclasses import dataclass

from app.modules.ai.tools.base import BaseTool, ToolError, ToolResult


@dataclass
class HandoffToolOutput:
    requested_handoff: bool = True
    reason: str = "general_handoff"


class HandoffTool(BaseTool):
    tool_name = "handoff"

    def execute(
        self,
        *,
        company_id: str,
        reason: str = "general_handoff",
    ) -> ToolResult[HandoffToolOutput]:
        try:
            self.assert_tenant_access(company_id)
        except ToolError as err:
            return ToolResult(status="denied", error_message=err.message)

        return ToolResult(
            status="success",
            data=HandoffToolOutput(requested_handoff=True, reason=reason),
        )
