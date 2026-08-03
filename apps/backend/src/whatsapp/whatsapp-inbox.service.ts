import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  ConversationSummary,
  PaginatedResponse,
  WhatsAppMessage,
} from "@commerce-ai/types";

import { PrismaService } from "../prisma/prisma.service";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import { WhatsAppCloudClient } from "./whatsapp-cloud.client";

@Injectable()
export class WhatsAppInboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cloudClient: WhatsAppCloudClient,
  ) {}

  async listConversations(
    companyId: string | null,
    query: ListConversationsQueryDto,
  ): Promise<PaginatedResponse<ConversationSummary>> {
    const scopedCompanyId = this.requireCompany(companyId);
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;

    const where = { companyId: scopedCompanyId };

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

  async listMessages(
    companyId: string | null,
    conversationId: string,
  ): Promise<WhatsAppMessage[]> {
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
    const conversation = await this.findOwnedConversation(companyId, conversationId);
    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { id: conversation.waConnectionId },
    });
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
      const result = await this.cloudClient.sendText({
        phoneNumberId: connection.phoneNumberId,
        accessToken: connection.accessToken,
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

  private async findOwnedConversation(companyId: string | null, conversationId: string) {
    const scopedCompanyId = this.requireCompany(companyId);
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, companyId: scopedCompanyId },
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

  private toMessageDto(message: {
    id: string;
    conversationId: string;
    direction: "inbound" | "outbound";
    wamid: string | null;
    type: string;
    body: string;
    status: "received" | "sent" | "failed" | null;
    createdAt: Date;
  }): WhatsAppMessage {
    return {
      id: message.id,
      conversationId: message.conversationId,
      direction: message.direction,
      wamid: message.wamid,
      type: message.type,
      body: message.body,
      status: message.status,
      createdAt: message.createdAt.toISOString(),
    };
  }
}
