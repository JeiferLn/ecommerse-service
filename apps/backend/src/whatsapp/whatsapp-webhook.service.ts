import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";

import type { Env } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { AiReplyService } from "../ai/ai-reply.service";
import { detectsBotChoice, detectsHumanRequest } from "./conversation-handler";
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

@Injectable()
export class WhatsAppWebhookService {
  private readonly logger = new Logger(WhatsAppWebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly twilioClient: TwilioWhatsAppClient,
    private readonly aiReplyService: AiReplyService,
    private readonly connectionService: WhatsAppConnectionService,
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
    connection: {
      id: string;
      companyId: string;
      twilioWhatsAppNumber: string;
    },
    conversationId: string,
    customerWaId: string,
    customerText: string,
  ): Promise<void> {
    const enabled = this.config.get("WHATSAPP_AUTO_REPLY_ENABLED", { infer: true });
    if (!enabled) {
      return;
    }

    const conversation = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { handler: true },
    });
    if (!conversation) {
      return;
    }

    let text: string | null = null;
    let nextHandler: "pending" | "bot" | "human" | null = null;

    if (conversation.handler === "human") {
      if (!detectsBotChoice(customerText)) {
        return;
      }
      nextHandler = "bot";
      text = this.config.get("WHATSAPP_HANDLER_BOT_CONFIRM_TEXT", { infer: true });
    } else if (conversation.handler === "pending") {
      if (detectsHumanRequest(customerText)) {
        nextHandler = "human";
        text = this.config.get("WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT", { infer: true });
      } else if (detectsBotChoice(customerText)) {
        nextHandler = "bot";
        text = this.config.get("WHATSAPP_HANDLER_BOT_CONFIRM_TEXT", { infer: true });
      } else {
        text = this.config.get("WHATSAPP_HANDLER_CHOICE_TEXT", { infer: true });
      }
    } else if (conversation.handler === "bot") {
      if (detectsHumanRequest(customerText)) {
        nextHandler = "human";
        text = this.config.get("WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT", { infer: true });
      } else {
        const aiEnabled = this.config.get("AI_ENABLED", { infer: true });
        if (aiEnabled) {
          const reply = await this.aiReplyService.generateReply({
            companyId: connection.companyId,
            conversationId,
            customerText,
          });
          if (reply.requestedHandoff) {
            nextHandler = "human";
            text = this.config.get("WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT", { infer: true });
          } else {
            text = reply.text;
          }
        } else {
          text = this.config.get("WHATSAPP_AUTO_REPLY_TEXT", { infer: true });
        }
      }
    }

    if (!text) {
      return;
    }

    if (nextHandler) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { handler: nextHandler },
      });
    }

    let sendResult: { simulated: boolean; wamid: string | null };
    let status: "sent" | "failed" = "sent";

    try {
      sendResult = await this.twilioClient.sendText({
        from: connection.twilioWhatsAppNumber,
        to: customerWaId,
        text,
      });
    } catch (error) {
      this.logger.error(`Auto-reply failed: ${String(error)}`);
      sendResult = { simulated: false, wamid: null };
      status = "failed";
    }

    await this.prisma.message.create({
      data: {
        conversationId,
        direction: "outbound",
        wamid: sendResult.wamid,
        type: "text",
        body: text,
        status,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: new Date() },
    });
  }
}
