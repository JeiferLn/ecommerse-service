from dataclasses import dataclass, field
from enum import StrEnum
from typing import Any


class IntentType(StrEnum):
    GREETING = "GREETING"
    PRODUCT_SEARCH = "PRODUCT_SEARCH"
    PRODUCT_PRICE = "PRODUCT_PRICE"
    PRODUCT_STOCK = "PRODUCT_STOCK"
    PRODUCT_VARIANT = "PRODUCT_VARIANT"
    PRODUCT_COMPARISON = "PRODUCT_COMPARISON"
    ORDER_STATUS = "ORDER_STATUS"
    SHIPPING = "SHIPPING"
    RETURNS = "RETURNS"
    FAQ = "FAQ"
    COMPLAINT = "COMPLAINT"
    HUMAN_HANDOFF = "HUMAN_HANDOFF"
    GENERAL_SALES = "GENERAL_SALES"
    OFF_TOPIC = "OFF_TOPIC"
    INJECTION = "INJECTION"
    UNKNOWN = "UNKNOWN"


@dataclass
class RouteDecision:
    intent: IntentType
    confidence: float
    entities: dict[str, Any] = field(default_factory=dict)
    allowed_tools: list[str] = field(default_factory=list)
    requires_llm: bool = False
    fallback_id: str = "default"
    reason_code: str = "DEFAULT"
