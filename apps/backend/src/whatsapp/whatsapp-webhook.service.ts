import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";

import type { Env } from "../config/env.validation";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { AiReplyService } from "../ai/ai-reply.service";
import { resolveOrderChatIntent, detectsAffirmativeCartConfirm, botOfferedAddToCart } from "../orders/order-intent";
import { OrdersService } from "../orders/orders.service";
import { detectsBotChoice, detectsHumanRequest, extractResidualAfterBotChoice } from "./conversation-handler";
import { normalizeWhatsAppE164 } from "./phone.util";
import { TwilioWhatsAppClient } from "./twilio-whatsapp.client";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";

export interface InboundMessageInput {
  /** Número Twilio de la empresa (E.164), usado para resolver tenant. */
  twilioWhatsAppNumber: string;
  from: string;
  text: string;
  customerName?: string | null;
  wamid?: string | null;
  rawPayload?: Prisma.InputJsonValue;
}

/** Canal de respuesta. Sin número Twilio = "Prueba tu asistente": no se envía nada fuera. */
interface ReplyChannel {
  companyId: string;
  twilioWhatsAppNumber: string | null;
}

export const PLAYGROUND_CHECKOUT_TEXT =
  "Modo prueba: aquí tu cliente recibiría el enlace de pago de Mercado Pago para confirmar el pedido. En la prueba no se crea el pedido ni se descuenta stock.";

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly twilioClient: TwilioWhatsAppClient,
    private readonly aiReplyService: AiReplyService,
    private readonly connectionService: WhatsAppConnectionService,
    private readonly ordersService: OrdersService,
    private readonly billing: BillingService,
  ) {}

  /**
   * Valida X-Twilio-Signature. Requiere TWILIO_WEBHOOK_URL (URL pública exacta)
   * salvo TWILIO_SKIP_SIGNATURE en non-production.
   */
  assertTwilioSignature(
    signatureHeader: string | undefined,
    params: Record<string, string>,
  ): void {
    const skip = this.config.get("TWILIO_SKIP_SIGNATURE", { infer: true });
    const nodeEnv = this.config.get("NODE_ENV", { infer: true });

    if (skip && nodeEnv !== "production") {
      return;
    }

    const authToken = this.config.get("TWILIO_AUTH_TOKEN", { infer: true })?.trim();
    const webhookUrl = this.config.get("TWILIO_WEBHOOK_URL", { infer: true })?.trim();

    if (!authToken) {
      throw new UnauthorizedException("TWILIO_AUTH_TOKEN no configurado");
    }
    if (!webhookUrl) {
      throw new UnauthorizedException("TWILIO_WEBHOOK_URL no configurado");
    }
    if (!signatureHeader) {
      throw new UnauthorizedException("Firma de webhook Twilio ausente");
    }

    const data = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], webhookUrl);
    const expected = createHmac("sha1", authToken).update(Buffer.from(data, "utf8")).digest("base64");

    const expectedBuf = Buffer.from(expected, "utf8");
    const providedBuf = Buffer.from(signatureHeader, "utf8");
    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new UnauthorizedException("Firma de webhook Twilio inválida");
    }
  }

  async handleTwilioWebhook(params: Record<string, string>): Promise<{ processed: number }> {
    const messageSid = params.MessageSid || params.SmsSid || null;
    const status = params.MessageStatus || params.SmsStatus;

    // Status callback (sin Body): actualizar mensaje existente.
    if (status && messageSid && !params.Body) {
      await this.applyStatus(messageSid, status);
      return { processed: 0 };
    }

    const fromRaw = params.From;
    const toRaw = params.To;
    const body = params.Body?.trim();

    if (!fromRaw || !toRaw || !body) {
      // Puede ser un evento que no nos interesa.
      return { processed: 0 };
    }

    const twilioWhatsAppNumber = normalizeWhatsAppE164(toRaw);
    const from = normalizeWhatsAppE164(fromRaw);
    if (!twilioWhatsAppNumber || !from) {
      this.logger.warn(`Twilio webhook con números inválidos To=${toRaw} From=${fromRaw}`);
      return { processed: 0 };
    }

    try {
      await this.ingestInbound({
        twilioWhatsAppNumber,
        from,
        text: body,
        customerName: params.ProfileName?.trim() || null,
        wamid: messageSid,
        rawPayload: params as unknown as Prisma.InputJsonValue,
      });
    } catch (error) {
      // Twilio reintenta 4xx/5xx; si falta comercio o conexión, acusamos recibo sin procesar.
      this.logger.warn(`Twilio inbound no procesado: ${String(error)}`);
      return { processed: 0 };
    }

    return { processed: 1 };
  }

  async simulateInbound(
    companyId: string | null,
    input: { from: string; text: string; customerName?: string },
  ): Promise<{ conversationId: string; messageId: string }> {
    this.assertDevelopmentOnly();
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    await this.connectionService.assertCommerceConfigured(companyId);

    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { companyId },
    });
    if (!connection || !connection.isActive) {
      throw new BadRequestException("Configura una conexión WhatsApp activa primero");
    }

    const from = normalizeWhatsAppE164(input.from);
    if (!from) {
      throw new BadRequestException("Número del cliente inválido (usa E.164, ej. +573001112233)");
    }

    return this.ingestInbound({
      twilioWhatsAppNumber: connection.twilioWhatsAppNumber,
      from,
      text: input.text.trim(),
      customerName: input.customerName?.trim() || null,
      wamid: `SM_sim_in_${Date.now()}`,
      rawPayload: { simulated: true, from: input.from, text: input.text },
    });
  }

  /** Herramientas de desarrollo que no deben existir en producción. */
  assertDevelopmentOnly(): void {
    if (this.config.get("NODE_ENV", { infer: true }) === "production") {
      throw new ForbiddenException("No disponible en producción");
    }
  }

  /** Responde a un mensaje de "Prueba tu asistente" sin enviar nada por WhatsApp. */
  async replyInPlayground(
    companyId: string,
    conversationId: string,
    customerText: string,
  ): Promise<void> {
    await this.maybeAutoReply(
      { companyId, twilioWhatsAppNumber: null },
      conversationId,
      "",
      customerText,
    );
  }

  /** Expone la lógica de ingestión para tests unitarios. */
  async ingestInbound(input: InboundMessageInput): Promise<{
    conversationId: string;
    messageId: string;
  }> {
    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { twilioWhatsAppNumber: input.twilioWhatsAppNumber },
    });

    if (!connection || !connection.isActive) {
      this.logger.warn(
        `No active WhatsApp connection for twilioWhatsAppNumber=${input.twilioWhatsAppNumber}`,
      );
      throw new BadRequestException("Conexión WhatsApp no encontrada o inactiva");
    }

    try {
      await this.connectionService.assertCommerceConfigured(connection.companyId);
    } catch {
      this.logger.warn(
        `Inbound ignorado: empresa ${connection.companyId} sin envíos configurados`,
      );
      throw new BadRequestException(
        "Configura envíos (país, cobertura y transportadoras) en Configuración antes de usar WhatsApp. Solo el dueño de la empresa puede hacerlo.",
      );
    }

    const now = new Date();
    const conversation = await this.prisma.conversation.upsert({
      where: {
        waConnectionId_customerWaId: {
          waConnectionId: connection.id,
          customerWaId: input.from,
        },
      },
      create: {
        companyId: connection.companyId,
        waConnectionId: connection.id,
        customerWaId: input.from,
        customerName: input.customerName ?? null,
        handler: "pending",
        lastMessageAt: now,
      },
      update: {
        lastMessageAt: now,
        ...(input.customerName ? { customerName: input.customerName } : {}),
      },
    });

    const inbound = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "inbound",
        wamid: input.wamid ?? null,
        type: "text",
        body: input.text,
        status: "received",
        rawPayload: input.rawPayload ?? undefined,
      },
    });

    await this.maybeAutoReply(connection, conversation.id, input.from, input.text);

    return { conversationId: conversation.id, messageId: inbound.id };
  }

  private async applyStatus(messageSid: string, status: string): Promise<void> {
    const mapped =
      status === "failed" || status === "undelivered"
        ? "failed"
        : status === "sent" ||
            status === "delivered" ||
            status === "read" ||
            status === "queued" ||
            status === "sending" ||
            status === "received"
          ? "sent"
          : null;
    if (!mapped) {
      return;
    }
    await this.prisma.message.updateMany({
      where: { wamid: messageSid },
      data: { status: mapped },
    });
  }

  private async maybeAutoReply(
    connection: ReplyChannel,
    conversationId: string,
    customerWaId: string,
    customerText: string,
  ): Promise<void> {
    const playground = connection.twilioWhatsAppNumber === null;
    const enabled = this.config.get("WHATSAPP_AUTO_REPLY_ENABLED", { infer: true });
    if (!enabled && !playground) {
      return;
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { handler: true },
    });
    if (!conversation) {
      return;
    }

    const outboundTexts: string[] = [];
    const outboundImageUrls: string[] = [];
    let nextHandler: "pending" | "bot" | "human" | null = null;
    const aiEnabled = this.config.get("AI_ENABLED", { infer: true });

    if (conversation.handler === "human") {
      if (!detectsBotChoice(customerText)) {
        return;
      }
      nextHandler = "bot";
      outboundTexts.push(this.config.get("WHATSAPP_HANDLER_BOT_CONFIRM_TEXT", { infer: true }));
      const followUp = await this.buildBotFollowUpAfterChoice({
        connection,
        conversationId,
        customerText,
        aiEnabled,
      });
      if (followUp) {
        if (followUp.requestedHandoff) {
          nextHandler = "human";
          outboundTexts.push(
            this.config.get("WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT", { infer: true }),
          );
        } else {
          outboundTexts.push(followUp.text);
          outboundImageUrls.push(...(followUp.imageUrls ?? []));
        }
      }
    } else if (conversation.handler === "pending") {
      if (detectsHumanRequest(customerText)) {
        nextHandler = "human";
        outboundTexts.push(
          this.config.get("WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT", { infer: true }),
        );
      } else if (detectsBotChoice(customerText)) {
        nextHandler = "bot";
        outboundTexts.push(this.config.get("WHATSAPP_HANDLER_BOT_CONFIRM_TEXT", { infer: true }));
        const followUp = await this.buildBotFollowUpAfterChoice({
          connection,
          conversationId,
          customerText,
          aiEnabled,
        });
        if (followUp) {
          if (followUp.requestedHandoff) {
            nextHandler = "human";
            outboundTexts.push(
              this.config.get("WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT", { infer: true }),
            );
          } else {
            outboundTexts.push(followUp.text);
            outboundImageUrls.push(...(followUp.imageUrls ?? []));
          }
        }
      } else {
        outboundTexts.push(this.config.get("WHATSAPP_HANDLER_CHOICE_TEXT", { infer: true }));
      }
    } else if (conversation.handler === "bot") {
      if (detectsHumanRequest(customerText)) {
        nextHandler = "human";
        outboundTexts.push(
          this.config.get("WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT", { infer: true }),
        );
      } else {
        const waQuota = playground
          ? { allowed: true }
          : await this.billing.recordWaInbound(connection.companyId);
        if (!waQuota.allowed) {
          outboundTexts.push(
            "El negocio no puede atender por bot en este momento. Un asesor te contactará pronto.",
          );
        } else {
          const orderReply = await this.tryHandleOrderIntent(
            connection.companyId,
            conversationId,
            customerText,
            playground,
          );
          if (orderReply) {
            outboundTexts.push(orderReply);
          } else if (aiEnabled) {
            const aiQuota = await this.billing.recordAiReply(connection.companyId);
            if (!aiQuota.allowed) {
              outboundTexts.push(
                this.config.get("WHATSAPP_AUTO_REPLY_TEXT", { infer: true }),
              );
            } else {
              const reply = await this.aiReplyService.generateReply({
                companyId: connection.companyId,
                conversationId,
                customerText,
              });
              if (reply.requestedHandoff) {
                nextHandler = "human";
                outboundTexts.push(
                  this.config.get("WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT", { infer: true }),
                );
              } else {
                outboundTexts.push(reply.text);
                outboundImageUrls.push(...(reply.imageUrls ?? []));
              }
            }
          } else {
            outboundTexts.push(this.config.get("WHATSAPP_AUTO_REPLY_TEXT", { infer: true }));
          }
        }
      }
    }

    if (outboundTexts.length === 0 && outboundImageUrls.length === 0) {
      return;
    }

    if (nextHandler) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { handler: nextHandler },
      });
    }

    for (const text of outboundTexts) {
      await this.sendOutboundText({
        connection,
        conversationId,
        customerWaId,
        text,
      });
    }

    for (const mediaUrl of outboundImageUrls.slice(0, 3)) {
      await this.sendOutboundMedia({
        connection,
        conversationId,
        customerWaId,
        mediaUrl,
      });
    }

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
  }

  private async tryHandleOrderIntent(
    companyId: string,
    conversationId: string,
    customerText: string,
    playground = false,
  ): Promise<string | null> {
    try {
      const cart = await this.ordersService.getCartForConversation(companyId, conversationId);
      let intent = resolveOrderChatIntent(customerText);

      // "sí / dale" tras oferta del bot de agregar → tratar como add_to_cart.
      if (!intent && detectsAffirmativeCartConfirm(customerText)) {
        const lastBot = await this.prisma.message.findFirst({
          where: { conversationId, direction: "outbound" },
          orderBy: { createdAt: "desc" },
          select: { body: true },
        });
        if (lastBot?.body && botOfferedAddToCart(lastBot.body)) {
          intent = { type: "add_to_cart" };
        }
      }

      if (!intent) {
        return null;
      }

      if (intent.type === "view_cart") {
        return this.ordersService.formatCartMessage(cart);
      }

      if (intent.type === "clear_cart") {
        const cleared = await this.ordersService.clearCart(companyId, conversationId);
        return this.ordersService.formatCartMessage(cleared);
      }

      if (intent.type === "checkout") {
        if (playground) {
          return `${PLAYGROUND_CHECKOUT_TEXT}

${this.ordersService.formatCartMessage(cart)}`;
        }
        const result = await this.ordersService.beginCheckout(companyId, conversationId);
        return result.message;
      }

      if (intent.type === "add_to_cart") {
        let match = await this.ordersService.findVariantForAddIntent(companyId, customerText);
        if (!match) {
          // Frases como "me gustaría pedir una" / "sí" / "quiero 2": usar historial + oferta del bot.
          const recent = await this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: "desc" },
            take: 10,
            select: { body: true, direction: true },
          });
          const historyQuery = [
            ...recent
              .map((m) => m.body.trim())
              .filter(Boolean)
              .reverse(),
            customerText,
          ].join(" ");
          match = await this.ordersService.findVariantForAddIntent(companyId, historyQuery);
        }
        if (!match) {
          // Sin producto claro → IA responde; no FAQ por defecto.
          return null;
        }
        const updated = await this.ordersService.addCartItem(
          companyId,
          conversationId,
          match.variantId,
          match.quantity,
        );
        return `Agregué ${match.label} x${match.quantity}.\n\n${this.ordersService.formatCartMessage(updated)}`;
      }

      return null;
    } catch (error) {
      this.logger.warn(`Order intent failed: ${String(error)}`);
      const message =
        error instanceof BadRequestException
          ? String((error.getResponse() as { message?: string | string[] }).message ?? error.message)
          : "No pude actualizar el carrito. Intenta de nuevo o pide un asesor.";
      return Array.isArray(message) ? message.join(" ") : message;
    }
  }

  /**
   * Si el cliente eligió bot tras (o junto a) una pregunta real,
   * genera la respuesta para enviarla como 2º mensaje.
   */
  private async buildBotFollowUpAfterChoice(params: {
    connection: { companyId: string };
    conversationId: string;
    customerText: string;
    aiEnabled: boolean;
  }): Promise<{ text: string; requestedHandoff: boolean; imageUrls: string[] } | null> {
    if (!params.aiEnabled) {
      return null;
    }

    const pendingQuestion = await this.findQuestionForBotFollowUp(
      params.conversationId,
      params.customerText,
    );
    if (!pendingQuestion) {
      return null;
    }

    return this.aiReplyService.generateReply({
      companyId: params.connection.companyId,
      conversationId: params.conversationId,
      customerText: pendingQuestion,
    });
  }

  /** Pregunta del mismo mensaje (bot + pregunta) o del inbound previo. */
  private async findQuestionForBotFollowUp(
    conversationId: string,
    customerText: string,
  ): Promise<string | null> {
    const fromCurrent = extractResidualAfterBotChoice(customerText);
    if (fromCurrent && !this.isOnlyGreeting(fromCurrent)) {
      return fromCurrent;
    }

    return this.findPriorCustomerQuestion(conversationId);
  }

  /** Último inbound con intención real, ignorando elecciones bot/asesor y saludos sueltos. */
  private async findPriorCustomerQuestion(conversationId: string): Promise<string | null> {
    const recent = await this.prisma.message.findMany({
      where: { conversationId, direction: "inbound" },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { body: true },
    });

    for (const message of recent) {
      const body = message.body.trim();
      if (!body) {
        continue;
      }
      if (detectsHumanRequest(body)) {
        continue;
      }
      if (detectsBotChoice(body)) {
        const residual = extractResidualAfterBotChoice(body);
        if (residual && !this.isOnlyGreeting(residual)) {
          return residual;
        }
        continue;
      }
      if (this.isOnlyGreeting(body)) {
        continue;
      }
      return body;
    }

    return null;
  }

  private isOnlyGreeting(text: string): boolean {
    const normalized = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
    const greetingOnly =
      /^(hola|buenas|buenos\s+dias|buenas\s+tardes|buenas\s+noches|hey|saludos|que\s+tal|hi|hello)[!?.\s]*$/i.test(
        normalized,
      );
    return greetingOnly;
  }

  private async sendOutboundText(params: {
    connection: { twilioWhatsAppNumber: string | null };
    conversationId: string;
    customerWaId: string;
    text: string;
  }): Promise<void> {
    let sendResult: { simulated: boolean; wamid: string | null };
    let status: "sent" | "failed" = "sent";

    try {
      sendResult = !params.connection.twilioWhatsAppNumber
        ? { simulated: true, wamid: null }
        : await this.twilioClient.sendText({
            from: params.connection.twilioWhatsAppNumber,
            to: params.customerWaId,
            text: params.text,
          });
    } catch (error) {
      this.logger.error(`Auto-reply failed: ${String(error)}`);
      sendResult = { simulated: false, wamid: null };
      status = "failed";
    }

    await this.prisma.message.create({
      data: {
        conversationId: params.conversationId,
        direction: "outbound",
        wamid: sendResult.wamid,
        type: "text",
        body: params.text,
        status,
      },
    });
  }

  private async sendOutboundMedia(params: {
    connection: { twilioWhatsAppNumber: string | null };
    conversationId: string;
    customerWaId: string;
    mediaUrl: string;
  }): Promise<void> {
    let sendResult: { simulated: boolean; wamid: string | null };
    let status: "sent" | "failed" = "sent";

    try {
      sendResult = !params.connection.twilioWhatsAppNumber
        ? { simulated: true, wamid: null }
        : await this.twilioClient.sendMedia({
            from: params.connection.twilioWhatsAppNumber,
            to: params.customerWaId,
            mediaUrl: params.mediaUrl,
          });
    } catch (error) {
      this.logger.error(`Media auto-reply failed: ${String(error)}`);
      sendResult = { simulated: false, wamid: null };
      status = "failed";
    }

    await this.prisma.message.create({
      data: {
        conversationId: params.conversationId,
        direction: "outbound",
        wamid: sendResult.wamid,
        type: "image",
        body: params.mediaUrl,
        status,
        rawPayload: { mediaUrl: params.mediaUrl },
      },
    });
  }
}
