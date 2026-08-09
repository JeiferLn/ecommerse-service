import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  Category as CategoryDto,
  PaginatedResponse,
  ProductDetails,
  ProductImage as ProductImageDto,
  ProductSummary,
  ProductVariant as ProductVariantDto,
} from "@commerce-ai/types";
import { Prisma, type ProductStatus } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";

import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { detectImageMime } from "../common/detect-image-mime";
import { StorageService } from "../storage/storage.service";
import { CreateProductDto, CreateVariantDto } from "./dto/create-product.dto";
import { ListProductsQueryDto } from "./dto/list-products-query.dto";
import { UpdateProductDto } from "./dto/update-product.dto";
import { UpdateStockDto } from "./dto/update-stock.dto";
import { UpdateVariantDto } from "./dto/update-variant.dto";

type ProductWithRelations = Prisma.ProductGetPayload<{
  include: {
    category: true;
    variants: true;
    images: true;
  };
}>;

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly billing: BillingService,
  ) {}

  async list(
    companyId: string | null,
    query: ListProductsQueryDto,
  ): Promise<PaginatedResponse<ProductSummary>> {
    const scopedCompanyId = this.requireCompany(companyId);
    const page = query.page ?? 1;
    const perPage = query.perPage ?? 20;
    const where: Prisma.ProductWhereInput = {
      companyId: scopedCompanyId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { name: { contains: query.q, mode: "insensitive" } },
              { description: { contains: query.q, mode: "insensitive" } },
              { variants: { some: { sku: { contains: query.q, mode: "insensitive" } } } },
            ],
          }
        : {}),
    };

    const [total, products] = await this.prisma.$transaction([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: {
          category: true,
          variants: true,
          images: { orderBy: { sortOrder: "asc" }, take: 1 },
        },
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return {
      items: products.map((product) => this.toSummary(product)),
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    };
  }

  async getById(companyId: string | null, productId: string): Promise<ProductDetails> {
    const product = await this.findOwnedProduct(companyId, productId);
    return this.toDetails(product);
  }

  async create(companyId: string | null, dto: CreateProductDto): Promise<ProductDetails> {
    const scopedCompanyId = this.requireCompany(companyId);
    await this.billing.assertCan(scopedCompanyId, "create_product");
    await this.assertCategory(scopedCompanyId, dto.categoryId);

    const variants = dto.variants?.length
      ? dto.variants
      : [
          {
            sku: "DEFAULT",
            name: "Default",
            price: 0,
            stock: 0,
          } satisfies CreateVariantDto,
        ];

    // La primera variante del producto nuevo cuenta como create_product; extras como variantes.
    if (variants.length > 1) {
      for (let i = 1; i < variants.length; i += 1) {
        await this.billing.assertCan(scopedCompanyId, "create_variant");
      }
    }

    this.assertUniqueSkus(variants.map((variant) => variant.sku));

    try {
      const product = await this.prisma.product.create({
        data: {
          companyId: scopedCompanyId,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          categoryId: dto.categoryId || null,
          status: dto.status ?? "draft",
          variants: {
            create: variants.map((variant) => this.variantCreateData(variant)),
          },
        },
        include: {
          category: true,
          variants: { orderBy: { createdAt: "asc" } },
          images: { orderBy: { sortOrder: "asc" } },
        },
      });
      return this.toDetails(product);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya existe una variante con ese SKU en el producto");
      }
      throw error;
    }
  }

  async update(
    companyId: string | null,
    productId: string,
    dto: UpdateProductDto,
  ): Promise<ProductDetails> {
    const scopedCompanyId = this.requireCompany(companyId);
    await this.findOwnedProduct(scopedCompanyId, productId);
    if (dto.categoryId !== undefined) {
      await this.assertCategory(scopedCompanyId, dto.categoryId);
    }

    const product = await this.prisma.product.update({
      where: { id: productId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description?.trim() || null }
          : {}),
        ...(dto.categoryId !== undefined ? { categoryId: dto.categoryId || null } : {}),
        ...(dto.status !== undefined ? { status: dto.status } : {}),
      },
      include: {
        category: true,
        variants: { orderBy: { createdAt: "asc" } },
        images: { orderBy: { sortOrder: "asc" } },
      },
    });

    return this.toDetails(product);
  }

  async remove(companyId: string | null, productId: string): Promise<void> {
    const product = await this.findOwnedProduct(companyId, productId);

    for (const image of product.images) {
      try {
        await this.storageService.deleteObject(image.key);
      } catch {
        // Continuar aunque falle el borrado remoto
      }
    }

    await this.prisma.product.delete({ where: { id: productId } });
  }

  async addVariant(
    companyId: string | null,
    productId: string,
    dto: CreateVariantDto,
  ): Promise<ProductVariantDto> {
    const scopedCompanyId = this.requireCompany(companyId);
    await this.billing.assertCan(scopedCompanyId, "create_variant");
    await this.findOwnedProduct(companyId, productId);

    try {
      const variant = await this.prisma.productVariant.create({
        data: { productId, ...this.variantCreateData(dto) },
      });
      return this.toVariantDto(variant);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya existe una variante con ese SKU en el producto");
      }
      throw error;
    }
  }

  async updateVariant(
    companyId: string | null,
    productId: string,
    variantId: string,
    dto: UpdateVariantDto,
  ): Promise<ProductVariantDto> {
    await this.findOwnedVariant(companyId, productId, variantId);

    try {
      const variant = await this.prisma.productVariant.update({
        where: { id: variantId },
        data: {
          ...(dto.sku !== undefined ? { sku: dto.sku.trim() } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.price !== undefined ? { price: new Decimal(dto.price) } : {}),
          ...(dto.compareAtPrice !== undefined
            ? {
                compareAtPrice:
                  dto.compareAtPrice == null ? null : new Decimal(dto.compareAtPrice),
              }
            : {}),
          ...(dto.stock !== undefined ? { stock: dto.stock } : {}),
        },
      });
      return this.toVariantDto(variant);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya existe una variante con ese SKU en el producto");
      }
      throw error;
    }
  }

  async removeVariant(
    companyId: string | null,
    productId: string,
    variantId: string,
  ): Promise<void> {
    const product = await this.findOwnedProduct(companyId, productId);
    await this.findOwnedVariant(companyId, productId, variantId);

    if (product.variants.length <= 1) {
      throw new BadRequestException("El producto debe tener al menos una variante");
    }

    await this.prisma.productVariant.delete({ where: { id: variantId } });
  }

  async updateStock(
    companyId: string | null,
    productId: string,
    variantId: string,
    dto: UpdateStockDto,
  ): Promise<ProductVariantDto> {
    const variant = await this.findOwnedVariant(companyId, productId, variantId);

    if (dto.stock == null && dto.delta == null) {
      throw new BadRequestException("Indica stock o delta");
    }

    const nextStock = dto.stock != null ? dto.stock : variant.stock + (dto.delta ?? 0);
    if (nextStock < 0) {
      throw new BadRequestException("El stock no puede quedar negativo");
    }

    const updated = await this.prisma.productVariant.update({
      where: { id: variantId },
      data: { stock: nextStock },
    });

    return this.toVariantDto(updated);
  }

  async addImage(
    companyId: string | null,
    productId: string,
    file: Express.Multer.File,
    alt?: string,
  ): Promise<ProductImageDto> {
    const product = await this.findOwnedProduct(companyId, productId);
    const scopedCompanyId = this.requireCompany(companyId);

    if (!file) {
      throw new BadRequestException("Debes subir una imagen");
    }

    const detectedMime = detectImageMime(file.buffer);
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!detectedMime || !allowed.includes(detectedMime)) {
      throw new BadRequestException(
        "Formato de imagen no soportado o archivo inválido (se requiere JPEG, PNG, WebP o GIF)",
      );
    }

    const uploaded = await this.storageService.uploadProductImage({
      companyId: scopedCompanyId,
      productId,
      fileName: file.originalname,
      contentType: detectedMime,
      body: file.buffer,
    });

    const maxOrder = product.images.reduce((max, image) => Math.max(max, image.sortOrder), -1);

    const image = await this.prisma.productImage.create({
      data: {
        productId,
        url: uploaded.url,
        key: uploaded.key,
        alt: alt?.trim() || null,
        sortOrder: maxOrder + 1,
      },
    });

    return this.toImageDto(image);
  }

  async removeImage(
    companyId: string | null,
    productId: string,
    imageId: string,
  ): Promise<void> {
    await this.findOwnedProduct(companyId, productId);

    const image = await this.prisma.productImage.findFirst({
      where: { id: imageId, productId },
    });
    if (!image) {
      throw new NotFoundException("Imagen no encontrada");
    }

    try {
      await this.storageService.deleteObject(image.key);
    } catch {
      // Continuar aunque falle el borrado remoto
    }

    await this.prisma.productImage.delete({ where: { id: imageId } });
  }

  async reorderImages(
    companyId: string | null,
    productId: string,
    imageIds: string[],
  ): Promise<ProductImageDto[]> {
    const product = await this.findOwnedProduct(companyId, productId);
    const existingIds = product.images.map((image) => image.id).sort();
    const incomingIds = [...imageIds].sort();

    if (
      existingIds.length !== incomingIds.length ||
      existingIds.some((id, index) => id !== incomingIds[index])
    ) {
      throw new BadRequestException(
        "La lista de imágenes no coincide con las del producto. Recarga e inténtalo de nuevo.",
      );
    }

    await this.prisma.$transaction(
      imageIds.map((id, index) =>
        this.prisma.productImage.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );

    const refreshed = await this.findOwnedProduct(companyId, productId);
    return refreshed.images.map((image) => this.toImageDto(image));
  }

  private variantCreateData(dto: CreateVariantDto) {
    return {
      sku: dto.sku.trim(),
      name: dto.name.trim(),
      price: new Decimal(dto.price),
      compareAtPrice: dto.compareAtPrice == null ? null : new Decimal(dto.compareAtPrice),
      stock: dto.stock ?? 0,
    };
  }

  private assertUniqueSkus(skus: string[]): void {
    const normalized = skus.map((sku) => sku.trim().toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      throw new BadRequestException("Los SKU de las variantes deben ser únicos");
    }
  }

  private async assertCategory(
    companyId: string,
    categoryId: string | null | undefined,
  ): Promise<void> {
    if (!categoryId) {
      return;
    }
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, companyId },
      select: { id: true },
    });
    if (!category) {
      throw new BadRequestException("La categoría no pertenece a tu empresa");
    }
  }

  private async findOwnedProduct(
    companyId: string | null,
    productId: string,
  ): Promise<ProductWithRelations> {
    const scopedCompanyId = this.requireCompany(companyId);
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId: scopedCompanyId },
      include: {
        category: true,
        variants: { orderBy: { createdAt: "asc" } },
        images: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!product) {
      throw new NotFoundException("Producto no encontrado");
    }
    return product;
  }

  private async findOwnedVariant(companyId: string | null, productId: string, variantId: string) {
    await this.findOwnedProduct(companyId, productId);
    const variant = await this.prisma.productVariant.findFirst({
      where: { id: variantId, productId },
    });
    if (!variant) {
      throw new NotFoundException("Variante no encontrada");
    }
    return variant;
  }

  private requireCompany(companyId: string | null): string {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }
    return companyId;
  }

  private toSummary(product: {
    id: string;
    name: string;
    description: string | null;
    status: ProductStatus;
    categoryId: string | null;
    createdAt: Date;
    updatedAt: Date;
    category: { name: string } | null;
    variants: { price: Decimal; stock: number }[];
    images: { url: string }[];
  }): ProductSummary {
    const prices = product.variants.map((variant) => Number(variant.price));
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      status: product.status,
      categoryId: product.categoryId,
      categoryName: product.category?.name ?? null,
      variantsCount: product.variants.length,
      totalStock: product.variants.reduce((sum, variant) => sum + variant.stock, 0),
      minPrice: prices.length ? Math.min(...prices) : null,
      coverImageUrl: product.images[0]?.url ?? null,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private toDetails(product: ProductWithRelations): ProductDetails {
    return {
      id: product.id,
      name: product.name,
      description: product.description,
      status: product.status,
      categoryId: product.categoryId,
      category: product.category ? this.toCategoryDto(product.category) : null,
      variants: product.variants.map((variant) => this.toVariantDto(variant)),
      images: product.images.map((image) => this.toImageDto(image)),
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private toCategoryDto(category: {
    id: string;
    name: string;
    slug: string;
    createdAt: Date;
    updatedAt: Date;
  }): CategoryDto {
    return {
      id: category.id,
      name: category.name,
      slug: category.slug,
      createdAt: category.createdAt.toISOString(),
      updatedAt: category.updatedAt.toISOString(),
    };
  }

  private toVariantDto(variant: {
    id: string;
    sku: string;
    name: string;
    price: Decimal;
    compareAtPrice: Decimal | null;
    stock: number;
    attributes: Prisma.JsonValue | null;
    createdAt: Date;
    updatedAt: Date;
  }): ProductVariantDto {
    return {
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      price: Number(variant.price),
      compareAtPrice: variant.compareAtPrice == null ? null : Number(variant.compareAtPrice),
      stock: variant.stock,
      attributes:
        variant.attributes &&
        typeof variant.attributes === "object" &&
        !Array.isArray(variant.attributes)
          ? (variant.attributes as Record<string, string>)
          : null,
      createdAt: variant.createdAt.toISOString(),
      updatedAt: variant.updatedAt.toISOString(),
    };
  }

  private toImageDto(image: {
    id: string;
    url: string;
    key: string;
    alt: string | null;
    sortOrder: number;
    createdAt: Date;
  }): ProductImageDto {
    return {
      id: image.id,
      url: image.url,
      key: image.key,
      alt: image.alt,
      sortOrder: image.sortOrder,
      createdAt: image.createdAt.toISOString(),
    };
  }
}
