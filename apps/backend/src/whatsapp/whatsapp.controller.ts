import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  Post,
  Put,
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

/** TwiML vacío: Twilio exige text/xml en la respuesta del webhook (error 12300 si es JSON). */
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

@Controller("whatsapp")
export class WhatsAppController {
  constructor(
    private readonly connectionService: WhatsAppConnectionService,
    private readonly webhookService: WhatsAppWebhookService,
  ) {}

  /**
   * Webhook Twilio (form-urlencoded). Acepta mensajes inbound y status callbacks.
   * Responde TwiML vacío (text/xml). El auto-reply se envía aparte vía REST API.
   */
  @Public()
  @Post("webhook")
  @HttpCode(200)
  @Header("Content-Type", "text/xml")
  async receiveWebhook(
    @Req() req: Request,
    @Headers("x-twilio-signature") signature?: string,
    @Body() body?: Record<string, unknown>,
  ): Promise<string> {
    const params = this.toStringRecord(body ?? {});

    try {
      this.webhookService.assertTwilioSignature(signature, params);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException("Firma de webhook Twilio inválida");
    }

    await this.webhookService.handleTwilioWebhook(params);
    return EMPTY_TWIML;
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

  private toStringRecord(body: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value == null) {
        continue;
      }
      if (typeof value === "string") {
        result[key] = value;
      } else if (typeof value === "number" || typeof value === "boolean") {
        result[key] = String(value);
      }
    }
    return result;
  }
}
