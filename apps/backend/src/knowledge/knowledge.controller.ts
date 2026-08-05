import {
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { ApiResponse, KnowledgeSlot } from "@commerce-ai/types";
import { memoryStorage } from "multer";

import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { KnowledgeService } from "./knowledge.service";

@Controller("knowledge")
export class KnowledgeController {
  constructor(private readonly knowledgeService: KnowledgeService) {}

  @Roles("owner", "manager")
  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ApiResponse<KnowledgeSlot[]>> {
    return {
      status: "success",
      data: await this.knowledgeService.listSlots(user.companyId),
    };
  }

  @Roles("owner", "manager")
  @Put(":type/file")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async uploadPdf(
    @CurrentUser() user: AuthenticatedUser,
    @Param("type") type: string,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ApiResponse<KnowledgeSlot>> {
    return {
      status: "success",
      data: await this.knowledgeService.uploadPdf(user.companyId, type, file),
      message: "Documento PDF indexado",
    };
  }

  @Roles("owner", "manager")
  @Delete(":type")
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("type") type: string,
  ): Promise<ApiResponse<null>> {
    await this.knowledgeService.removeByType(user.companyId, type);
    return { status: "success", data: null, message: "Documento eliminado" };
  }
}
