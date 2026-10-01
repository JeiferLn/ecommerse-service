import { Body, Controller, Delete, Get, Post } from "@nestjs/common";
import type { ApiResponse, AssistantPlaygroundThread } from "@commerce-ai/types";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { AssistantPlaygroundService } from "./assistant-playground.service";
import { SendMessageDto } from "./dto/send-message.dto";

@Roles("owner", "manager")
@Controller("assistant/playground")
export class AssistantPlaygroundController {
  constructor(private readonly playgroundService: AssistantPlaygroundService) {}

  @Get()
  async get(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<AssistantPlaygroundThread>> {
    return {
      status: "success",
      data: await this.playgroundService.getThread(user.companyId),
    };
  }

  @Post("messages")
  async send(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SendMessageDto,
  ): Promise<ApiResponse<AssistantPlaygroundThread>> {
    return {
      status: "success",
      data: await this.playgroundService.sendMessage(user.companyId, dto.text),
    };
  }

  @Delete()
  async reset(@CurrentUser() user: AuthenticatedUser): Promise<ApiResponse<null>> {
    await this.playgroundService.reset(user.companyId);
    return { status: "success", data: null, message: "Prueba reiniciada" };
  }
}
