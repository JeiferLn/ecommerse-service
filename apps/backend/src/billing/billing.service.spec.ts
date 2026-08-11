import { ForbiddenException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test, TestingModule } from "@nestjs/testing";

import { MercadoPagoService } from "../payments/mercadopago.service";
import { PrismaService } from "../prisma/prisma.service";
import { BillingService } from "./billing.service";

describe("BillingService", () => {
  let service: BillingService;
  let prisma: {
    plan: {
      count: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      upsert: jest.Mock;
      findUniqueOrThrow: jest.Mock;
    };
    subscription: {
      findUnique: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    companyMembership: { count: jest.Mock };
    product: { count: jest.Mock };
    productVariant: { count: jest.Mock };
    knowledgeDocument: { count: jest.Mock };
    usageCounter: { findUnique: jest.Mock; upsert: jest.Mock };
  };
  let mercadoPago: {
    getWebhookNotificationUrl: jest.Mock;
    createPreapproval: jest.Mock;
    cancelPreapproval: jest.Mock;
    getPreapproval: jest.Mock;
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

  const proPlan = {
    ...freePlan,
    id: "plan-pro",
    code: "pro",
    name: "Pro",
    priceUsdCents: 3900,
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
      user: {
        findUnique: jest.fn().mockResolvedValue({ email: "owner@test.com" }),
      },
      companyMembership: { count: jest.fn().mockResolvedValue(1) },
      product: { count: jest.fn().mockResolvedValue(0) },
      productVariant: { count: jest.fn().mockResolvedValue(0) },
      knowledgeDocument: { count: jest.fn().mockResolvedValue(0) },
      usageCounter: { findUnique: jest.fn().mockResolvedValue(null), upsert: jest.fn() },
    };

    mercadoPago = {
      getWebhookNotificationUrl: jest.fn().mockReturnValue(null),
      createPreapproval: jest.fn(),
      cancelPreapproval: jest.fn(),
      getPreapproval: jest.fn(),
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
        { provide: MercadoPagoService, useValue: mercadoPago },
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
      billingInterval: null,
      cancelAtPeriodEnd: false,
      desiredBillingInterval: null,
      currentPeriodStart: null,
      currentPeriodEnd: null,
      plan: freePlan,
    });

    await expect(service.assertCan("co-1", "create_product")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it("pasa active a past_due cuando el periodo venció y bloquea", async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      id: "sub-2",
      companyId: "co-1",
      status: "active",
      trialEndsAt: null,
      desiredPlan: null,
      billingInterval: "month",
      cancelAtPeriodEnd: false,
      desiredBillingInterval: null,
      currentPeriodStart: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
      plan: proPlan,
    });
    prisma.subscription.update.mockResolvedValue({
      id: "sub-2",
      companyId: "co-1",
      status: "past_due",
      trialEndsAt: null,
      desiredPlan: null,
      billingInterval: "month",
      cancelAtPeriodEnd: false,
      desiredBillingInterval: null,
      currentPeriodStart: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
      plan: proPlan,
    });

    await expect(service.assertCan("co-1", "create_product")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "sub-2" },
        data: { status: "past_due" },
      }),
    );
  });

  it("cancelAtPeriodEnd no bloquea hasta que vence el periodo", async () => {
    const periodEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    prisma.subscription.findUnique.mockResolvedValue({
      id: "sub-3",
      companyId: "co-1",
      status: "active",
      trialEndsAt: null,
      desiredPlan: null,
      billingInterval: "month",
      cancelAtPeriodEnd: true,
      desiredBillingInterval: null,
      currentPeriodStart: new Date(),
      currentPeriodEnd: periodEnd,
      plan: proPlan,
    });

    await expect(service.assertCan("co-1", "create_product")).resolves.toBeUndefined();
  });

  it("pasa a canceled cuando cancelAtPeriodEnd y el periodo venció", async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      id: "sub-4",
      companyId: "co-1",
      status: "active",
      trialEndsAt: null,
      desiredPlan: null,
      billingInterval: "year",
      cancelAtPeriodEnd: true,
      desiredBillingInterval: null,
      currentPeriodStart: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
      plan: proPlan,
    });
    prisma.subscription.update.mockResolvedValue({
      id: "sub-4",
      companyId: "co-1",
      status: "canceled",
      trialEndsAt: null,
      desiredPlan: null,
      billingInterval: "year",
      cancelAtPeriodEnd: true,
      desiredBillingInterval: null,
      currentPeriodStart: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: new Date(Date.now() - 24 * 60 * 60 * 1000),
      plan: proPlan,
    });

    await expect(service.assertCan("co-1", "create_product")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: "canceled" },
      }),
    );
  });

  it("activa plan de pago en modo desarrollo sin MP con intervalo", async () => {
    prisma.plan.findUnique.mockResolvedValue(proPlan);
    prisma.subscription.update.mockResolvedValue({});

    const result = await service.checkout("co-1", "pro", "year", "user-1");
    expect(result.activatedWithoutPayment).toBe(true);
    expect(result.planCode).toBe("pro");
    expect(result.interval).toBe("year");
    expect(prisma.subscription.update).toHaveBeenCalled();
  });

  it("cancelAtPeriodEnd marca flag y cancela en MP si hay preapproval", async () => {
    prisma.subscription.findUnique.mockResolvedValue({
      id: "sub-5",
      companyId: "co-1",
      status: "active",
      mpPreapprovalId: "pre-1",
      currentPeriodEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });
    prisma.subscription.update.mockResolvedValue({
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    });

    // Sin token MP: solo marca local
    const result = await service.cancelAtPeriodEnd("co-1");
    expect(result.cancelAtPeriodEnd).toBe(true);
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { cancelAtPeriodEnd: true },
      }),
    );
  });

  it("extiende periodo en cobro aprobado si ya está active", async () => {
    const periodEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    prisma.subscription.findUnique.mockResolvedValue({
      id: "sub-6",
      companyId: "co-1",
      status: "active",
      cancelAtPeriodEnd: false,
      billingInterval: "month",
      desiredBillingInterval: null,
      currentPeriodEnd: periodEnd,
      mpPaymentId: "pay-old",
      plan: proPlan,
    });
    prisma.plan.findUnique.mockResolvedValue(proPlan);
    prisma.subscription.update.mockResolvedValue({});

    await service.handleSubscriptionPaymentApproved("co-1", "pro", "pay-new", "month");
    expect(prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "active",
          mpPaymentId: "pay-new",
        }),
      }),
    );
  });

  it("lista planes públicos con precio anual", async () => {
    prisma.plan.findMany.mockResolvedValue([proPlan]);
    const plans = await service.listPublicPlans();
    expect(plans[0]?.code).toBe("pro");
    expect(plans[0]?.priceYearUsdCents).toBe(39000);
  });

  it("parsea external_reference con intervalo", () => {
    expect(service.parseSubscriptionExternalRef("sub:co-1:pro:year")).toEqual({
      companyId: "co-1",
      planCode: "pro",
      interval: "year",
    });
    expect(service.parseSubscriptionExternalRef("sub:co-1:business")).toEqual({
      companyId: "co-1",
      planCode: "business",
      interval: "month",
    });
  });
});
