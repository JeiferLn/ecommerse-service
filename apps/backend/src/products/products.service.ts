import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';

const productInclude = {
  category: { select: { id: true, name: true } },
  images: {
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
    select: {
      id: true,
      url: true,
      sortOrder: true,
      isPrimary: true,
    },
  },
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async list(
    user: AuthUser,
    query: { search?: string; categoryId?: string; isActive?: string },
  ) {
    const companyId = this.requireCompanyId(user);

    const where: Prisma.ProductWhereInput = {
      companyId,
      ...(query.categoryId ? { categoryId: query.categoryId } : {}),
      ...(query.isActive === 'true'
        ? { isActive: true }
        : query.isActive === 'false'
          ? { isActive: false }
          : {}),
      ...(query.search
        ? {
            OR: [
              { title: { contains: query.search, mode: 'insensitive' } },
              {
                description: { contains: query.search, mode: 'insensitive' },
              },
              {
                category: {
                  name: { contains: query.search, mode: 'insensitive' },
                },
              },
            ],
          }
        : {}),
    };

    const products = await this.prisma.product.findMany({
      where,
      include: productInclude,
      orderBy: { createdAt: 'desc' },
    });

    return products.map((product) => this.serialize(product));
  }

  async getOne(user: AuthUser, id: string) {
    const product = await this.getOwned(user, id);
    return this.serialize(product);
  }

  async create(
    user: AuthUser,
    dto: CreateProductDto,
    files: Express.Multer.File[],
  ) {
    const companyId = this.requireCompanyId(user);

    if (!files?.length) {
      throw new BadRequestException('Debes subir al menos una imagen');
    }

    this.assertImageFiles(files);

    if (dto.categoryId) {
      await this.assertCategory(companyId, dto.categoryId);
    }

    const stored = await Promise.all(
      files.map((file) => this.storage.saveProductImage(companyId, file)),
    );

    const product = await this.prisma.product.create({
      data: {
        title: dto.title.trim(),
        description: dto.description.trim(),
        price: new Prisma.Decimal(dto.price),
        quantity: dto.quantity,
        isActive: dto.isActive ?? true,
        companyId,
        categoryId: dto.categoryId || null,
        images: {
          create: stored.map((item, index) => ({
            url: item.url,
            sortOrder: index,
            isPrimary: index === 0,
          })),
        },
      },
      include: productInclude,
    });

    return this.serialize(product);
  }

  async update(
    user: AuthUser,
    id: string,
    dto: UpdateProductDto,
    files: Express.Multer.File[] = [],
  ) {
    const companyId = this.requireCompanyId(user);
    const existing = await this.getOwned(user, id);

    if (files.length) {
      this.assertImageFiles(files);
    }

    if (dto.categoryId) {
      await this.assertCategory(companyId, dto.categoryId);
    }

    const stored = files.length
      ? await Promise.all(
          files.map((file) => this.storage.saveProductImage(companyId, file)),
        )
      : [];

    const maxSort =
      existing.images.reduce((max, img) => Math.max(max, img.sortOrder), -1) +
      1;

    const product = await this.prisma.product.update({
      where: { id },
      data: {
        ...(dto.title !== undefined ? { title: dto.title.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() }
          : {}),
        ...(dto.price !== undefined
          ? { price: new Prisma.Decimal(dto.price) }
          : {}),
        ...(dto.quantity !== undefined ? { quantity: dto.quantity } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        ...(dto.categoryId !== undefined
          ? { categoryId: dto.categoryId || null }
          : {}),
        ...(stored.length
          ? {
              images: {
                create: stored.map((item, index) => ({
                  url: item.url,
                  sortOrder: maxSort + index,
                  isPrimary: false,
                })),
              },
            }
          : {}),
      },
      include: productInclude,
    });

    return this.serialize(product);
  }

  async remove(user: AuthUser, id: string) {
    const product = await this.getOwned(user, id);
    await this.prisma.product.delete({ where: { id } });
    await Promise.all(
      product.images.map((image) => this.storage.deleteByUrl(image.url)),
    );
    return { success: true };
  }

  async removeImage(user: AuthUser, productId: string, imageId: string) {
    const product = await this.getOwned(user, productId);
    if (product.images.length <= 1) {
      throw new BadRequestException('El producto debe tener al menos una imagen');
    }

    const image = product.images.find((item) => item.id === imageId);
    if (!image) {
      throw new NotFoundException('Imagen no encontrada');
    }

    await this.prisma.productImage.delete({ where: { id: imageId } });

    if (image.isPrimary) {
      const next = product.images.find((item) => item.id !== imageId);
      if (next) {
        await this.prisma.productImage.update({
          where: { id: next.id },
          data: { isPrimary: true },
        });
      }
    }

    await this.storage.deleteByUrl(image.url);
    return this.getOne(user, productId);
  }

  private async getOwned(user: AuthUser, id: string) {
    const companyId = this.requireCompanyId(user);
    const product = await this.prisma.product.findFirst({
      where: { id, companyId },
      include: productInclude,
    });
    if (!product) {
      throw new NotFoundException('Producto no encontrado');
    }
    return product;
  }

  private async assertCategory(companyId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, companyId },
    });
    if (!category) {
      throw new BadRequestException('Categoría inválida');
    }
  }

  private assertImageFiles(files: Express.Multer.File[]) {
    const allowed = new Set([
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
    for (const file of files) {
      if (!allowed.has(file.mimetype)) {
        throw new BadRequestException(
          'Solo se permiten imágenes JPG, PNG, WEBP o GIF',
        );
      }
      if (file.size > 5 * 1024 * 1024) {
        throw new BadRequestException('Cada imagen debe pesar máximo 5MB');
      }
    }
  }

  private requireCompanyId(user: AuthUser) {
    if (!user.companyId) {
      throw new ForbiddenException('No perteneces a ninguna empresa');
    }
    return user.companyId;
  }

  private serialize(
    product: Prisma.ProductGetPayload<{ include: typeof productInclude }>,
  ) {
    return {
      ...product,
      price: product.price.toFixed(2),
    };
  }
}
