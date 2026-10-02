import { BadRequestException, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { PrismaService } from "../prisma/prisma.service";
import { MercadoPagoConnectionService } from "./mercadopago-connection.service";

describe("MercadoPagoConnectionService", () => {
  let service: MercadoPagoConnectionService;
  let prisma: {
    mercadoPagoConnection: {
      findUnique: jest.Mock;
      upsert: jest.Mock;
      delete: jest.Mock;
      update: jest.Mock;
    };
    whatsAppConnection: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let configValues: Record<string, string | undefined>;

  beforeEach(async () => {
    configValues = {
      JWT_SECRET: "test-secret-at-least-32-characters-long",
      FRONTEND_URL: "http://localhost:3000",
      MP_CLIENT_ID: "app-123",
      MP_CLIENT_SECRET: "secret-456",
      MP_REDIRECT_URI: "https://example.ngrok-free.app/api/v1/payments/mercadopago/oauth/callback",
    };
    prisma = {
      mercadoPagoConnection: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
      whatsAppConnection: { updateMany: jest.fn() },
      $transaction: jest.fn((ops: unknown) => Promise.all(ops as Promise<unknown>[])),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MercadoPagoConnectionService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => configValues[key],
            getOrThrow: (key: string) => {
              const value = configValues[key];
              if (!value) {
                throw new Error(`Missing ${key}`);
              }
              return value;
            },
          },
        },
      ],
    }).compile();

    service = module.get(MercadoPagoConnectionService);
  });

  it("upsertManual guarda access token", async () => {
    prisma.mercadoPagoConnection.findUnique.mockResolvedValue({
      accessToken: "TEST-abc",
      publicKey: null,
      mpUserId: null,
      source: "manual",
      liveMode: false,
      connectedAt: new Date("2026-08-08T00:00:00.000Z"),
      tokenExpiresAt: null,
    });
    prisma.mercadoPagoConnection.upsert.mockResolvedValue({});

    const result = await service.upsertManual("co-1", { accessToken: "TEST-abc" });
    expect(prisma.mercadoPagoConnection.upsert).toHaveBeenCalled();
    expect(result.isConfigured).toBe(true);
  });

  it("getValidAccessToken falla sin conexión", async () => {
    prisma.mercadoPagoConnection.findUnique.mockResolvedValue(null);
    await expect(service.getValidAccessToken("co-1")).rejects.toThrow(BadRequestException);
  });

  it("buildOAuthStartUrl requiere OAuth configurado", async () => {
    delete configValues.MP_CLIENT_ID;
    expect(() => service.buildOAuthStartUrl("co-1", "user-1")).toThrow(ServiceUnavailableException);
  });

  it("buildOAuthStartUrl genera URL de autorización", () => {
    const { authorizationUrl } = service.buildOAuthStartUrl("co-1", "user-1");
    expect(authorizationUrl).toContain("https://auth.mercadopago.com/authorization");
    expect(authorizationUrl).toContain("client_id=app-123");
    expect(authorizationUrl).toContain("state=");
  });
});
