import { Injectable } from "@nestjs/common";
import type { AuthUser } from "@commerce-ai/types";
import { type Prisma, type User } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";

type UserWithMemberships = Prisma.UserGetPayload<{
  include: { memberships: { include: { company: true } } };
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async toAuthUser(userId: string, companyId: string | null): Promise<AuthUser | null> {
    const user = await this.findWithMemberships(userId);

    if (!user) {
      return null;
    }

    return this.mapToAuthUser(user, companyId);
  }

  private async findWithMemberships(id: string): Promise<UserWithMemberships | null> {
    return this.prisma.user.findUnique({
      where: { id },
      include: { memberships: { include: { company: true } } },
    });
  }

  private mapToAuthUser(user: UserWithMemberships, companyId: string | null): AuthUser {
    const companies = user.memberships.map((membership) => ({
      id: membership.companyId,
      name: membership.company.name,
      type: membership.company.type,
      role: membership.role,
    }));

    const activeMembership = user.memberships.find(
      (membership) => membership.companyId === companyId,
    );

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      role: activeMembership?.role ?? user.role,
      companyId: activeMembership ? companyId : null,
      companies,
    };
  }
}
