import { ConflictException, Injectable } from "@nestjs/common";
import type { AuthUser, UserRole } from "@commerce-ai/types";
import { Prisma, type User } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async create(data: {
    name: string;
    email: string;
    passwordHash: string;
    role: UserRole;
  }): Promise<User> {
    try {
      return await this.prisma.user.create({ data });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ya existe una cuenta con ese email");
      }
      throw error;
    }
  }

  toPublicUser(user: User): AuthUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    };
  }
}
