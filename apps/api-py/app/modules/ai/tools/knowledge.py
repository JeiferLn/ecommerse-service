import asyncio
from dataclasses import dataclass, field

from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.ai.tools.base import BaseTool, ToolError, ToolResult
from app.modules.knowledge.retrieval import RetrievedChunk, retrieve


@dataclass
class KnowledgeToolOutput:
    rag_block: str
    chunks: list[RetrievedChunk] = field(default_factory=list)
    count: int = 0


class KnowledgeTool(BaseTool):
    tool_name = "knowledge"

    def __init__(self, company_id: str, session: AsyncSession) -> None:
        super().__init__(company_id)
        self.session = session

    async def execute(
        self,
        *,
        company_id: str,
        query: str,
    ) -> ToolResult[KnowledgeToolOutput]:
        try:
            self.assert_tenant_access(company_id)
        except ToolError as err:
            return ToolResult(status="denied", error_message=err.message)

        try:
            return await asyncio.wait_for(
                self._execute_retrieval(query=query),
                timeout=self.default_timeout_seconds,
            )
        except TimeoutError:
            return ToolResult(status="error", error_message="Tiempo de espera agotado al consultar documentos")
        except Exception as err:  # noqa: BLE001
            return ToolResult(status="error", error_message=str(err))

    async def _execute_retrieval(self, *, query: str) -> ToolResult[KnowledgeToolOutput]:
        rag_block, chunks = await retrieve(self.session, self.company_id, query)
        if not chunks:
            return ToolResult(
                status="unavailable",
                data=KnowledgeToolOutput(rag_block="", chunks=[]),
                error_message="No se encontraron documentos relevantes para esta consulta",
            )
        return ToolResult(
            status="success",
            data=KnowledgeToolOutput(rag_block=rag_block, chunks=chunks, count=len(chunks)),
        )
