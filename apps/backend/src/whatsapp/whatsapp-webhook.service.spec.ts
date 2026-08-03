import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { AiReplyService } from "../ai/ai-reply.service";
import { PrismaService } from "../prisma/prisma.service";
import { WhatsAppCloudClient } from "./whatsapp-cloud.client";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

describe("WhatsAppWebhookService", () => {
  let service: WhatsAppWebhookService;
  let prisma: {
    whatsAppConnection: { findUnique: jest.Mock };
    conversation: { upsert: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    message: { create: jest.Mock; updateMany: jest.Mock };
  };
  let cloudClient: { sendText: jest.Mock };
  let aiReplyService: { generateReply: jest.Mock };
  let configValues: Record<string, unknown>;

  beforeEach(async () => {
    configValues = {
      WHATSAPP_VERIFY_TOKEN: "verify-me",
      WHATSAPP_APP_SECRET: "app-secret",
      WHATSAPP_SKIP_SIGNATURE: false,
      NODE_ENV: "test",
      WHATSAPP_AUTO_REPLY_ENABLED: true,
      WHATSAPP_AUTO_REPLY_TEXT: "Auto reply",
      AI_ENABLED: false,
      WHATSAPP_HANDLER_CHOICE_TEXT: "¿Bot o asesor?",
      WHATSAPP_HANDLER_BOT_CONFIRM_TEXT: "Ok bot",
      WHATSAPP_HANDLER_HUMAN_CONFIRM_TEXT: "Ok asesor",
    };

    prisma = {
      whatsAppConnection: { findUnique: jest.fn() },
      conversation: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      message: { create: jest.fn(), updateMany: jest.fn() },
    };
    cloudClient = {
      sendText: jest.fn().mockResolvedValue({ simulated: true, wamid: "wamid.out.1" }),
    };
    aiReplyService = {
      generateReply: jest.fn().mockResolvedValue({ text: "Respuesta IA", requestedHandoff: false }),
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
        { provide: AiReplyService, useValue: aiReplyService },
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

  it("en pending pregunta bot o asesor", async () => {
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
      handler: "pending",
    });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
    prisma.message.create
      .mockResolvedValueOnce({ id: "msg-in-1" })
      .mockResolvedValueOnce({ id: "msg-out-1" });
    prisma.conversation.update.mockResolvedValue({});

    await service.ingestInbound({
      phoneNumberId: "phone-a",
      from: "57300",
      text: "Hola",
    });

    expect(cloudClient.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "¿Bot o asesor?" }),
    );
    expect(aiReplyService.generateReply).not.toHaveBeenCalled();
  });

  it("al elegir bot confirma y no llama IA todavía", async () => {
    prisma.whatsAppConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      phoneNumberId: "phone-a",
      accessToken: "dummy-token",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "pending" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
    prisma.message.create
      .mockResolvedValueOnce({ id: "msg-in-1" })
      .mockResolvedValueOnce({ id: "msg-out-1" });
    prisma.conversation.update.mockResolvedValue({});

    await service.ingestInbound({
      phoneNumberId: "phone-a",
      from: "57300",
      text: "bot",
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ handler: "bot" }),
      }),
    );
    expect(cloudClient.sendText).toHaveBeenCalledWith(expect.objectContaining({ text: "Ok bot" }));
  });

  it("en modo bot con mención asesor pasa a human", async () => {
    configValues.AI_ENABLED = true;
    prisma.whatsAppConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      phoneNumberId: "phone-a",
      accessToken: "dummy-token",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "bot" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "bot" });
    prisma.message.create
      .mockResolvedValueOnce({ id: "msg-in-1" })
      .mockResolvedValueOnce({ id: "msg-out-1" });
    prisma.conversation.update.mockResolvedValue({});

    await service.ingestInbound({
      phoneNumberId: "phone-a",
      from: "57300",
      text: "quiero un asesor",
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ handler: "human" }),
      }),
    );
    expect(aiReplyService.generateReply).not.toHaveBeenCalled();
    expect(cloudClient.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Ok asesor" }),
    );
  });

  it("omite firma cuando WHATSAPP_SKIP_SIGNATURE=true fuera de production", () => {
    configValues.WHATSAPP_SKIP_SIGNATURE = true;
    configValues.NODE_ENV = "development";
    expect(() => service.assertSignature(undefined, undefined)).not.toThrow();
  });
});
