import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import type { CompanyMember, InviteResult } from "@commerce-ai/types";
import type { User } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
  ) {}

  async listMembers(companyId: string | null): Promise<CompanyMember[]> {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    const memberships = await this.prisma.companyMembership.findMany({
      where: { companyId },
      include: { user: true },
      orderBy: { createdAt: "asc" },
    });

    return memberships.map((membership) => ({
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      role: membership.role,
    }));
  }

  async invite(companyId: string | null, email: string): Promise<InviteResult> {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    const normalizedEmail = email.toLowerCase();
    const existing = await this.usersService.findByEmail(normalizedEmail);

    if (existing) {
      return this.joinExistingUser(companyId, existing);
    }

    const pendingInvitation = await this.prisma.invitation.findUnique({
      where: { companyId_email: { companyId, email: normalizedEmail } },
    });

    if (pendingInvitation) {
      throw new ConflictException("Ya existe una invitación pendiente para ese email");
    }

    await this.prisma.invitation.create({
      data: { companyId, email: normalizedEmail },
    });

    return {
      status: "pending",
      message: "Invitación enviada: al registrarse con ese email se unirá a la empresa",
    };
  }

  private async joinExistingUser(companyId: string, user: User): Promise<InviteResult> {
    if (user.role === "admin") {
      throw new BadRequestException("No se puede invitar a un administrador de la plataforma");
    }

    const existingMembership = await this.prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId: user.id, companyId } },
    });

    if (existingMembership) {
      throw new ConflictException("Ese usuario ya es miembro de esta empresa");
    }

    await this.prisma.companyMembership.create({
      data: { userId: user.id, companyId, role: "user" },
    });

    return {
      status: "joined",
      message: "El usuario se unió a la empresa",
    };
  }
}
