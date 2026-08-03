import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { WhatsAppConnection as WhatsAppConnectionDto } from "@commerce-ai/types";
import { Prisma } from "@prisma/client";

import { PrismaService } from "../prisma/prisma.service";
import { UpsertWhatsAppConnectionDto } from "./dto/upsert-connection.dto";

@Injectable()
export class WhatsAppConnectionService {
  constructor(private readonly prisma: PrismaService) {}

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
    const scopedCompanyId = this.requireCompany(companyId);
    const phoneNumberId = dto.phoneNumberId.trim();
    const accessToken = dto.accessToken?.trim() || null;
    const displayPhoneNumber = dto.displayPhoneNumber?.trim() || null;
    const wabaId = dto.wabaId?.trim() || null;

    const existing = await this.prisma.whatsAppConnection.findUnique({
      where: { companyId: scopedCompanyId },
    });

    if (!existing && !accessToken) {
      throw new BadRequestException("accessToken es obligatorio al crear la conexión");
    }

    try {
      const connection = await this.prisma.whatsAppConnection.upsert({
        where: { companyId: scopedCompanyId },
        create: {
          companyId: scopedCompanyId,
          phoneNumberId,
          accessToken: accessToken!,
          displayPhoneNumber,
          wabaId,
          isActive: dto.isActive ?? true,
        },
        update: {
          phoneNumberId,
          ...(accessToken ? { accessToken } : {}),
          displayPhoneNumber,
          wabaId,
          ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
        },
      });
      return this.toDto(connection);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException(
          "Ese phoneNumberId ya está vinculado a otra empresa",
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

  private maskToken(token: string): string {
    if (token.length <= 8) {
      return "••••••••";
    }
    return `${token.slice(0, 4)}…${token.slice(-4)}`;
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
    phoneNumberId: string;
    wabaId: string | null;
    displayPhoneNumber: string | null;
    accessToken: string;
    isActive: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): WhatsAppConnectionDto {
    return {
      id: connection.id,
      companyId: connection.companyId,
      phoneNumberId: connection.phoneNumberId,
      wabaId: connection.wabaId,
      displayPhoneNumber: connection.displayPhoneNumber,
      accessTokenMasked: this.maskToken(connection.accessToken),
      isActive: connection.isActive,
      waMeLink: this.buildWaMeLink(connection.displayPhoneNumber),
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }
}
