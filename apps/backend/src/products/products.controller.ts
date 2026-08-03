import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type {
  ApiResponse,
  PaginatedResponse,
  ProductDetails,
  ProductImage,
  ProductSummary,
  ProductVariant,
} from "@commerce-ai/types";
import { memoryStorage } from "multer";

import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import type { AuthenticatedUser } from "../auth/auth.types";
import { CreateProductDto, CreateVariantDto } from "./dto/create-product.dto";
import { ListProductsQueryDto } from "./dto/list-products-query.dto";
import { ReorderImagesDto } from "./dto/reorder-images.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { UpdateStockDto } from "./dto/update-stock.dto";
import { UpdateVariantDto } from "./dto/update-variant.dto";
import { ProductsService } from "./products.service";

@Controller("products")
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  async list(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListProductsQueryDto,
  ): Promise<ApiResponse<PaginatedResponse<ProductSummary>>> {
    return {
      status: "success",
      data: await this.productsService.list(user.companyId, query),
    };
  }

  @Get(":id")
  async getById(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<ApiResponse<ProductDetails>> {
    return {
      status: "success",
      data: await this.productsService.getById(user.companyId, id),
    };
  }

  @Roles("owner", "manager")
  @Post()
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateProductDto,
  ): Promise<ApiResponse<ProductDetails>> {
    return {
      status: "success",
      data: await this.productsService.create(user.companyId, dto),
    };
  }

  @Roles("owner", "manager")
  @Patch(":id")
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: UpdateProductDto,
  ): Promise<ApiResponse<ProductDetails>> {
    return {
      status: "success",
      data: await this.productsService.update(user.companyId, id, dto),
    };
  }

  @Roles("owner", "manager")
  @Delete(":id")
  async remove(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
  ): Promise<ApiResponse<null>> {
    await this.productsService.remove(user.companyId, id);
    return { status: "success", data: null, message: "Producto eliminado" };
  }

  @Roles("owner", "manager")
  @Post(":id/variants")
  async addVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: CreateVariantDto,
  ): Promise<ApiResponse<ProductVariant>> {
    return {
      status: "success",
      data: await this.productsService.addVariant(user.companyId, id, dto),
    };
  }

  @Roles("owner", "manager")
  @Patch(":id/variants/:variantId")
  async updateVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body() dto: UpdateVariantDto,
  ): Promise<ApiResponse<ProductVariant>> {
    return {
      status: "success",
      data: await this.productsService.updateVariant(user.companyId, id, variantId, dto),
    };
  }

  @Roles("owner", "manager")
  @Delete(":id/variants/:variantId")
  async removeVariant(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("variantId") variantId: string,
  ): Promise<ApiResponse<null>> {
    await this.productsService.removeVariant(user.companyId, id, variantId);
    return { status: "success", data: null, message: "Variante eliminada" };
  }

  @Roles("owner", "manager")
  @Patch(":id/variants/:variantId/stock")
  async updateStock(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body() dto: UpdateStockDto,
  ): Promise<ApiResponse<ProductVariant>> {
    return {
      status: "success",
      data: await this.productsService.updateStock(user.companyId, id, variantId, dto),
    };
  }

  @Roles("owner", "manager")
  @Post(":id/images")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async addImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body("alt") alt?: string,
  ): Promise<ApiResponse<ProductImage>> {
    return {
      status: "success",
      data: await this.productsService.addImage(user.companyId, id, file, alt),
    };
  }

  @Roles("owner", "manager")
  @Patch(":id/images/reorder")
  async reorderImages(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Body() dto: ReorderImagesDto,
  ): Promise<ApiResponse<ProductImage[]>> {
    return {
      status: "success",
      data: await this.productsService.reorderImages(user.companyId, id, dto.imageIds),
    };
  }

  @Roles("owner", "manager")
  @Delete(":id/images/:imageId")
  async removeImage(
    @CurrentUser() user: AuthenticatedUser,
    @Param("id") id: string,
    @Param("imageId") imageId: string,
  ): Promise<ApiResponse<null>> {
    await this.productsService.removeImage(user.companyId, id, imageId);
    return { status: "success", data: null, message: "Imagen eliminada" };
  }
}
