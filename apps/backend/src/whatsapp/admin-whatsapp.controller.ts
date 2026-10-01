import { Body, Controller, Delete, Get, Param, Put } from "@nestjs/common";
import type { AdminCompanyRow, ApiResponse, WhatsAppConnection } from "@commerce-ai/types";

import { Roles } from "../common/decorators/roles.decorator";
import { UpsertWhatsAppConnectionDto } from "./dto/upsert-connection.dto";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";

/** Panel de plataforma: la plataforma asigna el número de WhatsApp de cada empresa. */
@Roles("admin")
@Controller("admin/companies")
export class AdminWhatsAppController {
  constructor(private readonly connectionService: WhatsAppConnectionService) {}

  @Get()
  async list(): Promise<ApiResponse<AdminCompanyRow[]>> {
    return { status: "success", data: await this.connectionService.listForAdmin() };
  }

  @Put(":companyId/whatsapp-connection")
  async assign(
    @Param("companyId") companyId: string,
    @Body() dto: UpsertWhatsAppConnectionDto,
  ): Promise<ApiResponse<WhatsAppConnection>> {
    return {
      status: "success",
      data: await this.connectionService.upsert(companyId, dto),
      message: "Número asignado",
    };
  }

  @Delete(":companyId/whatsapp-connection")
  async unassign(@Param("companyId") companyId: string): Promise<ApiResponse<null>> {
    await this.connectionService.remove(companyId);
    return { status: "success", data: null, message: "Número retirado" };
  }
}
