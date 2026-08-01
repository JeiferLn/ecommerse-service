import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Category as CategoryDto } from "@commerce-ai/types";
import { Prisma } from "@prisma/client";

import { slugify } from "../common/slugify";
import { PrismaService } from "../prisma/prisma.service";
import { CreateCategoryDto } from "./dto/create-category.dto";
import { UpdateCategoryDto } from "./dto/update-category.dto";

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string | null): Promise<CategoryDto[]> {
    const scopedCompanyId = this.requireCompany(companyId);

    const categories = await this.prisma.category.findMany({
      where: { companyId: scopedCompanyId },
      orderBy: { name: "asc" },
    });

    return categories.map((category) => this.toDto(category));
  }

  async create(companyId: string | null, dto: CreateCategoryDto): Promise<CategoryDto> {
    const scopedCompanyId = this.requireCompany(companyId);
    const slug = await this.uniqueSlug(scopedCompanyId, dto.name);

    try {
      const category = await this.prisma.category.create({
        data: {
          companyId: scopedCompanyId,
          name: dto.name.trim(),
          slug,
        },
      });
      return this.toDto(category);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya existe una categoría con ese nombre");
      }
      throw error;
    }
  }

  async update(
    companyId: string | null,
    categoryId: string,
    dto: UpdateCategoryDto,
  ): Promise<CategoryDto> {
    const scopedCompanyId = this.requireCompany(companyId);
    await this.findOwned(scopedCompanyId, categoryId);

    const slug = await this.uniqueSlug(scopedCompanyId, dto.name, categoryId);

    try {
      const category = await this.prisma.category.update({
        where: { id: categoryId },
        data: { name: dto.name.trim(), slug },
      });
      return this.toDto(category);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya existe una categoría con ese nombre");
      }
      throw error;
    }
  }

  async remove(companyId: string | null, categoryId: string): Promise<void> {
    const scopedCompanyId = this.requireCompany(companyId);
    await this.findOwned(scopedCompanyId, categoryId);

    await this.prisma.category.delete({ where: { id: categoryId } });
  }

  private async findOwned(companyId: string, categoryId: string) {
    const category = await this.prisma.category.findFirst({
      where: { id: categoryId, companyId },
    });
    if (!category) {
      throw new NotFoundException("Categoría no encontrada");
    }
    return category;
  }

  private async uniqueSlug(companyId: string, name: string, excludeId?: string): Promise<string> {
    const base = slugify(name) || "categoria";
    let candidate = base;
    let suffix = 2;

    while (true) {
      const existing = await this.prisma.category.findFirst({
        where: {
          companyId,
          slug: candidate,
          ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
      });
      if (!existing) {
        return candidate;
      }
      candidate = `${base}-${suffix}`;
      suffix += 1;
    }
  }

  private requireCompany(companyId: string | null): string {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }
    return companyId;
  }

  private toDto(category: {
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
}
