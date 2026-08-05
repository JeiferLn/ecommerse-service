import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { WhatsAppConnection as WhatsAppConnectionDto } from "@commerce-ai/types";
import { isCompanyCommerceConfigured } from "@commerce-ai/types";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { UpsertWhatsAppConnectionDto } from "./dto/upsert-connection.dto";
import { normalizeWhatsAppE164 } from "./phone.util";

@Injectable()
export class WhatsAppConnectionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * WhatsApp solo se puede usar si el dueño configuró envíos.
   */
  async assertCommerceConfigured(companyId: string | null): Promise<void> {
    const scopedCompanyId = this.requireCompany(companyId);
    const company = await this.prisma.company.findUnique({
      where: { id: scopedCompanyId },
      select: {
        countryCode: true,
        shippingScopes: true,
        shippingCarriers: true,
      },
    });
    if (!company || !isCompanyCommerceConfigured(company)) {
      throw new BadRequestException(
        "Configura envíos (país, cobertura y transportadoras) en Configuración antes de usar WhatsApp. Solo el dueño de la empresa puede hacerlo.",
      );
    }
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
    await this.assertCommerceConfigured(companyId);
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
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      return this.toDto(connection);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(
          "Ese número WhatsApp de Twilio ya está vinculado a otra empresa",
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
      throw new NotFoundException("No hay conexión WhatsApp configurada");
    }
    await this.prisma.whatsAppConnection.delete({ where: { id: existing.id } });
  }

  private requireCompany(companyId: string | null): string {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }
    return companyId;
  }

  private buildWaMeLink(displayPhoneNumber: string | null): string | null {
    if (!displayPhoneNumber) {
      return null;
    }
    const digits = displayPhoneNumber.replace(/\D/g, "");
    if (!digits) {
      return null;
    }
    return `https://wa.me/${digits}`;
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
    return {
      id: connection.id,
      companyId: connection.companyId,
      twilioWhatsAppNumber: connection.twilioWhatsAppNumber,
      displayPhoneNumber: connection.displayPhoneNumber,
      isActive: connection.isActive,
      waMeLink: this.buildWaMeLink(
        connection.displayPhoneNumber ?? connection.twilioWhatsAppNumber,
      ),
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }
}
