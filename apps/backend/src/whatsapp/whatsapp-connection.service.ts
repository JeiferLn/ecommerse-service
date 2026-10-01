import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type {
  AdminCompanyRow,
  CompanyType,
  WhatsAppConnection as WhatsAppConnectionDto,
} from "@commerce-ai/types";
import {
  isCompanyCommerceConfigured,
  isCompanyKnowledgeConfigured,
  isCompanyPaymentsConfigured,
  KNOWLEDGE_DOCUMENT_TYPE_LABELS,
} from "@commerce-ai/types";
import { Prisma } from "@prisma/client";

import { KnowledgeService } from "../knowledge/knowledge.service";
import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpsertWhatsAppConnectionDto } from "./dto/upsert-connection.dto";
import { normalizeWhatsAppE164 } from "./phone.util";

@Injectable()
export class WhatsAppConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeService: KnowledgeService,
    private readonly billing: BillingService,
  ) {}

  /**
   * WhatsApp requiere envíos + 4 PDFs de conocimiento + Mercado Pago conectado.
   * "Prueba tu asistente" no cobra, así que puede omitir Mercado Pago.
   */
  async assertWhatsAppPrerequisites(
    companyId: string | null,
    { requirePayments = true }: { requirePayments?: boolean } = {},
  ): Promise<void> {
    await this.billing.assertCan(companyId, "connect_whatsapp");
    const scopedCompanyId = this.requireCompany(companyId);
    const company = await this.prisma.company.findUnique({
      where: { id: scopedCompanyId },
      select: {
        countryCode: true,
        shippingRegion: true,
        shippingCity: true,
        shippingScopes: true,
        shippingCarriers: true,
        mercadoPagoConnection: {
          select: { accessToken: true },
        },
      },
    });
    if (!company || !isCompanyCommerceConfigured(company)) {
      throw new BadRequestException(
        "Configura los envíos (país, cobertura y transportadoras) en Configuración → Envíos antes de usar WhatsApp. Solo el dueño de la empresa puede hacerlo.",
      );
    }

    const knowledgeReady = await this.knowledgeService.isConfigured(scopedCompanyId);
    if (!knowledgeReady) {
      const missing = await this.knowledgeService.getMissingTypes(scopedCompanyId);
      throw new BadRequestException(
        `Sube los 4 PDFs obligatorios en Asistente → Conocimiento antes de usar WhatsApp. Faltan: ${missing.map((type) => KNOWLEDGE_DOCUMENT_TYPE_LABELS[type]).join(", ")}.`,
      );
    }

    if (requirePayments && !isCompanyPaymentsConfigured(company.mercadoPagoConnection)) {
      throw new BadRequestException(
        "Conecta Mercado Pago en Configuración → Pagos antes de usar WhatsApp. El dinero de los pedidos debe ir a la cuenta de tu empresa.",
      );
    }
  }

  /** @deprecated use assertWhatsAppPrerequisites */
  async assertCommerceConfigured(companyId: string | null): Promise<void> {
    await this.assertWhatsAppPrerequisites(companyId);
  }

  async get(companyId: string | null): Promise<WhatsAppConnectionDto | null> {
    const scopedCompanyId = this.requireCompany(companyId);
    const connection = await this.prisma.whatsAppConnection.findUnique({
      where: { companyId: scopedCompanyId },
    });
    return connection ? this.toDto(connection) : null;
  }

  async upsert(
    companyId: string | null,
    dto: UpsertWhatsAppConnectionDto,
  ): Promise<WhatsAppConnectionDto> {
    const isActive = dto.isActive ?? true;
    if (isActive) {
      await this.assertWhatsAppPrerequisites(companyId);
    }
    const scopedCompanyId = this.requireCompany(companyId);
    const twilioWhatsAppNumber = normalizeWhatsAppE164(dto.twilioWhatsAppNumber);
    if (!/^\+[1-9]\d{7,14}$/.test(twilioWhatsAppNumber)) {
      throw new BadRequestException("Usa formato E.164 con +: +14155238886");
    }
    const displayPhoneNumber =
      dto.displayPhoneNumber?.trim() || twilioWhatsAppNumber;

    try {
      const connection = await this.prisma.whatsAppConnection.upsert({
        where: { companyId: scopedCompanyId },
        create: {
          companyId: scopedCompanyId,
          twilioWhatsAppNumber,
          displayPhoneNumber,
          isActive,
        },
        update: {
          twilioWhatsAppNumber,
          displayPhoneNumber,
          isActive,
        },
      });
      return this.toDto(connection);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(
          "Ese número de WhatsApp ya está asignado a otra empresa",
        );
      }
      throw error;
    }
  }

  async remove(companyId: string | null): Promise<void> {
    const scopedCompanyId = this.requireCompany(companyId);
    const existing = await this.prisma.whatsAppConnection.findUnique({
      where: { companyId: scopedCompanyId },
    });
    if (!existing) {
      throw new NotFoundException("Conexión WhatsApp no encontrada");
    }
    await this.prisma.whatsAppConnection.delete({ where: { companyId: scopedCompanyId } });
  }

  /** Pausa o reactiva el asistente sin tocar el número asignado. */
  async setActive(companyId: string | null, isActive: boolean): Promise<WhatsAppConnectionDto> {
    const scopedCompanyId = this.requireCompany(companyId);
    const existing = await this.prisma.whatsAppConnection.findUnique({
      where: { companyId: scopedCompanyId },
    });
    if (!existing) {
      throw new NotFoundException("Tu tienda aún no tiene un número de WhatsApp asignado");
    }
    if (isActive) {
      await this.assertWhatsAppPrerequisites(scopedCompanyId);
    }
    const connection = await this.prisma.whatsAppConnection.update({
      where: { companyId: scopedCompanyId },
      data: { isActive },
    });
    return this.toDto(connection);
  }

  /** Empresas con el estado de sus requisitos y de su número, para el panel de plataforma. */
  async listForAdmin(): Promise<AdminCompanyRow[]> {
    const [companies, activeProducts] = await Promise.all([
      this.prisma.company.findMany({
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          name: true,
          type: true,
          createdAt: true,
          countryCode: true,
          shippingRegion: true,
          shippingCity: true,
          shippingScopes: true,
          shippingCarriers: true,
          owner: { select: { name: true, email: true } },
          mercadoPagoConnection: { select: { accessToken: true } },
          knowledgeDocuments: { select: { type: true, status: true, fileKey: true } },
          subscription: { select: { status: true, plan: { select: { code: true } } } },
          whatsappConnection: true,
          _count: { select: { memberships: true, products: true } },
        },
      }),
      this.prisma.product.groupBy({
        by: ["companyId"],
        where: { status: "active" },
        _count: { _all: true },
      }),
    ]);

    const activeByCompany = new Map(
      activeProducts.map((row) => [row.companyId, row._count._all]),
    );

    return companies.map((company) => {
      const requirements = {
        products: (activeByCompany.get(company.id) ?? 0) > 0,
        shipping: isCompanyCommerceConfigured(company),
        knowledge: isCompanyKnowledgeConfigured(company.knowledgeDocuments),
        payments: isCompanyPaymentsConfigured(company.mercadoPagoConnection),
      };
      const ready = Object.values(requirements).every(Boolean);
      return {
        id: company.id,
        name: company.name,
        type: company.type as CompanyType,
        ownerName: company.owner.name,
        ownerEmail: company.owner.email,
        membersCount: company._count.memberships,
        productsCount: company._count.products,
        createdAt: company.createdAt.toISOString(),
        planCode: company.subscription?.plan.code ?? null,
        subscriptionStatus: company.subscription?.status ?? null,
        requirements,
        awaitingNumber: ready && !company.whatsappConnection,
        whatsapp: company.whatsappConnection ? this.toDto(company.whatsappConnection) : null,
      };
    });
  }

  private requireCompany(companyId: string | null): string {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }
    return companyId;
  }

  private toDto(connection: {
    id: string;
    companyId: string;
    twilioWhatsAppNumber: string;
    displayPhoneNumber: string | null;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): WhatsAppConnectionDto {
    const phoneForLink = (connection.displayPhoneNumber || connection.twilioWhatsAppNumber).replace(
      /\D/g,
      "",
    );
    return {
      id: connection.id,
      companyId: connection.companyId,
      twilioWhatsAppNumber: connection.twilioWhatsAppNumber,
      displayPhoneNumber: connection.displayPhoneNumber,
      isActive: connection.isActive,
      waMeLink: phoneForLink ? `https://wa.me/${phoneForLink}` : null,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }
}
