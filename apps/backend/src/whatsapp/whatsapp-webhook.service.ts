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
import { WhatsAppCloudClient } from "./whatsapp-cloud.client";

interface CloudContact {
  wa_id?: string;
  profile?: { name?: string };
}

interface CloudTextMessage {
  id?: string;
  from?: string;
  type?: string;
  text?: { body?: string };
  timestamp?: string;
}

interface CloudChangeValue {
  messaging_product?: string;
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  contacts?: CloudContact[];
  messages?: CloudTextMessage[];
  statuses?: Array<{ id?: string; status?: string }>;
}

export interface InboundMessageInput {
  phoneNumberId: string;
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
    private readonly cloudClient: WhatsAppCloudClient,
  ) {}

  verifyChallenge(mode?: string, token?: string, challenge?: string): string {
    const expected = this.config.get("WHATSAPP_VERIFY_TOKEN", { infer: true });
    if (mode !== "subscribe" || !expected || token !== expected || !challenge) {
      throw new UnauthorizedException("Verificación de webhook rechazada");
    }
    return challenge;
  }

  assertSignature(rawBody: Buffer | undefined, signatureHeader: string | undefined): void {
    const skip = this.config.get("WHATSAPP_SKIP_SIGNATURE", { infer: true });
    const secret = this.config.get("WHATSAPP_APP_SECRET", { infer: true });
    const nodeEnv = this.config.get("NODE_ENV", { infer: true });

    if (skip && nodeEnv !== "production") {
      return;
    }

    if (!secret) {
      throw new UnauthorizedException("WHATSAPP_APP_SECRET no configurado");
    }
    if (!rawBody || !signatureHeader?.startsWith("sha256=")) {
      throw new UnauthorizedException("Firma de webhook inválida");
    }

    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const provided = signatureHeader.slice("sha256=".length);
    const expectedBuf = Buffer.from(expected, "utf8");
    const providedBuf = Buffer.from(provided, "utf8");

    if (
      expectedBuf.length !== providedBuf.length ||
      !timingSafeEqual(expectedBuf, providedBuf)
    ) {
      throw new UnauthorizedException("Firma de webhook inválida");
    }
  }

  async handleWebhookPayload(payload: unknown): Promise<{ processed: number }> {
    const body = payload as {
      object?: string;
      entry?: Array<{
        changes?: Array<{ value?: CloudChangeValue; field?: string }>;
      }>;
    };

    if (body.object !== "whatsapp_business_account" || !Array.isArray(body.entry)) {
      return { processed: 0 };
    }

    let processed = 0;

    for (const entry of body.entry) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) {
          continue;
        }

        const phoneNumberId = value.metadata?.phone_number_id;
        if (!phoneNumberId) {
          continue;
        }

        if (Array.isArray(value.statuses) && value.statuses.length > 0) {
          await this.applyStatuses(value.statuses);
        }

        const messages = value.messages ?? [];
        for (const message of messages) {
          if (message.type !== "text" || !message.from || !message.text?.body) {
            continue;
          }
          const contactName =
            value.contacts?.find((c) => c.wa_id === message.from)?.profile?.name ?? null;
          await this.ingestInbound({
            phoneNumberId,
            from: message.from,
            text: message.text.body,
            customerName: contactName,
            wamid: message.id ?? null,
            rawPayload: message as Prisma.InputJsonValue,
          });
          processed += 1;
        }
      }
    }

    return { processed };
  }

  async simulateInbound(
    companyId: string | null,
    input: { from: string; text: string; customerName?: string },
  ): Promise<{ conversationId: string; messageId: string }> {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { companyId },
    });
    if (!connection || !connection.isActive) {
      throw new BadRequestException("Configura una conexión WhatsApp activa primero");
    }

    const result = await this.ingestInbound({
      phoneNumberId: connection.phoneNumberId,
      from: input.from.trim(),
      text: input.text.trim(),
      customerName: input.customerName?.trim() || null,
      wamid: `wamid.sim.in.${Date.now()}`,
      rawPayload: { simulated: true, from: input.from, text: input.text },
    });

    return result;
  }

  /** Expone la lógica de ingestión para tests unitarios. */
  async ingestInbound(input: InboundMessageInput): Promise<{
    conversationId: string;
    messageId: string;
  }> {
    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { phoneNumberId: input.phoneNumberId },
    });

    if (!connection || !connection.isActive) {
      this.logger.warn(`No active WhatsApp connection for phoneNumberId=${input.phoneNumberId}`);
      throw new BadRequestException("Conexión WhatsApp no encontrada o inactiva");
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

    await this.maybeAutoReply(connection, conversation.id, input.from);

    return { conversationId: conversation.id, messageId: inbound.id };
  }

  private async applyStatuses(
    statuses: Array<{ id?: string; status?: string }>,
  ): Promise<void> {
    for (const status of statuses) {
      if (!status.id || !status.status) {
        continue;
      }
      const mapped =
        status.status === "failed"
          ? "failed"
          : status.status === "sent" ||
              status.status === "delivered" ||
              status.status === "read"
            ? "sent"
            : null;
      if (!mapped) {
        continue;
      }
      await this.prisma.message.updateMany({
        where: { wamid: status.id },
        data: { status: mapped },
      });
    }
  }

  private async maybeAutoReply(
    connection: {
      id: string;
      companyId: string;
      phoneNumberId: string;
      accessToken: string;
    },
    conversationId: string,
    customerWaId: string,
  ): Promise<void> {
    const enabled = this.config.get("WHATSAPP_AUTO_REPLY_ENABLED", { infer: true });
    if (!enabled) {
      return;
    }

    const text = this.config.get("WHATSAPP_AUTO_REPLY_TEXT", { infer: true });
    let sendResult: { simulated: boolean; wamid: string | null };
    let status: "sent" | "failed" = "sent";

    try {
      sendResult = await this.cloudClient.sendText({
        phoneNumberId: connection.phoneNumberId,
        accessToken: connection.accessToken,
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
