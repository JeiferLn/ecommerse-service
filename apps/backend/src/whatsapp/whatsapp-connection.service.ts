import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { WhatsAppConnection as WhatsAppConnectionDto } from "@commerce-ai/types";
import { isCompanyCommerceConfigured, isCompanyPaymentsConfigured } from "@commerce-ai/types";
import { Prisma } from "@prisma/client";

import { KnowledgeService } from "../knowledge/knowledge.service";
import { PrismaService } from "../prisma/prisma.service";
import { UpsertWhatsAppConnectionDto } from "./dto/upsert-connection.dto";
import { normalizeWhatsAppE164 } from "./phone.util";

@Injectable()
export class WhatsAppConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly knowledgeService: KnowledgeService,
  ) {}

  /**
   * WhatsApp requiere envíos + 4 PDFs de conocimiento + Mercado Pago conectado.
   */
  async assertWhatsAppPrerequisites(companyId: string | null): Promise<void> {
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
        "Configura envíos (país, cobertura y transportadoras) en Configuración antes de usar WhatsApp. Solo el dueño de la empresa puede hacerlo.",
      );
    }

    const knowledgeReady = await this.knowledgeService.isConfigured(scopedCompanyId);
    if (!knowledgeReady) {
      const missing = await this.knowledgeService.getMissingTypes(scopedCompanyId);
      throw new BadRequestException(
        `Sube los 4 PDFs obligatorios en Configuración → Conocimiento antes de usar WhatsApp. Faltan: ${missing.join(", ")}.`,
      );
    }

    if (!isCompanyPaymentsConfigured(company.mercadoPagoConnection)) {
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
    await this.assertWhatsAppPrerequisites(companyId);
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
          isActive: dto.isActive ?? true,
        },
        update: {
          twilioWhatsAppNumber,
          displayPhoneNumber,
          isActive: dto.isActive ?? true,
        },
      });
      return this.toDto(connection);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(
          "Ese número Twilio WhatsApp ya está vinculado a otra empresa",
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
