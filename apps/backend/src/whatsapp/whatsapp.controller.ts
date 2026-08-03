import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { ApiResponse, WhatsAppConnection } from "@commerce-ai/types";
import type { Request } from "express";

import type { AuthenticatedUser } from "../auth/auth.types";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Public } from "../common/decorators/public.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { SimulateInboundDto } from "./dto/simulate-inbound.dto";
import { UpsertWhatsAppConnectionDto } from "./dto/upsert-connection.dto";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

@Controller("whatsapp")
export class WhatsAppController {
  constructor(
    private readonly connectionService: WhatsAppConnectionService,
    private readonly webhookService: WhatsAppWebhookService,
  ) {}

  @Public()
  @Get("webhook")
  verifyWebhook(
    @Query("hub.mode") mode?: string,
    @Query("hub.verify_token") token?: string,
    @Query("hub.challenge") challenge?: string,
  ): string {
    return this.webhookService.verifyChallenge(mode, token, challenge);
  }

  @Public()
  @Post("webhook")
  @HttpCode(200)
  async receiveWebhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers("x-hub-signature-256") signature?: string,
    @Body() body?: unknown,
  ): Promise<{ status: string }> {
    try {
      this.webhookService.assertSignature(req.rawBody, signature);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Firma de webhook inválida");
    }

    await this.webhookService.handleWebhookPayload(body);
    return { status: "ok" };
  }

  @Roles("owner", "manager")
  @Post("webhook/simulate")
  async simulateInbound(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SimulateInboundDto,
  ): Promise<ApiResponse<{ conversationId: string; messageId: string }>> {
    const data = await this.webhookService.simulateInbound(user.companyId, dto);
    return { status: "success", data, message: "Mensaje simulado" };
  }

  @Roles("owner", "manager")
  @Get("connection")
  async getConnection(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<WhatsAppConnection | null>> {
    return {
      status: "success",
      data: await this.connectionService.get(user.companyId),
    };
  }

  @Roles("owner", "manager")
  @Put("connection")
  async upsertConnection(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpsertWhatsAppConnectionDto,
  ): Promise<ApiResponse<WhatsAppConnection>> {
    return {
      status: "success",
      data: await this.connectionService.upsert(user.companyId, dto),
      message: "Conexión WhatsApp guardada",
    };
  }

  @Roles("owner", "manager")
  @Delete("connection")
  async removeConnection(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ApiResponse<null>> {
    await this.connectionService.remove(user.companyId);
    return { status: "success", data: null, message: "Conexión eliminada" };
  }
}
