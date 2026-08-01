import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  CompanyInvitation,
  CompanyMember,
  InviteResult,
  RemoveMemberResult,
} from "@commerce-ai/types";
import type { Company } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { CreateCompanyDto } from "./dto/create-company.dto";

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
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

  async listPendingInvitations(companyId: string | null): Promise<CompanyInvitation[]> {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    await this.prisma.invitation.deleteMany({
      where: { companyId, expiresAt: { lte: new Date() } },
    });

    const invitations = await this.prisma.invitation.findMany({
      where: { companyId },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, createdAt: true },
    });

    return invitations.map((invitation) => ({
      id: invitation.id,
      email: invitation.email,
      createdAt: invitation.createdAt.toISOString(),
    }));
  }

  async cancelInvitation(companyId: string | null, invitationId: string): Promise<InviteResult> {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation || invitation.companyId !== companyId) {
      throw new NotFoundException("Invitación no encontrada");
    }

    await this.prisma.invitation.delete({ where: { id: invitationId } });

    return {
      status: "cancelled",
      message: "Invitación cancelada",
    };
  }

  async createCompany(userId: string, dto: CreateCompanyDto): Promise<Company> {
    const user = await this.usersService.findById(userId);

    if (!user) {
      throw new UnauthorizedException("Usuario no encontrado");
    }

    if (user.role === "admin") {
      throw new BadRequestException("Un administrador de la plataforma no puede crear una empresa");
    }

    const ownerMembership = await this.prisma.companyMembership.findFirst({
      where: { userId, role: "owner" },
    });

    if (ownerMembership) {
      throw new ConflictException("Ya eres dueño de una empresa");
    }

    return this.prisma.$transaction(async (tx) => {
      const company = await tx.company.create({
        data: { name: dto.name, type: dto.companyType, ownerId: userId },
      });

      await tx.companyMembership.create({
        data: { userId, companyId: company.id, role: "owner" },
      });

      return company;
    });
  }

  async updateMemberRole(
    companyId: string | null,
    memberUserId: string,
    role: "user" | "manager",
  ): Promise<CompanyMember> {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId: memberUserId, companyId } },
      include: { user: true },
    });

    if (!membership) {
      throw new NotFoundException("Ese usuario no es miembro de esta empresa");
    }

    if (membership.role === "owner") {
      throw new BadRequestException("No puedes cambiar el rol del dueño de la empresa");
    }

    await this.prisma.companyMembership.update({
      where: { userId_companyId: { userId: memberUserId, companyId } },
      data: { role },
    });

    return {
      id: membership.user.id,
      name: membership.user.name,
      email: membership.user.email,
      role,
    };
  }

  async removeMember(
    companyId: string | null,
    actorUserId: string,
    memberUserId: string,
  ): Promise<RemoveMemberResult> {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    if (actorUserId === memberUserId) {
      throw new BadRequestException("No puedes eliminarte a ti mismo de la empresa");
    }

    const membership = await this.prisma.companyMembership.findUnique({
      where: { userId_companyId: { userId: memberUserId, companyId } },
    });

    if (!membership) {
      throw new NotFoundException("Ese usuario no es miembro de esta empresa");
    }

    if (membership.role === "owner") {
      throw new BadRequestException("No puedes eliminar al dueño de la empresa");
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.companyMembership.delete({
        where: { userId_companyId: { userId: memberUserId, companyId } },
      });

      await tx.refreshToken.updateMany({
        where: { userId: memberUserId, companyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return {
      message: "Miembro eliminado de la empresa",
    };
  }

  private get invitationTtlSeconds(): number {
    return this.configService.get<number>("INVITATION_TTL_SECONDS") ?? 3600;
  }

  async invite(companyId: string | null, email: string): Promise<InviteResult> {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    const normalizedEmail = email.toLowerCase();
    const existing = await this.usersService.findByEmail(normalizedEmail);

    if (existing?.role === "admin") {
      throw new BadRequestException("No se puede invitar a un administrador de la plataforma");
    }

    if (existing) {
      const existingMembership = await this.prisma.companyMembership.findUnique({
        where: { userId_companyId: { userId: existing.id, companyId } },
      });

      if (existingMembership) {
        throw new ConflictException("Ese usuario ya es miembro de esta empresa");
      }
    }

    const pendingInvitation = await this.prisma.invitation.findUnique({
      where: { companyId_email: { companyId, email: normalizedEmail } },
    });

    if (pendingInvitation) {
      if (pendingInvitation.expiresAt > new Date()) {
        throw new ConflictException("Ya existe una invitación pendiente para ese email");
      }
      await this.prisma.invitation.delete({ where: { id: pendingInvitation.id } });
    }

    const invitation = await this.prisma.invitation.create({
      data: {
        token: randomBytes(32).toString("hex"),
        companyId,
        email: normalizedEmail,
        expiresAt: new Date(Date.now() + this.invitationTtlSeconds * 1000),
      },
    });

    try {
      const company = await this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { name: true },
      });
      const frontendUrl = this.configService.getOrThrow<string>("FRONTEND_URL");

      await this.mailService.sendCompanyInvitation({
        to: invitation.email,
        companyName: company.name,
        registerUrl: `${frontendUrl}/register/invitation?token=${invitation.token}`,
      });
    } catch (error) {
      await this.prisma.invitation.delete({ where: { id: invitation.id } });
      throw error;
    }

    return {
      status: "pending",
      message: "Invitación enviada: revisa el correo para aceptarla",
    };
  }
}
