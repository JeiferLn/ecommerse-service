import { Injectable, Logger } from "@nestjs/common";

import { OrdersService } from "../orders/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import { TwilioWhatsAppClient } from "../whatsapp/twilio-whatsapp.client";
import { MercadoPagoService } from "./mercadopago.service";

@Injectable()
export class MercadoPagoWebhookService {
  private readonly logger = new Logger(MercadoPagoWebhookService.name);

  constructor(
    private readonly mercadoPago: MercadoPagoService,
    private readonly ordersService: OrdersService,
    private readonly prisma: PrismaService,
    private readonly twilioClient: TwilioWhatsAppClient,
  ) {}

  /**
   * Procesa una notificación de pago de Mercado Pago (webhook o IPN).
   * Siempre responde OK al caller; errores de negocio se loguean.
   */
  async handlePaymentNotification(paymentIdRaw: string | number | null | undefined): Promise<void> {
    if (paymentIdRaw == null || paymentIdRaw === "") {
      this.logger.warn("Webhook MP sin payment id");
      return;
    }

    if (!this.mercadoPago.isConfigured()) {
      this.logger.warn("Webhook MP recibido pero MP_ACCESS_TOKEN no está configurado");
      return;
    }

    const paymentId = String(paymentIdRaw);
    let payment;
    try {
      payment = await this.mercadoPago.getPayment(paymentId);
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

    try {
      const result = await this.ordersService.markPaidFromMercadoPago({
        orderId,
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
