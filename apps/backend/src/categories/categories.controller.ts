import { Body, Controller, Delete, Get, Param, Patch, Post } from "@nestjs/common";
import type { ApiResponse, Category } from "@commerce-ai/types";

import { Roles } from "../common/decorators/roles.decorator";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CategoriesService } from "./categories.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Controller("categories")
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async list(@CurrentUser() user: AuthenticatedUser): Promise<ApiResponse<Category[]>> {
    return {
      status: "success",
      data: await this.categoriesService.list(user.companyId),
    };
  }

  @Roles("owner", "manager")
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCategoryDto,
  ): Promise<ApiResponse<Category>> {
    return {
      status: "success",
      data: await this.categoriesService.create(user.companyId, dto),
    };
  }

  @Roles("owner", "manager")
  @Patch(":id")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateCategoryDto,
  ): Promise<ApiResponse<Category>> {
    return {
      status: "success",
      data: await this.categoriesService.update(user.companyId, id, dto),
    };
  }

  @Roles("owner", "manager")
  @Delete(":id")
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<ApiResponse<null>> {
    await this.categoriesService.remove(user.companyId, id);
    return { status: "success", data: null, message: "Categoría eliminada" };
  }
}
