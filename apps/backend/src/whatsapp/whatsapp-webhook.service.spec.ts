import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { AiReplyService } from "../ai/ai-reply.service";
import { BillingService } from "../billing/billing.service";
import { OrdersService } from "../orders/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import { TwilioWhatsAppClient } from "./twilio-whatsapp.client";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import { WhatsAppWebhookService } from "./whatsapp-webhook.service";

describe("WhatsAppWebhookService", () => {
  let service: WhatsAppWebhookService;
  let prisma: {
    whatsAppConnection: { findUnique: jest.Mock };
    conversation: { upsert: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    message: { create: jest.Mock; updateMany: jest.Mock; findMany: jest.Mock };
  };
  let twilioClient: { sendText: jest.Mock; sendMedia: jest.Mock };
  let aiReplyService: { generateReply: jest.Mock };
  let ordersService: {
    getCartForConversation: jest.Mock;
    clearCart: jest.Mock;
    beginCheckout: jest.Mock;
    findVariantForAddIntent: jest.Mock;
    addCartItem: jest.Mock;
    formatCartMessage: jest.Mock;
  };
  let billing: { recordWaInbound: jest.Mock; recordAiReply: jest.Mock };
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
      message: { create: jest.fn(), updateMany: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    };
    twilioClient = {
      sendText: jest.fn().mockResolvedValue({ simulated: true, wamid: "SM_out_1" }),
      sendMedia: jest.fn().mockResolvedValue({ simulated: true, wamid: "SM_out_img" }),
    };
    aiReplyService = {
      generateReply: jest.fn().mockResolvedValue({
        text: "Respuesta IA",
        requestedHandoff: false,
        imageUrls: [],
      }),
    };
    ordersService = {
      getCartForConversation: jest.fn().mockResolvedValue({
        id: "cart-1",
        checkoutPending: false,
        items: [],
      }),
      clearCart: jest.fn(),
      beginCheckout: jest.fn(),
      findVariantForAddIntent: jest.fn(),
      addCartItem: jest.fn(),
      formatCartMessage: jest.fn().mockReturnValue("Carrito vacío"),
    };
    billing = {
      recordWaInbound: jest.fn().mockResolvedValue({ allowed: true }),
      recordAiReply: jest.fn().mockResolvedValue({ allowed: true }),
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
        { provide: OrdersService, useValue: ordersService },
        { provide: BillingService, useValue: billing },
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

  it("al elegir bot confirma y no llama IA si no había pregunta previa", async () => {
    prisma.whatsAppConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "pending" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
    prisma.message.findMany.mockResolvedValue([{ body: "bot" }]);
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
    expect(twilioClient.sendText).toHaveBeenCalledTimes(1);
    expect(twilioClient.sendText).toHaveBeenCalledWith(expect.objectContaining({ text: "Ok bot" }));
    expect(aiReplyService.generateReply).not.toHaveBeenCalled();
  });

  it("al elegir bot confirma y responde la pregunta previa pendiente", async () => {
    configValues.AI_ENABLED = true;
    prisma.whatsAppConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "pending" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
    prisma.message.findMany.mockResolvedValue([
      { body: "un bot por favor" },
      { body: "Hola, que productos tienen en stock?" },
    ]);
    prisma.message.create
      .mockResolvedValueOnce({ id: "msg-in-1" })
      .mockResolvedValueOnce({ id: "msg-out-1" })
      .mockResolvedValueOnce({ id: "msg-out-2" });
    prisma.conversation.update.mockResolvedValue({});
    aiReplyService.generateReply.mockResolvedValue({
      text: "Tenemos Camiseta Azul en stock.",
      requestedHandoff: false,
    });

    await service.ingestInbound({
      twilioWhatsAppNumber: "+14155238886",
      from: "+573001112233",
      text: "un bot por favor",
    });

    expect(aiReplyService.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        customerText: "Hola, que productos tienen en stock?",
      }),
    );
    expect(twilioClient.sendText).toHaveBeenCalledTimes(2);
    expect(twilioClient.sendText).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ text: "Ok bot" }),
    );
    expect(twilioClient.sendText).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ text: "Tenemos Camiseta Azul en stock." }),
    );
  });

  it("al elegir bot con pregunta en el mismo mensaje responde esa pregunta", async () => {
    configValues.AI_ENABLED = true;
    prisma.whatsAppConnection.findUnique.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "pending" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
    prisma.message.findMany.mockResolvedValue([
      { body: "bot, disculpa que productos tienen disponibles" },
      { body: "Hola" },
    ]);
    prisma.message.create
      .mockResolvedValueOnce({ id: "msg-in-1" })
      .mockResolvedValueOnce({ id: "msg-out-1" })
      .mockResolvedValueOnce({ id: "msg-out-2" });
    prisma.conversation.update.mockResolvedValue({});
    aiReplyService.generateReply.mockResolvedValue({
      text: "Tenemos Case blanco.",
      requestedHandoff: false,
    });

    await service.ingestInbound({
      twilioWhatsAppNumber: "+14155238886",
      from: "+573001112233",
      text: "bot, disculpa que productos tienen disponibles",
    });

    expect(aiReplyService.generateReply).toHaveBeenCalledWith(
      expect.objectContaining({
        customerText: "que productos tienen disponibles",
      }),
    );
    expect(twilioClient.sendText).toHaveBeenCalledTimes(2);
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

  describe("Prueba tu asistente", () => {
    it("responde sin enviar nada por Twilio", async () => {
      prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
      prisma.message.create.mockResolvedValue({ id: "msg-out-1" });
      prisma.conversation.update.mockResolvedValue({});

      await service.replyInPlayground("company-a", "conv-play", "Hola");

      expect(twilioClient.sendText).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: "conv-play",
          direction: "outbound",
          body: "¿Bot o asesor?",
          wamid: null,
          status: "sent",
        }),
      });
    });

    it("al confirmar pedido no crea la orden ni consume cupo de WhatsApp", async () => {
      prisma.conversation.findUnique.mockResolvedValue({ handler: "bot" });
      prisma.message.create.mockResolvedValue({ id: "msg-out-1" });
      prisma.conversation.update.mockResolvedValue({});

      await service.replyInPlayground("company-a", "conv-play", "confirmar pedido");

      expect(ordersService.beginCheckout).not.toHaveBeenCalled();
      expect(billing.recordWaInbound).not.toHaveBeenCalled();
      expect(twilioClient.sendText).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          body: expect.stringContaining("Modo prueba"),
        }),
      });
    });

    it("rechaza el simulador en producción", async () => {
      configValues.NODE_ENV = "production";

      await expect(
        service.simulateInbound("company-a", { from: "+573001112233", text: "Hola" }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
