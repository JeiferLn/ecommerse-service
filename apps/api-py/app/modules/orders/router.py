from typing import Annotated, Any

from fastapi import APIRouter, Query
from pydantic import BeforeValidator

from app.core.db import DbSession
from app.core.errors import ApiError
from app.core.responses import ok
from app.core.schemas import QueryModel, RequestModel
from app.core.security import CurrentUser, require_roles
from app.core.validation import integer, one_of, string, text
from app.models import InStorePaymentEnum, OrderChannelEnum, OrderStatusEnum
from app.modules.orders.service import OrdersService

router = APIRouter(
    prefix="/orders", tags=["orders"], dependencies=[require_roles("owner", "manager", "user")]
)


def _max(field: str, max_len: int) -> Any:
    return text(max_len=max_len, max_msg=f"{field} must be shorter than or equal to {max_len} characters")


def _str(field: str) -> Any:
    return string(f"{field} must be a string")


CustomerName = Annotated[Annotated[str, _max("customerName", 120)] | None, _str("customerName")]
CustomerPhone = Annotated[Annotated[str, _max("customerPhone", 40)] | None, _str("customerPhone")]
Notes = Annotated[Annotated[str, _max("notes", 500)] | None, _str("notes")]
ShippingName = Annotated[Annotated[str, _max("shippingName", 120)] | None, _str("shippingName")]
ShippingPhone = Annotated[Annotated[str, _max("shippingPhone", 40)] | None, _str("shippingPhone")]
ShippingAddress = Annotated[Annotated[str, _max("shippingAddress", 240)] | None, _str("shippingAddress")]
ShippingCity = Annotated[Annotated[str, _max("shippingCity", 120)] | None, _str("shippingCity")]


def _items_array(value: Any) -> Any:
    if not isinstance(value, list):
        raise ValueError("items must be an array")
    if not value:
        raise ValueError("items must contain at least 1 elements")
    return value


VariantId = Annotated[str, string("variantId must be a string")]
OrderStatus = Annotated[str, one_of(OrderStatusEnum.enums, "Estado de pedido inválido")]


class InStoreSaleItemBody(RequestModel):
    variant_id: VariantId
    quantity: Annotated[
        int,
        integer("quantity must be an integer number", minimum=1, min_msg="quantity must not be less than 1"),
    ]


class CreateInStoreSaleBody(RequestModel):
    items: Annotated[list[InStoreSaleItemBody], BeforeValidator(_items_array)]
    payment_method: Annotated[str, one_of(InStorePaymentEnum.enums, "Método de pago inválido")]
    customer_name: CustomerName = None
    customer_phone: CustomerPhone = None
    notes: Notes = None


class AddCartItemBody(RequestModel):
    variant_id: VariantId
    quantity: Annotated[
        int | None,
        integer("quantity must be an integer number", minimum=1, min_msg="quantity must not be less than 1"),
    ] = 1


class UpdateCartItemBody(RequestModel):
    quantity: Annotated[
        int,
        integer("quantity must be an integer number", minimum=0, min_msg="quantity must not be less than 0"),
    ]


class CheckoutCartBody(RequestModel):
    shipping_name: ShippingName = None
    shipping_phone: ShippingPhone = None
    shipping_address: ShippingAddress = None
    shipping_city: ShippingCity = None
    notes: Notes = None


class UpdateOrderStatusBody(RequestModel):
    status: OrderStatus


class ListOrdersQuery(QueryModel):
    status: OrderStatus | None = None
    channel: Annotated[str, one_of(OrderChannelEnum.enums, "Canal de pedido inválido")] | None = None
    q: str | None = None
    conversation_id: str | None = None
    page: Annotated[
        int, integer("page must be an integer number", minimum=1, min_msg="page must not be less than 1")
    ] = 1
    per_page: Annotated[
        int,
        integer("perPage must be an integer number", minimum=1, min_msg="perPage must not be less than 1"),
    ] = 20


@router.get("")
async def list_orders(
    user: CurrentUser, session: DbSession, query: Annotated[ListOrdersQuery, Query()]
) -> Any:
    if query.per_page > 100:
        raise ApiError(400, "perPage must not be greater than 100")
    return ok(
        await OrdersService(session).list_orders(
            user.company_id,
            status=query.status,
            channel=query.channel,
            q=query.q,
            conversation_id=query.conversation_id,
            page=query.page,
            per_page=query.per_page,
        )
    )


@router.post("/in-store", status_code=201)
async def create_in_store_sale(body: CreateInStoreSaleBody, user: CurrentUser, session: DbSession) -> Any:
    order = await OrdersService(session).create_in_store_sale(
        user.company_id,
        items=[(item.variant_id, item.quantity) for item in body.items],
        payment_method=body.payment_method,
        customer_name=body.customer_name,
        customer_phone=body.customer_phone,
        notes=body.notes,
    )
    return ok(order, "Venta de tienda registrada")


@router.get("/conversations/{conversation_id}/cart")
async def get_cart(conversation_id: str, user: CurrentUser, session: DbSession) -> Any:
    return ok(await OrdersService(session).get_cart_for_conversation(user.company_id, conversation_id))


@router.post("/conversations/{conversation_id}/cart/items", status_code=201)
async def add_cart_item(
    conversation_id: str, body: AddCartItemBody, user: CurrentUser, session: DbSession
) -> Any:
    cart = await OrdersService(session).add_cart_item(
        user.company_id, conversation_id, body.variant_id, body.quantity or 1
    )
    return ok(cart, "Producto agregado al carrito")


@router.patch("/conversations/{conversation_id}/cart/items/{item_id}")
async def update_cart_item(
    conversation_id: str, item_id: str, body: UpdateCartItemBody, user: CurrentUser, session: DbSession
) -> Any:
    return ok(
        await OrdersService(session).update_cart_item(
            user.company_id, conversation_id, item_id, body.quantity
        )
    )


@router.delete("/conversations/{conversation_id}/cart")
async def clear_cart(conversation_id: str, user: CurrentUser, session: DbSession) -> Any:
    return ok(await OrdersService(session).clear_cart(user.company_id, conversation_id), "Carrito vaciado")


@router.post("/conversations/{conversation_id}/checkout", status_code=201)
async def checkout(
    conversation_id: str, body: CheckoutCartBody, user: CurrentUser, session: DbSession
) -> Any:
    order = await OrdersService(session).checkout_conversation(
        user.company_id,
        conversation_id,
        shipping_name=body.shipping_name,
        shipping_phone=body.shipping_phone,
        shipping_address=body.shipping_address,
        shipping_city=body.shipping_city,
        notes=body.notes,
    )
    return ok(order, "Pedido creado")


@router.get("/{order_id}")
async def get_order(order_id: str, user: CurrentUser, session: DbSession) -> Any:
    return ok(await OrdersService(session).get_order(user.company_id, order_id))


@router.patch("/{order_id}/status")
async def update_status(
    order_id: str, body: UpdateOrderStatusBody, user: CurrentUser, session: DbSession
) -> Any:
    order = await OrdersService(session).update_status(user.company_id, order_id, body.status)
    return ok(order, "Estado del pedido actualizado")


@router.post("/{order_id}/cancel", status_code=201, dependencies=[require_roles("owner", "manager")])
async def cancel_order(order_id: str, user: CurrentUser, session: DbSession) -> Any:
    return ok(await OrdersService(session).cancel_order(user.company_id, order_id), "Pedido cancelado")
