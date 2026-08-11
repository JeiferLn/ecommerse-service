import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
} from "@nestjs/common";
import type {
  ApiResponse,
  BillingCancelResult,
  BillingCheckoutResult,
  BillingInterval,
  PlanView,
  SubscriptionDetails,
} from "@commerce-ai/types";
import { BILLING_INTERVALS } from "@commerce-ai/types";
import { IsIn } from "class-validator";
import type { Response } from "express";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { BillingService } from "./billing.service";

class CheckoutDto {
  @IsIn(["pro", "business"], { message: "Plan inválido" })
  planCode!: "pro" | "business";

  @IsIn([...BILLING_INTERVALS], { message: "Intervalo inválido" })
  interval!: BillingInterval;
}

@Controller("billing")
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Public()
  @Get("plans")
  async plans(): Promise<ApiResponse<PlanView[]>> {
    return { status: "success", data: await this.billing.listPublicPlans() };
  }

  /**
   * Retorno HTTPS para MP Preapproval en local (API_PUBLIC_URL/ngrok → frontend).
   */
  @Public()
  @Get("mp-return")
  mpReturn(
    @Query("status") status: string | undefined,
    @Query("flow") flow: string | undefined,
    @Res() res: Response,
  ): void {
    res.redirect(
      302,
      this.billing.getFrontendBillingReturnUrl(status ?? "success", flow),
    );
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
      data: await this.billing.checkout(
        user.companyId,
        dto.planCode,
        dto.interval,
        user.id,
      ),
      message: "Checkout iniciado",
    };
  }

  @Roles("owner")
  @HttpCode(HttpStatus.OK)
  @Post("cancel")
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<BillingCancelResult>> {
    return {
      status: "success",
      data: await this.billing.cancelAtPeriodEnd(user.companyId),
      message: "Renovación cancelada; mantienes acceso hasta el fin del periodo",
    };
  }
}
