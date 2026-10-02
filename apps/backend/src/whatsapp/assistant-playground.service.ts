import { BadRequestException, Injectable } from "@nestjs/common";
import type { AssistantPlaygroundThread } from "@commerce-ai/types";

import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { toWhatsAppMessageDto } from "./message-dto.util";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

/** Identificador del "cliente" de prueba; nunca es un número real. */
const PLAYGROUND_CUSTOMER_ID = "playground";
const MAX_MESSAGE_LENGTH = 1000;

@Injectable()
export class AssistantPlaygroundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly connectionService: WhatsAppConnectionService,
    private readonly webhookService: WhatsAppWebhookService,
    private readonly storage: StorageService,
  ) {}

  async getThread(companyId: string | null): Promise<AssistantPlaygroundThread> {
    const scopedCompanyId = this.requireCompany(companyId);
    const conversation = await this.prisma.conversation.findFirst({
      where: { companyId: scopedCompanyId, isPlayground: true },
      include: { messages: { orderBy: { createdAt: "asc" } } },
    });
    if (!conversation) {
      return { conversationId: null, handler: "pending", messages: [] };
    }
    return {
      conversationId: conversation.id,
      handler: conversation.handler,
      messages: conversation.messages.map((message) =>
        toWhatsAppMessageDto(message, (url) => this.storage.browserUrl(url)),
      ),
    };
  }

  async sendMessage(
    companyId: string | null,
    text: string,
    actionId?: string | null,
  ): Promise<AssistantPlaygroundThread> {
    const scopedCompanyId = this.requireCompany(companyId);
    const body = text.trim();
    if (!body) {
      throw new BadRequestException("El mensaje no puede estar vacío");
    }
    if (body.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(`El mensaje no puede superar ${MAX_MESSAGE_LENGTH} caracteres`);
    }

    await this.connectionService.assertWhatsAppPrerequisites(scopedCompanyId, {
      requirePayments: false,
    });

    const now = new Date();
    const existing = await this.prisma.conversation.findFirst({
      where: { companyId: scopedCompanyId, isPlayground: true },
      select: { id: true },
    });
    const conversation = existing
      ? await this.prisma.conversation.update({
          where: { id: existing.id },
          data: { lastMessageAt: now },
          select: { id: true },
        })
      : await this.prisma.conversation.create({
          data: {
            companyId: scopedCompanyId,
            waConnectionId: null,
            customerWaId: PLAYGROUND_CUSTOMER_ID,
            customerName: "Prueba",
            handler: "pending",
            isPlayground: true,
            lastMessageAt: now,
          },
          select: { id: true },
        });

    await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "inbound",
        type: "text",
        body,
        status: "received",
        interactive: actionId ? { kind: "reply", actionId } : undefined,
      },
    });

    await this.webhookService.replyInPlayground(
      scopedCompanyId,
      conversation.id,
      body,
      actionId ?? null,
    );

    return this.getThread(scopedCompanyId);
  }

  /** Borra mensajes y carrito, y vuelve a mostrar el menú inicial de bot/asesor. */
  async reset(companyId: string | null): Promise<void> {
    const scopedCompanyId = this.requireCompany(companyId);
    const conversation = await this.prisma.conversation.findFirst({
      where: { companyId: scopedCompanyId, isPlayground: true },
      select: { id: true },
    });
    if (!conversation) {
      return;
    }
    await this.prisma.$transaction([
      this.prisma.message.deleteMany({ where: { conversationId: conversation.id } }),
      this.prisma.cart.deleteMany({ where: { conversationId: conversation.id } }),
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { handler: "pending" },
      }),
    ]);
  }

  private requireCompany(companyId: string | null): string {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }
    return companyId;
  }
}
