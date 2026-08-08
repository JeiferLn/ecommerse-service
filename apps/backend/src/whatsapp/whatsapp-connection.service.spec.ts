import { BadRequestException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { KnowledgeService } from "../knowledge/knowledge.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";

describe("WhatsAppConnectionService prerequisites", () => {
  let service: WhatsAppConnectionService;
  let prisma: {
    company: { findUnique: jest.Mock };
    whatsAppConnection: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
    };
  };
  let knowledgeService: {
    isConfigured: jest.Mock;
    getMissingTypes: jest.Mock;
  };

  beforeEach(async () => {
    prisma = {
      company: { findUnique: jest.fn() },
      whatsAppConnection: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
      },
    };
    knowledgeService = {
      isConfigured: jest.fn(),
      getMissingTypes: jest.fn().mockResolvedValue(["guide", "faq"]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppConnectionService,
        { provide: PrismaService, useValue: prisma },
        { provide: KnowledgeService, useValue: knowledgeService },
      ],
    }).compile();

    service = module.get(WhatsAppConnectionService);
  });

  it("falla si envíos no están configurados", async () => {
    prisma.company.findUnique.mockResolvedValue({
      countryCode: null,
      shippingScopes: [],
      shippingCarriers: [],
    });

    await expect(service.assertWhatsAppPrerequisites("company-a")).rejects.toThrow(
      BadRequestException,
    );
    expect(knowledgeService.isConfigured).not.toHaveBeenCalled();
  });

  it("falla si faltan PDFs de conocimiento", async () => {
    prisma.company.findUnique.mockResolvedValue({
      countryCode: "CO",
      shippingScopes: ["national"],
      shippingCarriers: ["Servientrega"],
    });
    knowledgeService.isConfigured.mockResolvedValue(false);

    await expect(service.assertWhatsAppPrerequisites("company-a")).rejects.toThrow(
      /4 PDFs obligatorios/,
    );
  });

  it("pasa con envíos + 4 PDFs + Mercado Pago", async () => {
    prisma.company.findUnique.mockResolvedValue({
      countryCode: "CO",
      shippingScopes: ["national"],
      shippingCarriers: ["Servientrega"],
      mercadoPagoConnection: { accessToken: "TEST-token" },
    });
    knowledgeService.isConfigured.mockResolvedValue(true);

    await expect(service.assertWhatsAppPrerequisites("company-a")).resolves.toBeUndefined();
  });

  it("falla si Mercado Pago no está conectado", async () => {
    prisma.company.findUnique.mockResolvedValue({
      countryCode: "CO",
      shippingScopes: ["national"],
      shippingCarriers: ["Servientrega"],
      mercadoPagoConnection: null,
    });
    knowledgeService.isConfigured.mockResolvedValue(true);

    await expect(service.assertWhatsAppPrerequisites("company-a")).rejects.toThrow(
      /Mercado Pago/,
    );
  });

  it("upsert exige prerequisites", async () => {
    prisma.company.findUnique.mockResolvedValue({
      countryCode: "CO",
      shippingScopes: ["national"],
      shippingCarriers: ["Servientrega"],
      mercadoPagoConnection: { accessToken: "TEST-token" },
    });
    knowledgeService.isConfigured.mockResolvedValue(false);

    await expect(
      service.upsert("company-a", {
        twilioWhatsAppNumber: "+14155238886",
        isActive: true,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.whatsAppConnection.upsert).not.toHaveBeenCalled();
  });
});
