import { UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { AiReplyService } from "../ai/ai-reply.service";
import { PrismaService } from "../prisma/prisma.service";
import { TwilioWhatsAppClient } from "./twilio-whatsapp.client";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

describe("WhatsAppWebhookService", () => {
  let service: WhatsAppWebhookService;
  let prisma: {
    whatsAppConnection: { findUnique: jest.Mock };
    conversation: { upsert: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    message: { create: jest.Mock; updateMany: jest.Mock };
  };
  let twilioClient: { sendText: jest.Mock };
  let aiReplyService: { generateReply: jest.Mock };
  let configValues: Record<string, unknown>;

  beforeEach(async () => {
    configValues = {
      TWILIO_AUTH_TOKEN: "auth-token",
      TWILIO_SKIP_SIGNATURE: false,
      TWILIO_WEBHOOK_URL: "https://example.com/api/v1/whatsapp/webhook",
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
    twilioClient = {
      sendText: jest.fn().mockResolvedValue({ simulated: true, wamid: "SM_out_1" }),
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
        { provide: TwilioWhatsAppClient, useValue: twilioClient },
        { provide: AiReplyService, useValue: aiReplyService },
        {
          provide: WhatsAppConnectionService,
          useValue: { assertCommerceConfigured: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    service = module.get(WhatsAppWebhookService);
  });

  it("en pending pregunta bot o asesor", async () => {
    prisma.whatsAppConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
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
      twilioWhatsAppNumber: "+14155238886",
      from: "+573001112233",
      text: "Hola",
    });

    expect(twilioClient.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "¿Bot o asesor?" }),
    );
    expect(aiReplyService.generateReply).not.toHaveBeenCalled();
  });

  it("al elegir bot confirma y no llama IA todavía", async () => {
    prisma.whatsAppConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "pending" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
    prisma.message.create
      .mockResolvedValueOnce({ id: "msg-in-1" })
      .mockResolvedValueOnce({ id: "msg-out-1" });
    prisma.conversation.update.mockResolvedValue({});

    await service.ingestInbound({
      twilioWhatsAppNumber: "+14155238886",
      from: "+573001112233",
      text: "bot",
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ handler: "bot" }),
      }),
    );
    expect(twilioClient.sendText).toHaveBeenCalledWith(expect.objectContaining({ text: "Ok bot" }));
  });

  it("en modo bot con mención asesor pasa a human", async () => {
    configValues.AI_ENABLED = true;
    prisma.whatsAppConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "bot" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "bot" });
    prisma.message.create
      .mockResolvedValueOnce({ id: "msg-in-1" })
      .mockResolvedValueOnce({ id: "msg-out-1" });
    prisma.conversation.update.mockResolvedValue({});

    await service.ingestInbound({
      twilioWhatsAppNumber: "+14155238886",
      from: "+573001112233",
      text: "quiero un asesor",
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ handler: "human" }),
      }),
    );
    expect(aiReplyService.generateReply).not.toHaveBeenCalled();
    expect(twilioClient.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Ok asesor" }),
    );
  });

  it("omite firma cuando TWILIO_SKIP_SIGNATURE=true fuera de production", () => {
    configValues.TWILIO_SKIP_SIGNATURE = true;
    configValues.NODE_ENV = "development";
    expect(() => service.assertTwilioSignature(undefined, {})).not.toThrow();
  });

  it("rechaza firma ausente cuando skip=false", () => {
    expect(() => service.assertTwilioSignature(undefined, { Body: "hola" })).toThrow(
      UnauthorizedException,
    );
  });

  it("procesa webhook Twilio inbound por To", async () => {
    prisma.whatsAppConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "pending" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
    prisma.message.create
      .mockResolvedValueOnce({ id: "msg-in-1" })
      .mockResolvedValueOnce({ id: "msg-out-1" });
    prisma.conversation.update.mockResolvedValue({});

    const result = await service.handleTwilioWebhook({
      MessageSid: "SM123",
      From: "whatsapp:+573001112233",
      To: "whatsapp:+14155238886",
      Body: "Hola",
      ProfileName: "Ana",
    });

    expect(result.processed).toBe(1);
    expect(prisma.whatsAppConnection.findUnique).toHaveBeenCalledWith({
      where: { twilioWhatsAppNumber: "+14155238886" },
    });
  });
});
