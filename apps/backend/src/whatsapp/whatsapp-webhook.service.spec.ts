import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppCloudClient } from "./whatsapp-cloud.client";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

describe("WhatsAppWebhookService", () => {
  let service: WhatsAppWebhookService;
  let prisma: {
    whatsAppConnection: { findUnique: jest.Mock };
    conversation: { upsert: jest.Mock; update: jest.Mock };
    message: { create: jest.Mock; updateMany: jest.Mock };
  };
  let cloudClient: { sendText: jest.Mock };
  let configValues: Record<string, unknown>;

  beforeEach(async () => {
    configValues = {
      WHATSAPP_VERIFY_TOKEN: "verify-me",
      WHATSAPP_APP_SECRET: "app-secret",
      WHATSAPP_SKIP_SIGNATURE: false,
      NODE_ENV: "test",
      WHATSAPP_AUTO_REPLY_ENABLED: true,
      WHATSAPP_AUTO_REPLY_TEXT: "Auto reply",
    };

    prisma = {
      whatsAppConnection: { findUnique: jest.fn() },
      conversation: { upsert: jest.fn(), update: jest.fn() },
      message: { create: jest.fn(), updateMany: jest.fn() },
    };
    cloudClient = {
      sendText: jest.fn().mockResolvedValue({ simulated: true, wamid: "wamid.out.1" }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WhatsAppWebhookService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => configValues[key],
          },
        },
        { provide: WhatsAppCloudClient, useValue: cloudClient },
      ],
    }).compile();

    service = module.get(WhatsAppWebhookService);
  });

  it("verifica el challenge del webhook", () => {
    expect(service.verifyChallenge("subscribe", "verify-me", "12345")).toBe("12345");
  });

  it("rechaza challenge con token incorrecto", () => {
    expect(() => service.verifyChallenge("subscribe", "wrong", "12345")).toThrow(
      UnauthorizedException,
    );
  });

  it("aísla ingestión por phoneNumberId / companyId", async () => {
    prisma.whatsAppConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      phoneNumberId: "phone-a",
      accessToken: "dummy-token",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({
      id: "conv-1",
      companyId: "company-a",
      waConnectionId: "conn-1",
      customerWaId: "573001112233",
    });
    prisma.message.create
      .mockResolvedValueOnce({ id: "msg-in-1" })
      .mockResolvedValueOnce({ id: "msg-out-1" });
    prisma.conversation.update.mockResolvedValue({});

    const result = await service.ingestInbound({
      phoneNumberId: "phone-a",
      from: "573001112233",
      text: "Hola",
      customerName: "Cliente",
      wamid: "wamid.in.1",
    });

    expect(prisma.whatsAppConnection.findUnique).toHaveBeenCalledWith({
      where: { phoneNumberId: "phone-a" },
    });
    expect(prisma.conversation.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          companyId: "company-a",
          customerWaId: "573001112233",
        }),
      }),
    );
    expect(result).toEqual({ conversationId: "conv-1", messageId: "msg-in-1" });
    expect(cloudClient.sendText).toHaveBeenCalled();
    expect(prisma.message.create).toHaveBeenCalledTimes(2);
  });

  it("parsea payload Cloud API y procesa mensajes de texto", async () => {
    prisma.whatsAppConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      phoneNumberId: "pnid-1",
      accessToken: "dummy",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1" });
    prisma.message.create
      .mockResolvedValueOnce({ id: "msg-1" })
      .mockResolvedValueOnce({ id: "msg-2" });
    prisma.conversation.update.mockResolvedValue({});

    const processed = await service.handleWebhookPayload({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              value: {
                metadata: { phone_number_id: "pnid-1" },
                contacts: [{ wa_id: "57300", profile: { name: "Ana" } }],
                messages: [
                  {
                    id: "wamid.1",
                    from: "57300",
                    type: "text",
                    text: { body: "¿Tienen stock?" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

    expect(processed.processed).toBe(1);
    expect(prisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          direction: "inbound",
          body: "¿Tienen stock?",
        }),
      }),
    );
  });

  it("omite firma cuando WHATSAPP_SKIP_SIGNATURE=true fuera de production", () => {
    configValues.WHATSAPP_SKIP_SIGNATURE = true;
    configValues.NODE_ENV = "development";
    expect(() => service.assertSignature(undefined, undefined)).not.toThrow();
  });
});
