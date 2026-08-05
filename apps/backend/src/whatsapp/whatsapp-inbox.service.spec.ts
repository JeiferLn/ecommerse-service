import { NotFoundException } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";

import { PrismaService } from "../prisma/prisma.service";
import { TwilioWhatsAppClient } from "./twilio-whatsapp.client";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import { WhatsAppInboxService } from "./whatsapp-inbox.service";

describe("WhatsAppInboxService", () => {
  let service: WhatsAppInboxService;
  let prisma: {
    conversation: {
      count: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
      update: jest.Mock;
    };
    message: { findMany: jest.Mock; create: jest.Mock };
    whatsAppConnection: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  };
  let twilioClient: { sendText: jest.Mock };

  beforeEach(async () => {
    prisma = {
      conversation: {
        count: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
      },
      message: { findMany: jest.fn(), create: jest.fn() },
      whatsAppConnection: { findUnique: jest.fn() },
      $transaction: jest.fn(async (ops: unknown[]) => {
        if (Array.isArray(ops)) {
          return Promise.all(ops);
        }
        return ops;
      }),
    };
    twilioClient = {
      sendText: jest.fn().mockResolvedValue({ simulated: true, wamid: "SM_out" }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppInboxService,
        { provide: PrismaService, useValue: prisma },
        { provide: TwilioWhatsAppClient, useValue: twilioClient },
        {
          provide: WhatsAppConnectionService,
          useValue: { assertCommerceConfigured: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(WhatsAppInboxService);
  });

  it("lista solo conversaciones de la empresa", async () => {
    prisma.conversation.count.mockResolvedValue(1);
    prisma.conversation.findMany.mockResolvedValue([
      {
        id: "conv-1",
        companyId: "company-a",
        customerWaId: "57300",
        customerName: "Ana",
        handler: "pending",
        lastMessageAt: new Date("2026-08-01T00:00:00.000Z"),
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
        updatedAt: new Date("2026-08-01T00:00:00.000Z"),
        messages: [{ body: "Hola" }],
      },
    ]);

    const result = await service.listConversations("company-a", { page: 1, perPage: 20 });

    expect(prisma.conversation.count).toHaveBeenCalledWith({
      where: { companyId: "company-a" },
    });
    expect(result.items[0]?.customerWaId).toBe("57300");
    expect(result.items[0]?.lastMessagePreview).toBe("Hola");
  });

  it("no expone conversación de otra empresa", async () => {
    prisma.conversation.findFirst.mockResolvedValue(null);
    await expect(service.listMessages("company-a", "conv-x")).rejects.toThrow(NotFoundException);
  });
});
