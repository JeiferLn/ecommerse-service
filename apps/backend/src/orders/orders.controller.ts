import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type {
  ApiResponse,
  CartView,
  OrderDetails,
  OrderSummary,
  PaginatedResponse,
} from "@commerce-ai/types";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AddCartItemDto, CheckoutCartDto, UpdateCartItemDto } from "./dto/cart.dto";
import { ListOrdersQueryDto } from "./dto/list-orders-query.dto";
import { UpdateOrderStatusDto } from "./dto/update-order-status.dto";
import { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Roles("owner", "manager", "user")
  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListOrdersQueryDto,
  ): Promise<ApiResponse<PaginatedResponse<OrderSummary>>> {
    return {
      status: "success",
      data: await this.ordersService.listOrders(user.companyId, query),
    };
  }

  @Roles("owner", "manager", "user")
  @Get("conversations/:conversationId/cart")
  async getCart(
    @CurrentUser() user: AuthenticatedUser,
    @Param("conversationId") conversationId: string,
  ): Promise<ApiResponse<CartView>> {
    return {
      status: "success",
      data: await this.ordersService.getCartForConversation(user.companyId, conversationId),
    };
  }

  @Roles("owner", "manager", "user")
  @Post("conversations/:conversationId/cart/items")
  async addCartItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("conversationId") conversationId: string,
    @Body() dto: AddCartItemDto,
  ): Promise<ApiResponse<CartView>> {
    return {
      status: "success",
      data: await this.ordersService.addCartItem(
        user.companyId,
        conversationId,
        dto.variantId,
        dto.quantity ?? 1,
      ),
      message: "Producto agregado al carrito",
    };
  }

  @Roles("owner", "manager", "user")
  @Patch("conversations/:conversationId/cart/items/:itemId")
  async updateCartItem(
    @CurrentUser() user: AuthenticatedUser,
    @Param("conversationId") conversationId: string,
    @Param("itemId") itemId: string,
    @Body() dto: UpdateCartItemDto,
  ): Promise<ApiResponse<CartView>> {
    return {
      status: "success",
      data: await this.ordersService.updateCartItem(
        user.companyId,
        conversationId,
        itemId,
        dto.quantity,
      ),
    };
  }

  @Roles("owner", "manager", "user")
  @Delete("conversations/:conversationId/cart")
  async clearCart(
    @CurrentUser() user: AuthenticatedUser,
    @Param("conversationId") conversationId: string,
  ): Promise<ApiResponse<CartView>> {
    return {
      status: "success",
      data: await this.ordersService.clearCart(user.companyId, conversationId),
      message: "Carrito vaciado",
    };
  }

  @Roles("owner", "manager", "user")
  @Post("conversations/:conversationId/checkout")
  async checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Param("conversationId") conversationId: string,
    @Body() dto: CheckoutCartDto,
  ): Promise<ApiResponse<OrderDetails>> {
    return {
      status: "success",
      data: await this.ordersService.checkoutConversation(user.companyId, conversationId, dto),
      message: "Pedido creado",
    };
  }

  @Roles("owner", "manager", "user")
  @Get(":id")
  async get(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<ApiResponse<OrderDetails>> {
    return {
      status: "success",
      data: await this.ordersService.getOrder(user.companyId, id),
    };
  }

  @Roles("owner", "manager", "user")
  @Patch(":id/status")
  async updateStatus(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateOrderStatusDto,
  ): Promise<ApiResponse<OrderDetails>> {
    return {
      status: "success",
      data: await this.ordersService.updateStatus(user.companyId, id, dto.status),
      message: "Estado del pedido actualizado",
    };
  }

  @Roles("owner", "manager")
  @Post(":id/cancel")
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<ApiResponse<OrderDetails>> {
    return {
      status: "success",
      data: await this.ordersService.cancelOrder(user.companyId, id),
      message: "Pedido cancelado",
    };
  }
}
