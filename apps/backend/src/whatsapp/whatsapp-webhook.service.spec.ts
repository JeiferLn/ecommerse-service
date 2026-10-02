import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { AiReplyService } from "../ai/ai-reply.service";
import { BillingService } from "../billing/billing.service";
import { OrdersService } from "../orders/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import { StorageService } from "../storage/storage.service";
import { cartActionButtons, handlerChoiceButtons } from "./interactive-message.util";
import { TwilioContentService } from "./twilio-content.service";
import { TwilioWhatsAppClient } from "./twilio-whatsapp.client";
import { WhatsAppConnectionService } from "./whatsapp-connection.service";
import {
  HANDLER_CHOICE_BUTTONS_TEXT,
  SHARED_NUMBER_UNROUTED_TEXT,
  WhatsAppWebhookService,
} from "./whatsapp-webhook.service";

describe("WhatsAppWebhookService", () => {
  let service: WhatsAppWebhookService;
  let sharedNumber: string | null;
  let prisma: {
    whatsAppConnection: { findUnique: jest.Mock; findFirst: jest.Mock };
    sharedNumberSession: { findUnique: jest.Mock; upsert: jest.Mock };
    conversation: { upsert: jest.Mock; update: jest.Mock; findUnique: jest.Mock };
    message: {
      create: jest.Mock;
      updateMany: jest.Mock;
      findMany: jest.Mock;
      findFirst: jest.Mock;
    };
  };
  let twilioClient: { sendText: jest.Mock; sendMedia: jest.Mock; sendContent: jest.Mock };
  let contentService: { resolve: jest.Mock };
  let aiReplyService: { generateReply: jest.Mock };
  let ordersService: {
    getCartForConversation: jest.Mock;
    clearCart: jest.Mock;
    beginCheckout: jest.Mock;
    findVariantForAddIntent: jest.Mock;
    addCartItem: jest.Mock;
    formatCartMessage: jest.Mock;
    getSuggestedProducts: jest.Mock;
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
      WHATSAPP_INTERACTIVE_ENABLED: true,
    };

    sharedNumber = null;
    prisma = {
      whatsAppConnection: { findUnique: jest.fn(), findFirst: jest.fn() },
      sharedNumberSession: { findUnique: jest.fn(), upsert: jest.fn().mockResolvedValue({}) },
      conversation: { upsert: jest.fn(), update: jest.fn(), findUnique: jest.fn() },
      message: {
        create: jest.fn(),
        updateMany: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue(null),
      },
    };
    twilioClient = {
      sendText: jest.fn().mockResolvedValue({ simulated: true, wamid: "SM_out_1" }),
      sendMedia: jest.fn().mockResolvedValue({ simulated: true, wamid: "SM_out_img" }),
      sendContent: jest.fn().mockResolvedValue({ simulated: true, wamid: "SM_out_content" }),
    };
    contentService = {
      resolve: jest.fn().mockResolvedValue({ contentSid: "HX_test", variables: { "1": "x" } }),
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
      getSuggestedProducts: jest.fn().mockResolvedValue([]),
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
        { provide: TwilioContentService, useValue: contentService },
        { provide: StorageService, useValue: { externalUrl: (url: string) => url } },
        { provide: AiReplyService, useValue: aiReplyService },
        {
          provide: WhatsAppConnectionService,
          useValue: {
            assertCommerceConfigured: jest.fn().mockResolvedValue(undefined),
            getSharedNumber: () => sharedNumber,
          },
        },
        { provide: OrdersService, useValue: ordersService },
        { provide: BillingService, useValue: billing },
      ],
    }).compile();

    service = module.get(WhatsAppWebhookService);
  });

  it("en pending pregunta bot o asesor", async () => {
    prisma.whatsAppConnection.findFirst.mockResolvedValue({
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

    expect(contentService.resolve).toHaveBeenCalledWith(
      handlerChoiceButtons(),
      HANDLER_CHOICE_BUTTONS_TEXT,
    );
    expect(twilioClient.sendContent).toHaveBeenCalledWith({
      from: "+14155238886",
      to: "+573001112233",
      contentSid: "HX_test",
      variables: { "1": "x" },
    });
    expect(twilioClient.sendText).not.toHaveBeenCalled();
    expect(prisma.message.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        type: "interactive",
        body: HANDLER_CHOICE_BUTTONS_TEXT,
        interactive: handlerChoiceButtons(),
      }),
    });
    expect(aiReplyService.generateReply).not.toHaveBeenCalled();
  });

  it("con interactivos desactivados pregunta con el texto de respaldo", async () => {
    configValues.WHATSAPP_INTERACTIVE_ENABLED = false;
    prisma.whatsAppConnection.findFirst.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "pending" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
    prisma.message.create.mockResolvedValue({ id: "msg-1" });
    prisma.conversation.update.mockResolvedValue({});

    await service.ingestInbound({
      twilioWhatsAppNumber: "+14155238886",
      from: "+573001112233",
      text: "Hola",
    });

    expect(twilioClient.sendContent).not.toHaveBeenCalled();
    expect(twilioClient.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "¿Bot o asesor?" }),
    );
  });

  it("si Twilio rechaza el interactivo envía las opciones como texto", async () => {
    prisma.whatsAppConnection.findFirst.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "pending" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
    prisma.message.create.mockResolvedValue({ id: "msg-1" });
    prisma.conversation.update.mockResolvedValue({});
    contentService.resolve.mockRejectedValue(new Error("Twilio Content API 400"));

    await service.ingestInbound({
      twilioWhatsAppNumber: "+14155238886",
      from: "+573001112233",
      text: "Hola",
    });

    expect(twilioClient.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "¿Bot o asesor?" }),
    );
    expect(prisma.message.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ status: "sent", type: "interactive" }),
    });
  });

  it("el botón handler:bot del webhook elige el bot y guarda el toque", async () => {
    prisma.whatsAppConnection.findFirst.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "pending" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
    prisma.message.create.mockResolvedValue({ id: "msg-1" });
    prisma.conversation.update.mockResolvedValue({});

    await service.handleTwilioWebhook({
      MessageSid: "SM124",
      From: "whatsapp:+573001112233",
      To: "whatsapp:+14155238886",
      Body: "Asistente virtual",
      ButtonText: "Asistente virtual",
      ButtonPayload: "handler:bot",
    });

    expect(prisma.message.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        direction: "inbound",
        body: "Asistente virtual",
        interactive: { kind: "reply", actionId: "handler:bot" },
      }),
    });
    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ handler: "bot" }) }),
    );
    expect(twilioClient.sendText).toHaveBeenCalledWith(expect.objectContaining({ text: "Ok bot" }));
  });

  it("escribir el número de una opción equivale a tocarla", async () => {
    prisma.whatsAppConnection.findFirst.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "pending" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
    prisma.message.findFirst.mockResolvedValue({ interactive: handlerChoiceButtons() });
    prisma.message.create.mockResolvedValue({ id: "msg-1" });
    prisma.conversation.update.mockResolvedValue({});

    await service.ingestInbound({
      twilioWhatsAppNumber: "+14155238886",
      from: "+573001112233",
      text: "2",
    });

    expect(prisma.conversation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ handler: "human" }) }),
    );
    expect(twilioClient.sendText).toHaveBeenCalledWith(
      expect.objectContaining({ text: "Ok asesor" }),
    );
  });

  it("elegir una variante de la lista la agrega y responde con botones del carrito", async () => {
    prisma.whatsAppConnection.findFirst.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "bot" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "bot" });
    prisma.message.create.mockResolvedValue({ id: "msg-1" });
    prisma.conversation.update.mockResolvedValue({});
    ordersService.addCartItem.mockResolvedValue({
      id: "cart-1",
      checkoutPending: false,
      items: [{ variantId: "var-1", productName: "Camiseta", variantName: "M", quantity: 1 }],
    });
    ordersService.formatCartMessage.mockReturnValue("Tu carrito: Camiseta (M) x1");

    await service.handleTwilioWebhook({
      MessageSid: "SM125",
      From: "whatsapp:+573001112233",
      To: "whatsapp:+14155238886",
      Body: "Camiseta · M",
      ListId: "variant:var-1",
      ListTitle: "Camiseta · M",
    });

    expect(ordersService.addCartItem).toHaveBeenCalledWith("company-a", "conv-1", "var-1", 1);
    expect(ordersService.formatCartMessage).toHaveBeenCalledWith(expect.anything(), {
      withInstructions: false,
    });
    expect(contentService.resolve).toHaveBeenCalledWith(
      cartActionButtons(),
      "Agregué Camiseta (M) x1.\n\nTu carrito: Camiseta (M) x1",
    );
    expect(twilioClient.sendContent).toHaveBeenCalled();
    expect(aiReplyService.generateReply).not.toHaveBeenCalled();
  });

  describe("botón Pagar pedido", () => {
    beforeEach(() => {
      prisma.whatsAppConnection.findFirst.mockResolvedValue({
        id: "conn-1",
        companyId: "company-a",
        twilioWhatsAppNumber: "+14155238886",
        isActive: true,
      });
      prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "bot" });
      prisma.conversation.findUnique.mockResolvedValue({ handler: "bot" });
      prisma.message.create.mockResolvedValue({ id: "msg-1" });
      prisma.conversation.update.mockResolvedValue({});
      ordersService.beginCheckout.mockResolvedValue({
        cart: { id: "cart-1", checkoutPending: true, items: [] },
        summary: "Pedido #12 · $50.000",
        message: "Pedido #12 · $50.000\n\nPaga aquí: https://shop.co/checkout/tok_1",
        checkoutUrl: "https://shop.co/checkout/tok_1",
      });
    });

    const tapCheckout = () =>
      service.handleTwilioWebhook({
        MessageSid: "SM126",
        From: "whatsapp:+573001112233",
        To: "whatsapp:+14155238886",
        Body: "Confirmar pedido",
        ButtonPayload: "cart:checkout",
      });

    it("con plantilla envía el resumen y después el botón", async () => {
      await tapCheckout();

      expect(contentService.resolve).toHaveBeenCalledWith(
        { kind: "link_button", title: "Pagar pedido", url: "https://shop.co/checkout/tok_1" },
        "Elige una opción:",
      );
      expect(twilioClient.sendText).toHaveBeenCalledTimes(1);
      expect(twilioClient.sendText).toHaveBeenCalledWith(
        expect.objectContaining({ text: "Pedido #12 · $50.000" }),
      );
      expect(twilioClient.sendContent).toHaveBeenCalledTimes(1);
      expect(twilioClient.sendText.mock.invocationCallOrder[0]).toBeLessThan(
        twilioClient.sendContent.mock.invocationCallOrder[0]!,
      );
    });

    it("sin plantilla envía una sola vez el mensaje con el enlace", async () => {
      contentService.resolve.mockResolvedValue(null);

      await tapCheckout();

      expect(twilioClient.sendContent).not.toHaveBeenCalled();
      expect(twilioClient.sendText).toHaveBeenCalledTimes(1);
      expect(twilioClient.sendText).toHaveBeenCalledWith(
        expect.objectContaining({
          text: "Pedido #12 · $50.000\n\nPaga aquí: https://shop.co/checkout/tok_1",
        }),
      );
    });
  });

  it("si la IA sugiere varios productos responde con una lista", async () => {
    configValues.AI_ENABLED = true;
    prisma.whatsAppConnection.findFirst.mockResolvedValue({
      id: "conn-1",
      companyId: "company-a",
      twilioWhatsAppNumber: "+14155238886",
      isActive: true,
    });
    prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "bot" });
    prisma.conversation.findUnique.mockResolvedValue({ handler: "bot" });
    prisma.message.create.mockResolvedValue({ id: "msg-1" });
    prisma.conversation.update.mockResolvedValue({});
    aiReplyService.generateReply.mockResolvedValue({
      text: "Tenemos estas opciones:",
      requestedHandoff: false,
      imageUrls: [],
      suggestedProductIds: ["p1", "p2"],
    });
    ordersService.getSuggestedProducts.mockResolvedValue([
      {
        id: "p1",
        name: "Camiseta",
        imageUrl: null,
        currency: "COP",
        variants: [{ id: "v1", name: "M", price: 50000, stock: 3 }],
      },
      {
        id: "p2",
        name: "Gorra",
        imageUrl: null,
        currency: "COP",
        variants: [{ id: "v2", name: "Única", price: 30000, stock: 1 }],
      },
    ]);

    await service.ingestInbound({
      twilioWhatsAppNumber: "+14155238886",
      from: "+573001112233",
      text: "¿Qué productos tienen?",
    });

    expect(ordersService.getSuggestedProducts).toHaveBeenCalledWith("company-a", {
      productIds: ["p1", "p2"],
    });
    expect(prisma.message.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({
        body: "Tenemos estas opciones:",
        interactive: expect.objectContaining({
          kind: "list",
          items: [
            expect.objectContaining({ id: "variant:v1" }),
            expect.objectContaining({ id: "variant:v2" }),
          ],
        }),
      }),
    });
  });

  it("al elegir bot confirma y no llama IA si no había pregunta previa", async () => {
    prisma.whatsAppConnection.findFirst.mockResolvedValue({
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
    prisma.whatsAppConnection.findFirst.mockResolvedValue({
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
    prisma.whatsAppConnection.findFirst.mockResolvedValue({
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
    prisma.whatsAppConnection.findFirst.mockResolvedValue({
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
    prisma.whatsAppConnection.findFirst.mockResolvedValue({
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
    expect(prisma.whatsAppConnection.findFirst).toHaveBeenCalledWith({
      where: { twilioWhatsAppNumber: "+14155238886", mode: "dedicated" },
    });
  });

  describe("Número compartido", () => {
    const SHARED = "+15554447456";
    const sharedConnection = {
      id: "conn-shared-a",
      companyId: "company-a",
      twilioWhatsAppNumber: SHARED,
      mode: "shared",
      storeCode: "tienda-a",
      isActive: true,
    };

    beforeEach(() => {
      sharedNumber = SHARED;
      configValues.WHATSAPP_INTERACTIVE_ENABLED = false;
      prisma.conversation.upsert.mockResolvedValue({ id: "conv-1", handler: "pending" });
      prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
      prisma.message.create.mockResolvedValue({ id: "msg-1" });
      prisma.conversation.update.mockResolvedValue({});
    });

    it("con #codigo enruta a la tienda, guarda la sesión y saluda con el nombre", async () => {
      prisma.whatsAppConnection.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ ...sharedConnection, company: { name: "Tienda A" } });
      prisma.sharedNumberSession.findUnique.mockResolvedValue(null);

      await service.ingestInbound({
        twilioWhatsAppNumber: SHARED,
        from: "+573001112233",
        text: "Hola Tienda A #Tienda-A",
      });

      expect(prisma.whatsAppConnection.findFirst).toHaveBeenNthCalledWith(2, {
        where: { storeCode: "tienda-a", mode: "shared" },
        include: { company: { select: { name: true } } },
      });
      expect(prisma.sharedNumberSession.upsert).toHaveBeenCalledWith({
        where: { customerWaId: "+573001112233" },
        create: { customerWaId: "+573001112233", connectionId: "conn-shared-a" },
        update: { connectionId: "conn-shared-a" },
      });
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ direction: "inbound", body: "Hola Tienda A" }),
      });
      expect(twilioClient.sendText).toHaveBeenCalledWith({
        from: SHARED,
        to: "+573001112233",
        text: "Estás hablando con *Tienda A*.\n\n¿Bot o asesor?",
      });
    });

    it("sin código usa la tienda de la sesión y no repite el saludo", async () => {
      prisma.whatsAppConnection.findFirst.mockResolvedValue(null);
      prisma.sharedNumberSession.findUnique.mockResolvedValue({
        connectionId: "conn-shared-a",
        connection: sharedConnection,
      });

      await service.ingestInbound({
        twilioWhatsAppNumber: SHARED,
        from: "+573001112233",
        text: "Hola",
      });

      expect(prisma.conversation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            waConnectionId_customerWaId: {
              waConnectionId: "conn-shared-a",
              customerWaId: "+573001112233",
            },
          },
        }),
      );
      expect(twilioClient.sendText).toHaveBeenCalledWith(
        expect.objectContaining({ text: "¿Bot o asesor?" }),
      );
    });

    it("sin código ni sesión responde cómo llegar a una tienda y no crea conversación", async () => {
      prisma.whatsAppConnection.findFirst.mockResolvedValue(null);
      prisma.sharedNumberSession.findUnique.mockResolvedValue(null);

      const result = await service.ingestInbound({
        twilioWhatsAppNumber: SHARED,
        from: "+573001112233",
        text: "Hola",
      });

      expect(result).toBeNull();
      expect(prisma.conversation.upsert).not.toHaveBeenCalled();
      expect(twilioClient.sendText).toHaveBeenCalledWith({
        from: SHARED,
        to: "+573001112233",
        text: SHARED_NUMBER_UNROUTED_TEXT,
      });
    });

    it("un número propio tiene prioridad aunque coincida con el compartido", async () => {
      prisma.whatsAppConnection.findFirst.mockResolvedValueOnce({
        id: "conn-dedicated",
        companyId: "company-b",
        twilioWhatsAppNumber: SHARED,
        mode: "dedicated",
        isActive: true,
      });

      await service.ingestInbound({
        twilioWhatsAppNumber: SHARED,
        from: "+573001112233",
        text: "Hola #tienda-a",
      });

      expect(prisma.sharedNumberSession.upsert).not.toHaveBeenCalled();
      expect(prisma.conversation.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ companyId: "company-b" }),
        }),
      );
    });
  });

  describe("Prueba tu asistente", () => {
    it("responde sin enviar nada por Twilio", async () => {
      prisma.conversation.findUnique.mockResolvedValue({ handler: "pending" });
      prisma.message.create.mockResolvedValue({ id: "msg-out-1" });
      prisma.conversation.update.mockResolvedValue({});

      await service.replyInPlayground("company-a", "conv-play", "Hola");

      expect(twilioClient.sendText).not.toHaveBeenCalled();
      expect(twilioClient.sendContent).not.toHaveBeenCalled();
      expect(contentService.resolve).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          conversationId: "conv-play",
          direction: "outbound",
          type: "interactive",
          body: HANDLER_CHOICE_BUTTONS_TEXT,
          interactive: handlerChoiceButtons(),
          wamid: null,
          status: "sent",
        }),
      });
    });

    it("un actionId del simulador se resuelve igual que un botón de WhatsApp", async () => {
      prisma.conversation.findUnique.mockResolvedValue({ handler: "bot" });
      prisma.message.create.mockResolvedValue({ id: "msg-out-1" });
      prisma.conversation.update.mockResolvedValue({});
      ordersService.clearCart.mockResolvedValue({
        id: "cart-1",
        checkoutPending: false,
        items: [],
      });

      await service.replyInPlayground("company-a", "conv-play", "Vaciar carrito", "cart:clear");

      expect(ordersService.clearCart).toHaveBeenCalledWith("company-a", "conv-play");
      expect(twilioClient.sendText).not.toHaveBeenCalled();
      expect(prisma.message.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ body: "Carrito vacío", type: "text" }),
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
