import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { MercadoPagoService } from "../payments/mercadopago.service";
import { PrismaService } from "../prisma/prisma.service";
import { BillingService } from "./billing.service";

describe("BillingService", () => {
  let service: BillingService;
  let prisma: {
    plan: { count: jest.Mock; findUnique: jest.Mock; findMany: jest.Mock; upsert: jest.Mock; findUniqueOrThrow: jest.Mock };
    subscription: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    companyMembership: { count: jest.Mock };
    product: { count: jest.Mock };
    productVariant: { count: jest.Mock };
    knowledgeDocument: { count: jest.Mock };
    usageCounter: { findUnique: jest.Mock; upsert: jest.Mock };
  };

  const freePlan = {
    id: "plan-free",
    code: "free",
    name: "Free",
    priceUsdCents: 0,
    maxMembers: 2,
    maxProducts: 30,
    maxVariants: 80,
    maxWaMessagesMonth: 100,
    maxAiRepliesMonth: 50,
    maxKnowledgeDocs: 1,
    isPublic: true,
    sortOrder: 0,
  };

  beforeEach(async () => {
    prisma = {
      plan: {
        count: jest.fn().mockResolvedValue(3),
        findUnique: jest.fn().mockResolvedValue(freePlan),
        findMany: jest.fn().mockResolvedValue([freePlan]),
        upsert: jest.fn(),
        findUniqueOrThrow: jest.fn().mockResolvedValue(freePlan),
      },
      subscription: {
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      companyMembership: { count: jest.fn().mockResolvedValue(1) },
      product: { count: jest.fn().mockResolvedValue(0) },
      productVariant: { count: jest.fn().mockResolvedValue(0) },
      knowledgeDocument: { count: jest.fn().mockResolvedValue(0) },
      usageCounter: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => {
              if (key === "NODE_ENV") return "development";
              if (key === "BILLING_ALLOW_DEV_UPGRADE") return true;
              if (key === "MP_ACCESS_TOKEN") return undefined;
              return undefined;
            },
            getOrThrow: (key: string) => {
              if (key === "FRONTEND_URL") return "http://localhost:3000";
              throw new Error(key);
            },
          },
        },
        {
          provide: MercadoPagoService,
          useValue: {
            getWebhookNotificationUrl: () => null,
            preferenceApi: () => ({ create: jest.fn() }),
          },
        },
      ],
    }).compile();

    service = module.get(BillingService);
  });

  it("bloquea altas cuando el trial expiró", async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      id: "sub-1",
      companyId: "co-1",
      status: "trial_expired",
      trialEndsAt: new Date(0),
      desiredPlan: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      plan: freePlan,
    });

    await expect(service.assertCan("co-1", "create_product")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("activa plan de pago en modo desarrollo sin MP", async () => {
    const proPlan = { ...freePlan, id: "plan-pro", code: "pro", name: "Pro", priceUsdCents: 3900 };
    prisma.plan.findUnique.mockResolvedValue(proPlan);
    prisma.subscription.update.mockResolvedValue({});

    const result = await service.checkout("co-1", "pro");
    expect(result.activatedWithoutPayment).toBe(true);
    expect(result.planCode).toBe("pro");
    expect(prisma.subscription.update).toHaveBeenCalled();
  });

  it("lista planes públicos", async () => {
    const plans = await service.listPublicPlans();
    expect(plans[0]?.code).toBe("free");
  });
});
