import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import type { ConversationSummary, PaginatedResponse, WhatsAppMessage } from "@commerce-ai/types";

import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import { toWhatsAppMessageDto } from "./message-dto.util";
import { TwilioWhatsAppClient } from "./twilio-whatsapp.client";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";

@Injectable()
export class WhatsAppInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly twilioClient: TwilioWhatsAppClient,
    private readonly connectionService: WhatsAppConnectionService,
    private readonly storage: StorageService,
  ) {}

  async listConversations(
    companyId: string | null,
    query: ListConversationsQueryDto,
  ): Promise<PaginatedResponse<ConversationSummary>> {
    const scopedCompanyId = this.requireCompany(companyId);
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;

    const where = { companyId: scopedCompanyId, isPlayground: false };

    const [total, conversations] = await this.prisma.$transaction([
      this.prisma.conversation.count({ where }),
      this.prisma.conversation.findMany({
        where,
        orderBy: { lastMessageAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { body: true },
          },
        },
      }),
    ]);

    return {
      items: conversations.map((conversation) => ({
        id: conversation.id,
        companyId: conversation.companyId,
        customerWaId: conversation.customerWaId,
        customerName: conversation.customerName,
        handler: conversation.handler,
        lastMessageAt: conversation.lastMessageAt.toISOString(),
        lastMessagePreview: conversation.messages[0]?.body ?? null,
        createdAt: conversation.createdAt.toISOString(),
        updatedAt: conversation.updatedAt.toISOString(),
      })),
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  async listMessages(companyId: string | null, conversationId: string): Promise<WhatsAppMessage[]> {
    const conversation = await this.findOwnedConversation(companyId, conversationId);
    const messages = await this.prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });
    return messages.map((message) => this.toMessageDto(message));
  }

  async sendMessage(
    companyId: string | null,
    conversationId: string,
    text: string,
  ): Promise<WhatsAppMessage> {
    await this.connectionService.assertCommerceConfigured(companyId);
    const conversation = await this.findOwnedConversation(companyId, conversationId);
    const connection = conversation.waConnectionId
      ? await this.prisma.whatsAppConnection.findUnique({
          where: { id: conversation.waConnectionId },
        })
      : null;
    if (!connection || !connection.isActive) {
      throw new BadRequestException("La conexión WhatsApp no está activa");
    }

    const body = text.trim();
    if (!body) {
      throw new BadRequestException("El mensaje no puede estar vacío");
    }

    let wamid: string | null = null;
    let status: "sent" | "failed" = "sent";

    try {
      const result = await this.twilioClient.sendText({
        from: connection.twilioWhatsAppNumber,
        to: conversation.customerWaId,
        text: body,
      });
      wamid = result.wamid;
    } catch {
      status = "failed";
    }

    const message = await this.prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: "outbound",
        wamid,
        type: "text",
        body,
        status,
      },
    });

    await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { lastMessageAt: new Date() },
    });

    return this.toMessageDto(message);
  }

  async deleteConversation(companyId: string | null, conversationId: string): Promise<void> {
    const conversation = await this.findOwnedConversation(companyId, conversationId);
    await this.prisma.conversation.delete({ where: { id: conversation.id } });
  }

  async setHandler(
    companyId: string | null,
    conversationId: string,
    handler: "bot" | "human",
  ): Promise<ConversationSummary> {
    await this.connectionService.assertCommerceConfigured(companyId);
    const conversation = await this.findOwnedConversation(companyId, conversationId);
    const updated = await this.prisma.conversation.update({
      where: { id: conversation.id },
      data: { handler, lastMessageAt: new Date() },
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true },
        },
      },
    });

    let lastMessagePreview = updated.messages[0]?.body ?? null;

    if (handler === "bot" && conversation.waConnectionId) {
      const connection = await this.prisma.whatsAppConnection.findUnique({
        where: { id: conversation.waConnectionId },
      });
      if (connection?.isActive) {
        const text = "Un asesor reactivó el asistente virtual. ¿En qué te puedo ayudar?";
        let wamid: string | null = null;
        let status: "sent" | "failed" = "sent";
        try {
          const result = await this.twilioClient.sendText({
            from: connection.twilioWhatsAppNumber,
            to: conversation.customerWaId,
            text,
          });
          wamid = result.wamid;
        } catch {
          status = "failed";
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
        lastMessagePreview = text;
      }
    }

    return {
      id: updated.id,
      companyId: updated.companyId,
      customerWaId: updated.customerWaId,
      customerName: updated.customerName,
      handler: updated.handler,
      lastMessageAt: updated.lastMessageAt.toISOString(),
      lastMessagePreview,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async clearAllConversations(companyId: string | null): Promise<number> {
    const scopedCompanyId = this.requireCompany(companyId);
    const result = await this.prisma.conversation.deleteMany({
      where: { companyId: scopedCompanyId, isPlayground: false },
    });
    return result.count;
  }

  private async findOwnedConversation(companyId: string | null, conversationId: string) {
    const scopedCompanyId = this.requireCompany(companyId);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, companyId: scopedCompanyId, isPlayground: false },
    });
    if (!conversation) {
      throw new NotFoundException("Conversación no encontrada");
    }
    return conversation;
  }

  private requireCompany(companyId: string | null): string {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }
    return companyId;
  }

  private toMessageDto(message: Parameters<typeof toWhatsAppMessageDto>[0]): WhatsAppMessage {
    return toWhatsAppMessageDto(message, (url) => this.storage.browserUrl(url));
  }
}
