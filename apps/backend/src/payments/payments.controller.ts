import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Put,
  Query,
  Res,
} from "@nestjs/common";
import type { ApiResponse, CompanyPaymentsSettings } from "@commerce-ai/types";
import type { Response } from "express";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { UpsertMercadoPagoConnectionDto } from "./dto/mercadopago-connection.dto";
import { MercadoPagoConnectionService } from "./mercadopago-connection.service";
import { MercadoPagoWebhookService } from "./mercadopago-webhook.service";

type MercadoPagoWebhookBody = {
  type?: string;
  action?: string;
  data?: { id?: string | number };
  resource?: string;
  topic?: string;
  id?: string | number;
};

@Controller("payments/mercadopago")
export class PaymentsController {
  constructor(
    private readonly webhookService: MercadoPagoWebhookService,
    private readonly connectionService: MercadoPagoConnectionService,
  ) {}

  @Roles("owner")
  @Get("connection")
  async getConnection(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<CompanyPaymentsSettings>> {
    return {
      status: "success",
      data: await this.connectionService.getConnection(user.companyId),
    };
  }

  @Roles("owner")
  @Post("oauth/start")
  async oauthStart(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<{ authorizationUrl: string }>> {
    return {
      status: "success",
      data: this.connectionService.buildOAuthStartUrl(user.companyId, user.id),
    };
  }

  @Public()
  @Get("oauth/callback")
  async oauthCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const { redirectUrl } = await this.connectionService.handleOAuthCallback({
      code,
      state,
      error,
    });
    res.redirect(302, redirectUrl);
  }

  @Roles("owner")
  @Put("connection")
  async upsertConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertMercadoPagoConnectionDto,
  ): Promise<ApiResponse<CompanyPaymentsSettings>> {
    return {
      status: "success",
      data: await this.connectionService.upsertManual(user.companyId, {
        accessToken: dto.accessToken,
        publicKey: dto.publicKey,
      }),
      message: "Mercado Pago conectado",
    };
  }

  @Roles("owner")
  @Delete("connection")
  async disconnect(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<null>> {
    await this.connectionService.disconnect(user.companyId);
    return {
      status: "success",
      data: null,
      message: "Mercado Pago desconectado. WhatsApp quedó desactivado hasta reconectar pagos.",
    };
  }

  /** Webhook moderno (JSON) + IPN por query. */
  @Public()
  @Post("webhook")
  @HttpCode(200)
  async webhookPost(
    @Query("topic") topic?: string,
    @Query("id") id?: string,
    @Query("type") type?: string,
    @Query("data.id") dataIdQuery?: string,
    @Query("companyId") companyId?: string,
    @Query("pendingId") pendingId?: string,
    @Query("purpose") purpose?: string,
    @Body() body?: MercadoPagoWebhookBody,
  ): Promise<{ ok: true }> {
    await this.dispatchWebhook({
      topic,
      id,
      type,
      dataIdQuery,
      companyId,
      pendingId,
      purpose,
      body,
    });
    return { ok: true };
  }

  /** Algunos flujos IPN usan GET. */
  @Public()
  @Get("webhook")
  @HttpCode(200)
  async webhookGet(
    @Query("topic") topic?: string,
    @Query("id") id?: string,
    @Query("type") type?: string,
    @Query("data.id") dataIdQuery?: string,
    @Query("companyId") companyId?: string,
    @Query("pendingId") pendingId?: string,
    @Query("purpose") purpose?: string,
  ): Promise<{ ok: true }> {
    await this.dispatchWebhook({
      topic,
      id,
      type,
      dataIdQuery,
      companyId,
      pendingId,
      purpose,
    });
    return { ok: true };
  }

  private async dispatchWebhook(params: {
    topic?: string;
    id?: string;
    type?: string;
    dataIdQuery?: string;
    companyId?: string;
    pendingId?: string;
    purpose?: string;
    body?: MercadoPagoWebhookBody;
  }): Promise<void> {
    const body = params.body;
    const eventType = (
      body?.type ||
      body?.topic ||
      params.type ||
      params.topic ||
      ""
    ).toLowerCase();
    const resourceId = this.resolveResourceId(params);

    const isSubscriptionPurpose = params.purpose === "subscription";
    const isPreapproval =
      eventType === "subscription_preapproval" || eventType.includes("preapproval");
    const isAuthorizedPayment =
      eventType === "subscription_authorized_payment" ||
      eventType.includes("authorized_payment");
    const isPayment = eventType === "payment" || params.topic === "payment" || !eventType;

    if (isPreapproval && resourceId) {
      await this.webhookService.handleSubscriptionPreapprovalNotification(resourceId);
      return;
    }

    if ((isAuthorizedPayment || isSubscriptionPurpose || isPayment) && isSubscriptionPurpose) {
      if (params.pendingId?.trim()) {
        await this.webhookService.handleSubscriptionNotification(
          resourceId,
          params.companyId,
          params.pendingId.trim(),
        );
        return;
      }
      await this.webhookService.handleSubscriptionNotification(resourceId, params.companyId);
      return;
    }

    if (isAuthorizedPayment && resourceId) {
      await this.webhookService.handleSubscriptionNotification(resourceId, params.companyId);
      return;
    }

    await this.webhookService.handlePaymentNotification(resourceId, params.companyId);
  }

  private resolveResourceId(params: {
    topic?: string;
    id?: string;
    type?: string;
    dataIdQuery?: string;
    body?: MercadoPagoWebhookBody;
  }): string | null {
    const body = params.body;
    const fromBody =
      body?.data?.id ??
      body?.id ??
      (typeof body?.resource === "string" ? body.resource.split("/").pop() : undefined);
    const candidate = params.dataIdQuery || params.id || fromBody;

    if (candidate == null || candidate === "") {
      return null;
    }
    return String(candidate);
  }
}
