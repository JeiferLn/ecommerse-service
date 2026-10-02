from typing import Annotated, Any

from fastapi import APIRouter
from pydantic import BeforeValidator

from app.core.db import DbSession
from app.core.responses import ok
from app.core.schemas import MissingText, RequestModel
from app.core.validation import string, text
from app.modules.orders.service import OrdersService

router = APIRouter(prefix="/checkout", tags=["checkout"])


def _field(name: str, min_len: int, max_len: int) -> Any:
    return text(
        min_len=min_len,
        max_len=max_len,
        min_msg=f"{name} must be longer than or equal to {min_len} characters",
        max_msg=f"{name} must be shorter than or equal to {max_len} characters",
    )


def _js_boolean(value: Any) -> Any:
    """`@Type(() => Boolean)`: cualquier valor "truthy" de JS se vuelve `true`."""
    if value is None or isinstance(value, MissingText):
        raise ValueError("confirmPayment must be a boolean value")
    if isinstance(value, bool):
        return value
    return value not in ("", 0)


class CompletePublicCheckoutBody(RequestModel):
    shipping_name: Annotated[str, string("shippingName must be a string"), _field("shippingName", 2, 120)]
    shipping_phone: Annotated[str, string("shippingPhone must be a string"), _field("shippingPhone", 5, 40)]
    shipping_address: Annotated[
        str, string("shippingAddress must be a string"), _field("shippingAddress", 5, 240)
    ]
    shipping_country: Annotated[
        str, string("shippingCountry must be a string"), _field("shippingCountry", 2, 80)
    ]
    shipping_region: Annotated[
        str, string("shippingRegion must be a string"), _field("shippingRegion", 2, 120)
    ]
    shipping_city: Annotated[str, string("shippingCity must be a string"), _field("shippingCity", 2, 120)]
    confirm_payment: Annotated[bool, BeforeValidator(_js_boolean)]


@router.get("/{token}")
async def get_checkout(token: str, session: DbSession) -> Any:
    return ok(await OrdersService(session).get_public_checkout(token))


@router.post("/{token}", status_code=201)
async def complete_checkout(token: str, body: CompletePublicCheckoutBody, session: DbSession) -> Any:
    result = await OrdersService(session).complete_public_checkout(
        token,
        shipping_name=body.shipping_name,
        shipping_phone=body.shipping_phone,
        shipping_address=body.shipping_address,
        shipping_country=body.shipping_country,
        shipping_region=body.shipping_region,
        shipping_city=body.shipping_city,
        confirm_payment=body.confirm_payment,
    )
    return ok(result, "Redirigiendo a Mercado Pago para completar el pago.")
