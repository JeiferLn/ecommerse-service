import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import type { ApiResponse, CheckoutOrderView, CheckoutPaymentStart } from "@commerce-ai/types";

import { Public } from "../common/decorators/public.decorator";
import { CompletePublicCheckoutDto } from "./dto/public-checkout.dto";
import { OrdersService } from "./orders.service";

@Controller("checkout")
export class CheckoutController {
  constructor(private readonly ordersService: OrdersService) {}

  @Public()
  @Get(":token")
  async get(@Param("token") token: string): Promise<ApiResponse<CheckoutOrderView>> {
    return {
      status: "success",
      data: await this.ordersService.getPublicCheckout(token),
    };
  }

  @Public()
  @Post(":token")
  async complete(
    @Param("token") token: string,
    @Body() dto: CompletePublicCheckoutDto,
  ): Promise<ApiResponse<CheckoutPaymentStart>> {
    return {
      status: "success",
      data: await this.ordersService.completePublicCheckout(token, dto),
      message: "Redirigiendo a Mercado Pago para completar el pago.",
    };
  }
}
