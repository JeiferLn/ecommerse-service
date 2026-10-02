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
import { isCompanyCommerceConfigured, isCompanyPaymentsConfigured } from "@commerce-ai/types";
import { ConfigService } from "@nestjs/config";
import { Prisma, type WhatsAppConnectionMode } from "@prisma/client";

import { BillingService } from "../billing/billing.service";
import type { Env } from "../config/env.validation";
import { PrismaService } from "../prisma/prisma.service";
import { UpsertWhatsAppConnectionDto } from "./dto/upsert-connection.dto";
import { normalizeWhatsAppE164 } from "./phone.util";
import { buildWaMeLink, slugifyStoreCode } from "./store-code.util";

type ConnectionRecord = {
  id: string;
  companyId: string;
  twilioWhatsAppNumber: string;
  displayPhoneNumber: string | null;
  mode: WhatsAppConnectionMode;
  storeCode: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

@Injectable()
export class WhatsAppConnectionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Número de la plataforma que comparten las tiendas sin número propio, o null si no está configurado. */
  getSharedNumber(): string | null {
    const raw = this.config.get("TWILIO_SHARED_WHATSAPP_NUMBER", { infer: true })?.trim();
    if (!raw) {
      return null;
    }
    const normalized = normalizeWhatsAppE164(raw);
    return /^\+[1-9]\d{7,14}$/.test(normalized) ? normalized : null;
  }

  /**
   * WhatsApp requiere un producto activo + envíos + Mercado Pago conectado.
   * Los documentos de conocimiento son opcionales: solo mejoran las respuestas.
   * "Prueba tu asistente" no cobra, así que puede omitir Mercado Pago.
   */
  async assertWhatsAppPrerequisites(
    companyId: string | null,
    { requirePayments = true }: { requirePayments?: boolean } = {},
  ): Promise<void> {
    await this.billing.assertCan(companyId, "connect_whatsapp");
    const scopedCompanyId = this.requireCompany(companyId);
    const [company, activeProducts] = await Promise.all([
      this.prisma.company.findUnique({
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
      }),
      this.prisma.product.count({
        where: { companyId: scopedCompanyId, status: "active" },
      }),
    ]);
    if (activeProducts === 0) {
      throw new BadRequestException(
        "Activa al menos un producto en Catálogo → Productos antes de usar el asistente.",
      );
    }
    if (!company || !isCompanyCommerceConfigured(company)) {
      throw new BadRequestException(
        "Configura los envíos (país, cobertura y transportadoras) en Configuración → Envíos antes de usar WhatsApp. Solo el dueño de la empresa puede hacerlo.",
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
      include: { company: { select: { name: true } } },
    });
    return connection ? this.toDto(connection, connection.company.name) : null;
  }

  /**
   * Activa el canal con el número de la plataforma, sin intervención del admin.
   * Si la tienda ya tiene conexión (compartida o propia), la devuelve tal cual.
   */
  async activateShared(companyId: string | null): Promise<WhatsAppConnectionDto> {
    const scopedCompanyId = this.requireCompany(companyId);
    const existing = await this.prisma.whatsAppConnection.findUnique({
      where: { companyId: scopedCompanyId },
      include: { company: { select: { name: true } } },
    });
    if (existing) {
      return this.toDto(existing, existing.company.name);
    }

    await this.assertWhatsAppPrerequisites(scopedCompanyId);
    const sharedNumber = this.getSharedNumber();
    if (!sharedNumber) {
      throw new BadRequestException(
        "El número compartido de la plataforma no está configurado. Escríbenos para activar tu canal.",
      );
    }

    const company = await this.prisma.company.findUnique({
      where: { id: scopedCompanyId },
      select: { name: true },
    });
    const storeName = company?.name ?? "";
    const base = slugifyStoreCode(storeName);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const storeCode = await this.nextFreeStoreCode(base);
      try {
        const connection = await this.prisma.whatsAppConnection.create({
          data: {
            companyId: scopedCompanyId,
            twilioWhatsAppNumber: sharedNumber,
            displayPhoneNumber: null,
            mode: "shared",
            storeCode,
            isActive: true,
          },
        });
        return this.toDto(connection, storeName);
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")) {
          throw error;
        }
        const raced = await this.prisma.whatsAppConnection.findUnique({
          where: { companyId: scopedCompanyId },
        });
        if (raced) {
          return this.toDto(raced, storeName);
        }
      }
    }
    throw new ConflictException("No se pudo generar el código de tu tienda. Inténtalo de nuevo.");
  }

  /** Número propio asignado por la plataforma (reemplaza la conexión compartida si la había). */
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
    if (twilioWhatsAppNumber === this.getSharedNumber()) {
      throw new BadRequestException(
        "Ese es el número compartido de la plataforma; asígnale a la tienda un número propio.",
      );
    }
    const displayPhoneNumber = dto.displayPhoneNumber?.trim() || twilioWhatsAppNumber;

    try {
      const connection = await this.prisma.whatsAppConnection.upsert({
        where: { companyId: scopedCompanyId },
        create: {
          companyId: scopedCompanyId,
          twilioWhatsAppNumber,
          displayPhoneNumber,
          mode: "dedicated",
          isActive,
        },
        update: {
          twilioWhatsAppNumber,
          displayPhoneNumber,
          mode: "dedicated",
          storeCode: null,
          isActive,
          sharedSessions: { deleteMany: {} },
        },
        include: { company: { select: { name: true } } },
      });
      return this.toDto(connection, connection.company.name);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new ConflictException("Ese número de WhatsApp ya está asignado a otra empresa");
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
      throw new NotFoundException("Tu tienda aún no tiene el canal de WhatsApp activado");
    }
    if (isActive) {
      await this.assertWhatsAppPrerequisites(scopedCompanyId);
    }
    const connection = await this.prisma.whatsAppConnection.update({
      where: { companyId: scopedCompanyId },
      data: { isActive },
      include: { company: { select: { name: true } } },
    });
    return this.toDto(connection, connection.company.name);
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

    const activeByCompany = new Map(activeProducts.map((row) => [row.companyId, row._count._all]));

    return companies.map((company) => {
      const requirements = {
        products: (activeByCompany.get(company.id) ?? 0) > 0,
        shipping: isCompanyCommerceConfigured(company),
        payments: isCompanyPaymentsConfigured(company.mercadoPagoConnection),
      };
      const ready = Object.values(requirements).every(Boolean);
      return {
        id: company.id,
        name: company.name,
        type: company.type,
        ownerName: company.owner.name,
        ownerEmail: company.owner.email,
        membersCount: company._count.memberships,
        productsCount: company._count.products,
        createdAt: company.createdAt.toISOString(),
        planCode: company.subscription?.plan.code ?? null,
        subscriptionStatus: company.subscription?.status ?? null,
        requirements,
        awaitingNumber: ready && !company.whatsappConnection,
        whatsapp: company.whatsappConnection
          ? this.toDto(company.whatsappConnection, company.name)
          : null,
      };
    });
  }

  private requireCompany(companyId: string | null): string {
    if (!companyId) {
      throw new BadRequestException("No perteneces a una empresa");
    }
    return companyId;
  }

  /** Primer código libre a partir de `base`: base, base-2, base-3… */
  private async nextFreeStoreCode(base: string): Promise<string> {
    const taken = await this.prisma.whatsAppConnection.findMany({
      where: { storeCode: { startsWith: base } },
      select: { storeCode: true },
    });
    const used = new Set(taken.map((row) => row.storeCode));
    if (!used.has(base)) {
      return base;
    }
    for (let suffix = 2; ; suffix += 1) {
      const candidate = `${base}-${suffix}`;
      if (!used.has(candidate)) {
        return candidate;
      }
    }
  }

  private toDto(connection: ConnectionRecord, storeName?: string | null): WhatsAppConnectionDto {
    const shared = connection.mode === "shared";
    const waMeLink = buildWaMeLink({
      number: shared
        ? connection.twilioWhatsAppNumber
        : connection.displayPhoneNumber || connection.twilioWhatsAppNumber,
      storeCode: shared ? connection.storeCode : null,
      storeName,
    });
    return {
      id: connection.id,
      companyId: connection.companyId,
      twilioWhatsAppNumber: connection.twilioWhatsAppNumber,
      displayPhoneNumber: connection.displayPhoneNumber,
      mode: connection.mode,
      storeCode: connection.storeCode,
      isActive: connection.isActive,
      waMeLink,
      createdAt: connection.createdAt.toISOString(),
      updatedAt: connection.updatedAt.toISOString(),
    };
  }
}
