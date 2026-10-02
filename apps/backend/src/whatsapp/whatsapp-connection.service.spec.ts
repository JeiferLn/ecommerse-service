import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { BillingService } from "../billing/billing.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";

const READY_COMPANY = {
  name: "Tienda Ñandú",
  countryCode: "CO",
  shippingScopes: ["national"],
  shippingCarriers: ["Servientrega"],
  mercadoPagoConnection: { accessToken: "TEST-token" },
};

describe("WhatsAppConnectionService prerequisites", () => {
  let service: WhatsAppConnectionService;
  let sharedNumber: string | undefined;
  let prisma: {
    company: { findUnique: jest.Mock };
    product: { count: jest.Mock };
    whatsAppConnection: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
  };

  beforeEach(async () => {
    sharedNumber = undefined;
    prisma = {
      company: { findUnique: jest.fn() },
      product: { count: jest.fn().mockResolvedValue(1) },
      whatsAppConnection: {
        findUnique: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppConnectionService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: BillingService,
          useValue: { assertCan: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === "TWILIO_SHARED_WHATSAPP_NUMBER" ? sharedNumber : undefined,
          },
        },
      ],
    }).compile();

    service = module.get(WhatsAppConnectionService);
  });

  it("falla si no hay productos activos", async () => {
    prisma.product.count.mockResolvedValue(0);
    prisma.company.findUnique.mockResolvedValue(READY_COMPANY);

    await expect(service.assertWhatsAppPrerequisites("company-a")).rejects.toThrow(/producto/);
  });

  it("falla si envíos no están configurados", async () => {
    prisma.company.findUnique.mockResolvedValue({
      countryCode: null,
      shippingScopes: [],
      shippingCarriers: [],
    });

    await expect(service.assertWhatsAppPrerequisites("company-a")).rejects.toThrow(/envíos/);
  });

  it("pasa con productos + envíos + Mercado Pago, sin documentos", async () => {
    prisma.company.findUnique.mockResolvedValue(READY_COMPANY);

    await expect(service.assertWhatsAppPrerequisites("company-a")).resolves.toBeUndefined();
  });

  it("falla si Mercado Pago no está conectado", async () => {
    prisma.company.findUnique.mockResolvedValue({ ...READY_COMPANY, mercadoPagoConnection: null });

    await expect(service.assertWhatsAppPrerequisites("company-a")).rejects.toThrow(/Mercado Pago/);
  });

  it("el playground no exige Mercado Pago", async () => {
    prisma.company.findUnique.mockResolvedValue({ ...READY_COMPANY, mercadoPagoConnection: null });

    await expect(
      service.assertWhatsAppPrerequisites("company-a", { requirePayments: false }),
    ).resolves.toBeUndefined();
  });

  it("upsert exige prerequisites", async () => {
    prisma.company.findUnique.mockResolvedValue({ ...READY_COMPANY, mercadoPagoConnection: null });

    await expect(
      service.upsert("company-a", {
        twilioWhatsAppNumber: "+14155238886",
        isActive: true,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.whatsAppConnection.upsert).not.toHaveBeenCalled();
  });

  it("upsert rechaza el número compartido como número propio", async () => {
    sharedNumber = "+15554447456";
    prisma.company.findUnique.mockResolvedValue(READY_COMPANY);

    await expect(
      service.upsert("company-a", { twilioWhatsAppNumber: "+15554447456", isActive: true }),
    ).rejects.toThrow(/compartido/);
    expect(prisma.whatsAppConnection.upsert).not.toHaveBeenCalled();
  });

  describe("activateShared", () => {
    beforeEach(() => {
      sharedNumber = "+1 555 444 7456";
      prisma.company.findUnique.mockResolvedValue(READY_COMPANY);
      prisma.whatsAppConnection.findUnique.mockResolvedValue(null);
      prisma.whatsAppConnection.create.mockImplementation(({ data }) =>
        Promise.resolve({
          id: "conn-1",
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        }),
      );
    });

    it("crea la conexión compartida con un código libre y el enlace con código", async () => {
      prisma.whatsAppConnection.findMany.mockResolvedValue([{ storeCode: "tienda-nandu" }]);

      const result = await service.activateShared("company-a");

      expect(prisma.whatsAppConnection.create).toHaveBeenCalledWith({
        data: {
          companyId: "company-a",
          twilioWhatsAppNumber: "+15554447456",
          displayPhoneNumber: null,
          mode: "shared",
          storeCode: "tienda-nandu-2",
          isActive: true,
        },
      });
      expect(result.mode).toBe("shared");
      expect(result.waMeLink).toBe(
        `https://wa.me/15554447456?text=${encodeURIComponent("Hola Tienda Ñandú #tienda-nandu-2")}`,
      );
    });

    it("exige los requisitos antes de activar", async () => {
      prisma.company.findUnique.mockResolvedValue({
        ...READY_COMPANY,
        mercadoPagoConnection: null,
      });

      await expect(service.activateShared("company-a")).rejects.toThrow(/Mercado Pago/);
      expect(prisma.whatsAppConnection.create).not.toHaveBeenCalled();
    });

    it("falla con un mensaje claro si el número compartido no está configurado", async () => {
      sharedNumber = undefined;

      await expect(service.activateShared("company-a")).rejects.toThrow(/no está configurado/);
      expect(prisma.whatsAppConnection.create).not.toHaveBeenCalled();
    });

    it("si ya tiene canal lo devuelve sin crear otro", async () => {
      prisma.whatsAppConnection.findUnique.mockResolvedValue({
        id: "conn-own",
        companyId: "company-a",
        twilioWhatsAppNumber: "+14155238886",
        displayPhoneNumber: "+573001112233",
        mode: "dedicated",
        storeCode: null,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        company: { name: "Tienda Ñandú" },
      });

      const result = await service.activateShared("company-a");

      expect(prisma.whatsAppConnection.create).not.toHaveBeenCalled();
      expect(result.waMeLink).toBe("https://wa.me/573001112233");
    });
  });
});
