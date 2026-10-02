import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";

import { PrismaService } from "../prisma/prisma.service";
import { cartActionButtons } from "./interactive-message.util";
import { TwilioContentService } from "./twilio-content.service";
import { TwilioWhatsAppClient } from "./twilio-whatsapp.client";

describe("TwilioContentService", () => {
  let service: TwilioContentService;
  let prisma: { whatsAppContentTemplate: { findUnique: jest.Mock; create: jest.Mock } };
  let credentials: jest.Mock;
  let configValues: Record<string, unknown>;
  const fetchMock = jest.fn();
  const realFetch = global.fetch;

  beforeEach(async () => {
    configValues = {};
    prisma = {
      whatsAppContentTemplate: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({}) },
    };
    credentials = jest.fn().mockReturnValue({ accountSid: "AC1", authToken: "tok" });
    fetchMock.mockReset();
    global.fetch = fetchMock;

    const module = await Test.createTestingModule({
      providers: [
        TwilioContentService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: (key: string) => configValues[key] } },
        { provide: TwilioWhatsAppClient, useValue: { credentials } },
      ],
    }).compile();
    service = module.get(TwilioContentService);
  });

  afterAll(() => {
    global.fetch = realFetch;
  });

  it("crea el quick-reply una vez y lo guarda con el cuerpo como variable", async () => {
    prisma.whatsAppContentTemplate.findUnique.mockResolvedValue(null);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ sid: "HX123" }) });

    const result = await service.resolve(cartActionButtons(), "Tu carrito: 1 producto");

    expect(result).toEqual({ contentSid: "HX123", variables: { "1": "Tu carrito: 1 producto" } });
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(sent.types["twilio/quick-reply"]).toEqual({
      body: "{{1}}",
      actions: [
        { title: "Confirmar pedido", id: "cart:checkout" },
        { title: "Seguir comprando", id: "cart:continue" },
        { title: "Vaciar carrito", id: "cart:clear" },
      ],
    });
    expect(prisma.whatsAppContentTemplate.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ contentSid: "HX123", kind: "buttons" }),
    });
  });

  it("reutiliza el contenido cacheado sin llamar a Twilio", async () => {
    prisma.whatsAppContentTemplate.findUnique.mockResolvedValue({ contentSid: "HXcached" });

    const result = await service.resolve(cartActionButtons(), "Otro cuerpo");

    expect(result?.contentSid).toBe("HXcached");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("en modo simulado no crea nada en Twilio", async () => {
    credentials.mockReturnValue(null);

    const result = await service.resolve(cartActionButtons(), "Hola");

    expect(result?.contentSid).toMatch(/^HX_sim_/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.whatsAppContentTemplate.findUnique).not.toHaveBeenCalled();
  });

  it("el botón de pago usa la plantilla configurada con el token del checkout", async () => {
    configValues.TWILIO_CHECKOUT_CONTENT_SID = "HXpay";

    await expect(
      service.resolve(
        { kind: "link_button", title: "Pagar pedido", url: "https://shop.co/checkout/tok_9?x=1" },
        "Pedido registrado",
      ),
    ).resolves.toEqual({ contentSid: "HXpay", variables: { "1": "tok_9" } });
  });

  it("sin plantilla de pago el botón no se envía como contenido", async () => {
    await expect(
      service.resolve(
        { kind: "link_button", title: "Pagar pedido", url: "https://shop.co/checkout/tok_9" },
        "Pedido registrado",
      ),
    ).resolves.toBeNull();
  });
});
