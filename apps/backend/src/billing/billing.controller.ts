import { BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post } from "@nestjs/common";
import type {
  ApiResponse,
  BillingCheckoutResult,
  PlanView,
  SubscriptionDetails,
} from "@commerce-ai/types";
import { IsIn } from "class-validator";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { BillingService } from "./billing.service";

class CheckoutDto {
  @IsIn(["pro", "business"], { message: "Plan inválido" })
  planCode!: "pro" | "business";
}

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get("plans")
  async plans(): Promise<ApiResponse<PlanView[]>> {
    return { status: "success", data: await this.billing.listPublicPlans() };
  }

  @Roles("owner", "manager", "user")
  @Get("subscription")
  async subscription(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<SubscriptionDetails>> {
    if (!user.companyId) {
      throw new BadRequestException("Selecciona una empresa activa");
    }
    return {
      status: "success",
      data: await this.billing.getSubscriptionDetails(user.companyId),
    };
  }

  @Roles("owner")
  @HttpCode(HttpStatus.OK)
  @Post("checkout")
  async checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CheckoutDto,
  ): Promise<ApiResponse<BillingCheckoutResult>> {
    return {
      status: "success",
      data: await this.billing.checkout(user.companyId, dto.planCode),
      message: "Checkout iniciado",
    };
  }
}
