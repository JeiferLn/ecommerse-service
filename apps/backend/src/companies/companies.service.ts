import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { CompanyInvitation, CompanyMember, InviteResult } from "@commerce-ai/types";
import { randomBytes } from "node:crypto";

import { MailService } from "../mail/mail.service";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";

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
