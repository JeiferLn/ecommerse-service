import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";
import type {
  ApiResponse,
  ConversationSummary,
  PaginatedResponse,
  WhatsAppMessage,
} from "@commerce-ai/types";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { ListConversationsQueryDto } from "./dto/list-conversations-query.dto";
import { SendMessageDto } from "./dto/send-message.dto";
import { UpdateConversationHandlerDto } from "./dto/update-conversation-handler.dto";
import { WhatsAppInboxService } from "./whatsapp-inbox.service";

@Controller("whatsapp/conversations")
export class WhatsAppInboxController {
  constructor(private readonly inboxService: WhatsAppInboxService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListConversationsQueryDto,
  ): Promise<ApiResponse<PaginatedResponse<ConversationSummary>>> {
    return {
      status: "success",
      data: await this.inboxService.listConversations(user.companyId, query),
    };
  }

  @Roles("owner", "manager")
  @Delete()
  async clearAll(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<{ deleted: number }>> {
    const deleted = await this.inboxService.clearAllConversations(user.companyId);
    return {
      status: "success",
      data: { deleted },
      message: "Inbox reiniciado",
    };
  }

  @Get(":id/messages")
  async listMessages(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<ApiResponse<WhatsAppMessage[]>> {
    return {
      status: "success",
      data: await this.inboxService.listMessages(user.companyId, id),
    };
  }

  @Roles("owner", "manager")
  @Post(":id/messages")
  async sendMessage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: SendMessageDto,
  ): Promise<ApiResponse<WhatsAppMessage>> {
    return {
      status: "success",
      data: await this.inboxService.sendMessage(user.companyId, id, dto.text),
    };
  }

  @Roles("owner", "manager")
  @Patch(":id/handler")
  async setHandler(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateConversationHandlerDto,
  ): Promise<ApiResponse<ConversationSummary>> {
    return {
      status: "success",
      data: await this.inboxService.setHandler(user.companyId, id, dto.handler),
      message: dto.handler === "bot" ? "Bot reactivado" : "Conversación asignada a asesor",
    };
  }

  @Roles("owner", "manager")
  @Delete(":id")
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<ApiResponse<null>> {
    await this.inboxService.deleteConversation(user.companyId, id);
    return { status: "success", data: null, message: "Conversación eliminada" };
  }
}
