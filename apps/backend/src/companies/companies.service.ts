import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  CompanyDetails,
  CompanyInvitation,
  CompanyMember,
  InviteResult,
  RemoveMemberResult,
  ShippingScope,
} from "@commerce-ai/types";
import { isCompanyCommerceConfigured, isSupportedCompanyCountry } from "@commerce-ai/types";
import type { Company, MercadoPagoConnection } from "@prisma/client";
import { randomBytes } from "node:crypto";

import { KnowledgeService } from "../knowledge/knowledge.service";
import { MailService } from "../mail/mail.service";
import { MercadoPagoConnectionService } from "../payments/mercadopago-connection.service";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { UsersService } from "../users/users.service";
import { CreateCompanyDto } from "./dto/create-company.dto";
import { UpdateCompanyCommerceDto } from "./dto/update-company-commerce.dto";
import { UpdateCompanyDto } from "./dto/update-company.dto";

const COMPANY_DETAILS_SELECT = {
  id: true,
  name: true,
  type: true,
  phone: true,
  contactEmail: true,
  website: true,
  address: true,
  description: true,
  countryCode: true,
  shippingRegion: true,
  shippingCity: true,
  shippingScopes: true,
  paymentMethods: true,
  shippingCarriers: true,
  banks: true,
  createdAt: true,
  mercadoPagoConnection: true,
} as const;

@Injectable()
export class CompaniesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly configService: ConfigService,
    private readonly knowledgeService: KnowledgeService,
    private readonly mercadoPagoConnection: MercadoPagoConnectionService,
    private readonly billing: BillingService,
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

  async getCompany(companyId: string | null): Promise<CompanyDetails> {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    const company = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: COMPANY_DETAILS_SELECT,
    });

    if (!company) {
      throw new NotFoundException("Empresa no encontrada");
    }

    return await this.toCompanyDetails(company);
  }

  async updateCompany(
    companyId: string | null,
    dto: UpdateCompanyDto,
  ): Promise<CompanyDetails> {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    const existing = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true },
    });

    if (!existing) {
      throw new NotFoundException("Empresa no encontrada");
    }

    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        name: dto.name,
        type: dto.companyType,
        phone: this.nullableText(dto.phone),
        contactEmail: this.nullableText(dto.contactEmail)?.toLowerCase() ?? null,
        website: this.nullableText(dto.website),
        address: this.nullableText(dto.address),
        description: this.nullableText(dto.description),
      },
      select: COMPANY_DETAILS_SELECT,
    });

    return await this.toCompanyDetails(company);
  }

  async updateCommerceSettings(
    companyId: string | null,
    dto: UpdateCompanyCommerceDto,
  ): Promise<CompanyDetails> {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }

    const existing = await this.prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, countryCode: true },
    });
    if (!existing) {
      throw new NotFoundException("Empresa no encontrada");
    }

    const shippingCarriers = this.normalizeStringList(dto.shippingCarriers);
    const shippingRegion = this.nullableText(dto.shippingRegion ?? undefined);
    const shippingCity = this.nullableText(dto.shippingCity ?? undefined);

    // País se fija en el registro; solo se puede completar si aún es null (empresas legacy).
    let countryCode = existing.countryCode;
    if (!countryCode) {
      const incoming = dto.countryCode?.trim() ? dto.countryCode.trim().toUpperCase() : null;
      if (incoming && !isSupportedCompanyCountry(incoming)) {
        throw new BadRequestException(
          "Selecciona un país con soporte de Mercado Pago (LatAm)",
        );
      }
      countryCode = incoming;
    }

    if (dto.shippingScopes.length > 0 && shippingCarriers.length === 0) {
      throw new BadRequestException(
        "Indica al menos una empresa de transporte / transportadora",
      );
    }

    if (dto.shippingScopes.includes("local") && (!shippingRegion || !shippingCity)) {
      throw new BadRequestException(
        "Indica departamento y municipio base de la tienda para validar envíos locales",
      );
    }

    const company = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        countryCode,
        shippingRegion,
        shippingCity,
        shippingScopes: dto.shippingScopes,
        shippingCarriers,
        // El pago lo maneja la pasarela (Fase 9); no lo configura la tienda en el chat.
        paymentMethods: [],
        banks: [],
      },
      select: COMPANY_DETAILS_SELECT,
    });

    return await this.toCompanyDetails(company);
  }

  private nullableText(value: string | undefined): string | null {
    if (value == null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  private normalizeStringList(values: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
      const trimmed = value.trim().replace(/\s+/g, " ");
      if (!trimmed) {
        continue;
      }
      const key = trimmed.toLowerCase();
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      result.push(trimmed);
    }
    return result;
  }

  private async toCompanyDetails(company: {
    id: string;
    name: string;
    type: CompanyDetails["type"];
    phone: string | null;
    contactEmail: string | null;
    website: string | null;
    address: string | null;
    description: string | null;
    countryCode: string | null;
    shippingRegion: string | null;
    shippingCity: string | null;
    shippingScopes: string[];
    paymentMethods: string[];
    shippingCarriers: string[];
    banks: string[];
    createdAt: Date;
    mercadoPagoConnection?: MercadoPagoConnection | null;
  }): Promise<CompanyDetails> {
    const shippingScopes = company.shippingScopes as ShippingScope[];
    const [knowledge, activeProducts, playground, whatsapp] = await Promise.all([
      this.knowledgeService.getSettings(company.id),
      this.prisma.product.count({ where: { companyId: company.id, status: "active" } }),
      this.prisma.conversation.findFirst({
        where: { companyId: company.id, isPlayground: true },
        select: { id: true },
      }),
      this.prisma.whatsAppConnection.findUnique({
        where: { companyId: company.id },
        select: { isActive: true },
      }),
    ]);
    const payments = this.mercadoPagoConnection.toPaymentsSettings(
      company.mercadoPagoConnection ?? null,
    );
    return {
      id: company.id,
      name: company.name,
      type: company.type,
      phone: company.phone,
      contactEmail: company.contactEmail,
      website: company.website,
      address: company.address,
      description: company.description,
      commerce: {
        countryCode: company.countryCode,
        shippingRegion: company.shippingRegion,
        shippingCity: company.shippingCity,
        shippingScopes,
        shippingCarriers: company.shippingCarriers,
        isConfigured: isCompanyCommerceConfigured({
          countryCode: company.countryCode,
          shippingRegion: company.shippingRegion,
          shippingCity: company.shippingCity,
          shippingScopes,
          shippingCarriers: company.shippingCarriers,
        }),
      },
      knowledge,
      payments,
      onboarding: {
        activeProducts,
        playgroundTried: Boolean(playground),
        whatsappAssigned: Boolean(whatsapp),
        whatsappActive: Boolean(whatsapp?.isActive),
      },
      createdAt: company.createdAt.toISOString(),
    };
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
        data: {
          name: dto.name,
          type: dto.companyType,
          countryCode: dto.countryCode.trim().toUpperCase(),
          ownerId: userId,
        },
      });

      await tx.companyMembership.create({
        data: { userId, companyId: company.id, role: "owner" },
      });

      await this.billing.startTrialForCompany(tx, company.id, null);

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

    await this.billing.assertCan(companyId, "invite_member");

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
