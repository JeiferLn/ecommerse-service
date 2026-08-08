import { Body, Controller, Get, HttpCode, Post, Query } from "@nestjs/common";

import { Public } from "../common/decorators/public.decorator";
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
  constructor(private readonly webhookService: MercadoPagoWebhookService) {}

  /** Webhook moderno (JSON) + IPN por query. */
  @Public()
  @Post("webhook")
  @HttpCode(200)
  async webhookPost(
    @Query("topic") topic?: string,
    @Query("id") id?: string,
    @Query("type") type?: string,
    @Query("data.id") dataIdQuery?: string,
    @Body() body?: MercadoPagoWebhookBody,
  ): Promise<{ ok: true }> {
    const paymentId = this.resolvePaymentId({
      topic,
      id,
      type,
      dataIdQuery,
      body,
    });
    await this.webhookService.handlePaymentNotification(paymentId);
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
  ): Promise<{ ok: true }> {
    const paymentId = this.resolvePaymentId({
      topic,
      id,
      type,
      dataIdQuery,
    });
    await this.webhookService.handlePaymentNotification(paymentId);
    return { ok: true };
  }

  private resolvePaymentId(params: {
    topic?: string;
    id?: string;
    type?: string;
    dataIdQuery?: string;
    body?: MercadoPagoWebhookBody;
  }): string | null {
    const body = params.body;
    const bodyType = body?.type || body?.topic || params.type || params.topic;
    const fromBody =
      body?.data?.id ??
      body?.id ??
      (typeof body?.resource === "string" ? body.resource.split("/").pop() : undefined);
    const candidate = params.dataIdQuery || params.id || fromBody;

    if (bodyType && bodyType !== "payment" && params.topic && params.topic !== "payment") {
      // Aun así, si hay id numérico típico de pago, lo intentamos.
      if (candidate == null) {
        return null;
      }
    }

    if (candidate == null || candidate === "") {
      return null;
    }
    return String(candidate);
  }
}
