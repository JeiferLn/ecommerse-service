import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AuthUser } from '../auth/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser) {
    const companyId = this.requireCompanyId(user);
    return this.prisma.category.findMany({
      where: { companyId },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        createdAt: true,
        _count: { select: { products: true } },
      },
    });
  }

  async create(user: AuthUser, dto: CreateCategoryDto) {
    const companyId = this.requireCompanyId(user);
    try {
      return await this.prisma.category.create({
        data: {
          name: dto.name.trim(),
          companyId,
        },
        select: { id: true, name: true, createdAt: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe una categoría con ese nombre');
      }
      throw error;
    }
  }

  async update(user: AuthUser, id: string, dto: UpdateCategoryDto) {
    const companyId = this.requireCompanyId(user);
    await this.getOwned(companyId, id);

    try {
      return await this.prisma.category.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        },
        select: { id: true, name: true, createdAt: true, updatedAt: true },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException('Ya existe una categoría con ese nombre');
      }
      throw error;
    }
  }

  async remove(user: AuthUser, id: string) {
    const companyId = this.requireCompanyId(user);
    await this.getOwned(companyId, id);
    await this.prisma.category.delete({ where: { id } });
    return { success: true };
  }

  private async getOwned(companyId: string, id: string) {
    const category = await this.prisma.category.findFirst({
      where: { id, companyId },
    });
    if (!category) {
      throw new NotFoundException('Categoría no encontrada');
    }
    return category;
  }

  private requireCompanyId(user: AuthUser) {
    if (!user.companyId) {
      throw new ForbiddenException('No perteneces a ninguna empresa');
    }
    return user.companyId;
  }
}
