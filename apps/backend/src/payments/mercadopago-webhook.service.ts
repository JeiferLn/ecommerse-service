import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { PlanCode } from "@commerce-ai/types";

import type { Env } from "../config/env.validation";
import { BillingService } from "../billing/billing.service";
import { OrdersService } from "../orders/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import { TwilioWhatsAppClient } from "../whatsapp/twilio-whatsapp.client";
import { MercadoPagoService } from "./mercadopago.service";

const AMOUNT_TOLERANCE = 0.05;

@Injectable()
export class MercadoPagoWebhookService {
  private readonly logger = new Logger(MercadoPagoWebhookService.name);

  constructor(
    private readonly mercadoPago: MercadoPagoService,
    private readonly ordersService: OrdersService,
    private readonly prisma: PrismaService,
    private readonly twilioClient: TwilioWhatsAppClient,
    private readonly billing: BillingService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Activa plan SaaS tras pago aprobado a la cuenta de plataforma. */
  async handleSubscriptionNotification(
    paymentIdRaw: string | number | null | undefined,
    companyIdHint?: string | null,
  ): Promise<void> {
    if (paymentIdRaw == null || paymentIdRaw === "") {
      this.logger.warn("Webhook MP suscripción sin payment id");
      return;
    }
    const paymentId = String(paymentIdRaw);
    const platformToken = this.config.get("MP_ACCESS_TOKEN", { infer: true })?.trim();
    if (!platformToken) {
      this.logger.warn("MP_ACCESS_TOKEN de plataforma no configurado; no se puede validar suscripción");
      return;
    }

    let payment;
    try {
      payment = await this.mercadoPago.paymentApi(platformToken).get({ id: paymentId });
    } catch (error) {
      this.logger.error(
        `No se pudo consultar pago de suscripción ${paymentId}`,
        error instanceof Error ? error.stack : undefined,
      );
      return;
    }

    if (payment.status !== "approved") {
      this.logger.log(`Suscripción pago ${paymentId} status=${payment.status}`);
      return;
    }

    const external =
      (typeof payment.external_reference === "string" && payment.external_reference.trim()) || "";
    const metaCompany =
      (typeof payment.metadata?.companyId === "string" && payment.metadata.companyId) ||
      companyIdHint?.trim() ||
      null;
    const metaPlan =
      (typeof payment.metadata?.planCode === "string" && payment.metadata.planCode) || null;

    let companyId = metaCompany;
    let planCode = metaPlan as PlanCode | null;

    const match = /^sub:([^:]+):(pro|business)$/.exec(external);
    if (match) {
      companyId = match[1];
      planCode = match[2] as PlanCode;
    }

    if (!companyId || !planCode || (planCode !== "pro" && planCode !== "business")) {
      this.logger.warn(`Pago suscripción ${paymentId} sin company/plan válidos`);
      return;
    }

    await this.billing.handleSubscriptionPaymentApproved(companyId, planCode, paymentId);
    this.logger.log(`Suscripción activada company=${companyId} plan=${planCode}`);
  }

  /**
   * Procesa una notificación de pago de Mercado Pago (webhook o IPN).
   * `companyId` viene en la query del notification_url (por empresa).
   */
  async handlePaymentNotification(
    paymentIdRaw: string | number | null | undefined,
    companyIdHint?: string | null,
  ): Promise<void> {
    if (paymentIdRaw == null || paymentIdRaw === "") {
      this.logger.warn("Webhook MP sin payment id");
      return;
    }

    const paymentId = String(paymentIdRaw);
    let companyId = companyIdHint?.trim() || null;

    if (!companyId) {
      const existing = await this.prisma.order.findFirst({
        where: { mpPaymentId: paymentId },
        select: { companyId: true },
      });
      companyId = existing?.companyId ?? null;
    }

    if (!companyId) {
      this.logger.warn(
        `Pago ${paymentId}: sin companyId en webhook ni pedido previo; no se puede consultar con token del comercio`,
      );
      return;
    }

    let payment;
    try {
      payment = await this.mercadoPago.getPaymentForCompany(companyId, paymentId);
    } catch (error) {
      this.logger.error(
        `No se pudo consultar el pago ${paymentId}`,
        error instanceof Error ? error.stack : undefined,
      );
      return;
    }

    const status = payment.status;
    const orderId =
      (typeof payment.external_reference === "string" && payment.external_reference.trim()) ||
      (typeof payment.metadata?.orderId === "string" && payment.metadata.orderId) ||
      null;

    if (!orderId) {
      this.logger.warn(`Pago ${paymentId} sin external_reference/orderId`);
      return;
    }

    if (status !== "approved") {
      this.logger.log(`Pago ${paymentId} con status=${status}; no se marca paid`);
      return;
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        number: true,
        companyId: true,
        currency: true,
        total: true,
      },
    });
    if (!order) {
      this.logger.warn(`Pago ${paymentId}: pedido ${orderId} no encontrado`);
      return;
    }
    if (order.companyId !== companyId) {
      this.logger.warn(
        `Pago ${paymentId}: companyId del webhook (${companyId}) no coincide con el pedido`,
      );
      return;
    }

    if (!this.amountsMatch(payment, order)) {
      this.logger.error(
        `Pago ${paymentId} rechazado: monto/moneda no coinciden con pedido ${order.number} ` +
          `(MP ${payment.transaction_amount} ${payment.currency_id} vs ${order.total} ${order.currency})`,
      );
      return;
    }

    try {
      const result = await this.ordersService.markPaidFromMercadoPago({
        orderId: order.id,
        mpPaymentId: paymentId,
      });

      if (!result.newlyPaid) {
        this.logger.log(`Pedido ${result.order.number} ya estaba pagado/procesado`);
        return;
      }

      this.logger.log(`Pedido ${result.order.number} marcado como paid (MP ${paymentId})`);
      await this.sendPaymentWhatsApp(result.order);
    } catch (error) {
      this.logger.error(
        `Error al marcar paid el pedido ${orderId}`,
        error instanceof Error ? error.stack : undefined,
      );
    }
  }

  private amountsMatch(
    payment: { transaction_amount?: number | null; currency_id?: string | null },
    order: { total: { toNumber?: () => number } | number; currency: string },
  ): boolean {
    const paidAmount =
      typeof payment.transaction_amount === "number" ? payment.transaction_amount : null;
    const orderTotal =
      typeof order.total === "number"
        ? order.total
        : typeof order.total?.toNumber === "function"
          ? order.total.toNumber()
          : Number(order.total);

    if (paidAmount == null || Number.isNaN(orderTotal)) {
      return false;
    }
    if (Math.abs(paidAmount - orderTotal) > AMOUNT_TOLERANCE) {
      return false;
    }
    const paidCurrency = (payment.currency_id || "").toUpperCase();
    const orderCurrency = (order.currency || "").toUpperCase();
    if (paidCurrency && orderCurrency && paidCurrency !== orderCurrency) {
      return false;
    }
    return true;
  }

  private async sendPaymentWhatsApp(order: {
    number: string;
    companyId: string;
    conversationId: string | null;
    currency: string;
    total: number | { toString(): string };
    items: { productName: string; variantName: string; quantity: number }[];
  }): Promise<void> {
    if (!order.conversationId) {
      return;
    }

    const conversation = await this.prisma.conversation.findFirst({
      where: { id: order.conversationId, companyId: order.companyId },
      include: { waConnection: true },
    });
    if (!conversation?.waConnection?.isActive) {
      this.logger.warn(
        `Pedido ${order.number}: sin conversación/conexión WA activa para confirmar pago`,
      );
      return;
    }

    const text = this.ordersService.formatPaymentConfirmedWhatsAppMessage({
      number: order.number,
      currency: order.currency,
      total: Number(order.total),
      items: order.items,
    });
    let wamid: string | null = null;
    let status: "sent" | "failed" = "sent";

    try {
      const result = await this.twilioClient.sendText({
        from: conversation.waConnection.twilioWhatsAppNumber,
        to: conversation.customerWaId,
        text,
      });
      wamid = result.wamid;
    } catch (error) {
      status = "failed";
      this.logger.warn(
        `Pedido ${order.number} pagado pero falló WhatsApp: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "outbound",
        wamid,
        type: "text",
        body: text,
        status,
      },
    });
    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });
  }
}
