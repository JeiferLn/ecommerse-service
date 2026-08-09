import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  BillingCheckoutResult,
  PlanCode,
  PlanView,
  SubscriptionDetails,
  SubscriptionStatus,
  SubscriptionSummary,
} from "@commerce-ai/types";
import { PlanCode as PrismaPlanCode, type Plan, type Prisma } from "@prisma/client";

import type { Env } from "../config/env.validation";
import { MercadoPagoService } from "../payments/mercadopago.service";
import { PrismaService } from "../prisma/prisma.service";

const TRIAL_DAYS = 15;
const PAID_PERIOD_DAYS = 30;

export type EntitlementAction =
  | "use_whatsapp"
  | "use_ai"
  | "create_product"
  | "create_variant"
  | "invite_member"
  | "upload_knowledge"
  | "connect_whatsapp";

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly mercadoPago: MercadoPagoService,
  ) {}

  async ensurePlansSeeded(): Promise<void> {
    const count = await this.prisma.plan.count();
    if (count >= 3) {
      return;
    }
    const defs: Array<{
      code: PrismaPlanCode;
      name: string;
      priceUsdCents: number;
      maxMembers: number;
      maxProducts: number;
      maxVariants: number;
      maxWaMessagesMonth: number;
      maxAiRepliesMonth: number;
      maxKnowledgeDocs: number;
      sortOrder: number;
    }> = [
      {
        code: "free",
        name: "Free",
        priceUsdCents: 0,
        maxMembers: 2,
        maxProducts: 30,
        maxVariants: 80,
        maxWaMessagesMonth: 100,
        maxAiRepliesMonth: 50,
        maxKnowledgeDocs: 1,
        sortOrder: 0,
      },
      {
        code: "pro",
        name: "Pro",
        priceUsdCents: 3900,
        maxMembers: 5,
        maxProducts: 300,
        maxVariants: 1000,
        maxWaMessagesMonth: 2000,
        maxAiRepliesMonth: 1500,
        maxKnowledgeDocs: 5,
        sortOrder: 1,
      },
      {
        code: "business",
        name: "Business",
        priceUsdCents: 9900,
        maxMembers: 25,
        maxProducts: 2000,
        maxVariants: 8000,
        maxWaMessagesMonth: 10000,
        maxAiRepliesMonth: 8000,
        maxKnowledgeDocs: 20,
        sortOrder: 2,
      },
    ];
    for (const plan of defs) {
      await this.prisma.plan.upsert({
        where: { code: plan.code },
        update: {},
        create: plan,
      });
    }
  }

  async listPublicPlans(): Promise<PlanView[]> {
    await this.ensurePlansSeeded();
    const plans = await this.prisma.plan.findMany({
      where: { isPublic: true },
      orderBy: { sortOrder: "asc" },
    });
    return plans.map((plan) => this.toPlanView(plan));
  }

  async startTrialForCompany(
    tx: Prisma.TransactionClient,
    companyId: string,
    desiredPlanCode?: PlanCode | null,
  ): Promise<void> {
    const free = await tx.plan.findUnique({ where: { code: "free" } });
    if (!free) {
      throw new ServiceUnavailableException("Planes no inicializados; ejecuta el seed");
    }
    let desiredPlanId: string | null = null;
    if (desiredPlanCode && desiredPlanCode !== "free") {
      const desired = await tx.plan.findUnique({ where: { code: desiredPlanCode } });
      desiredPlanId = desired?.id ?? null;
    }
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    await tx.subscription.create({
      data: {
        companyId,
        planId: free.id,
        status: "trialing",
        trialEndsAt,
        desiredPlanId,
      },
    });
  }

  async getSubscriptionSummary(companyId: string | null): Promise<SubscriptionSummary | null> {
    if (!companyId) {
      return null;
    }
    const details = await this.getSubscriptionDetails(companyId);
    return {
      planCode: details.planCode,
      planName: details.planName,
      status: details.status,
      trialEndsAt: details.trialEndsAt,
      trialDaysLeft: details.trialDaysLeft,
      desiredPlanCode: details.desiredPlanCode,
      checkoutRequired: details.checkoutRequired,
      featuresLocked: details.featuresLocked,
    };
  }

  async getSubscriptionDetails(companyId: string): Promise<SubscriptionDetails> {
    await this.ensurePlansSeeded();
    const sub = await this.refreshTrialStatus(companyId);
    const periodKey = this.currentPeriodKey();
    const [members, products, variants, knowledgeDocs, usage] = await Promise.all([
      this.prisma.companyMembership.count({ where: { companyId } }),
      this.prisma.product.count({ where: { companyId } }),
      this.prisma.productVariant.count({ where: { product: { companyId } } }),
      this.prisma.knowledgeDocument.count({
        where: { companyId, status: "active", fileKey: { not: null } },
      }),
      this.prisma.usageCounter.findUnique({
        where: { companyId_periodKey: { companyId, periodKey } },
      }),
    ]);

    const plan = sub.plan;
    const status = sub.status as SubscriptionStatus;
    const featuresLocked = status === "trial_expired" || status === "canceled";
    const trialDaysLeft =
      status === "trialing" && sub.trialEndsAt
        ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)))
        : null;

    return {
      planCode: plan.code as PlanCode,
      planName: plan.name,
      status,
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      trialDaysLeft,
      desiredPlanCode: (sub.desiredPlan?.code as PlanCode | undefined) ?? null,
      checkoutRequired: Boolean(
        sub.desiredPlan && sub.desiredPlan.code !== "free" && status === "trialing",
      ),
      featuresLocked,
      priceUsdCents: plan.priceUsdCents,
      limits: {
        maxMembers: plan.maxMembers,
        maxProducts: plan.maxProducts,
        maxVariants: plan.maxVariants,
        maxWaMessagesMonth: plan.maxWaMessagesMonth,
        maxAiRepliesMonth: plan.maxAiRepliesMonth,
        maxKnowledgeDocs: plan.maxKnowledgeDocs,
      },
      usage: {
        members,
        products,
        variants,
        knowledgeDocs,
        waInbound: usage?.waInboundCount ?? 0,
        aiReplies: usage?.aiReplyCount ?? 0,
        periodKey,
      },
      currentPeriodStart: sub.currentPeriodStart?.toISOString() ?? null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  async assertCan(companyId: string | null, action: EntitlementAction): Promise<void> {
    if (!companyId) {
      throw new BadRequestException("Selecciona una empresa activa");
    }
    const details = await this.getSubscriptionDetails(companyId);

    if (details.featuresLocked) {
      if (
        action === "use_whatsapp" ||
        action === "use_ai" ||
        action === "connect_whatsapp" ||
        action === "create_product" ||
        action === "create_variant" ||
        action === "invite_member" ||
        action === "upload_knowledge"
      ) {
        throw new ForbiddenException(
          "Tu prueba terminó. Elige un plan en Facturación para continuar.",
        );
      }
    }

    const { limits, usage } = details;
    switch (action) {
      case "create_product":
        if (usage.products >= limits.maxProducts) {
          throw new ForbiddenException(
            `Límite de productos del plan (${limits.maxProducts}). Mejora tu plan.`,
          );
        }
        break;
      case "create_variant":
        if (usage.variants >= limits.maxVariants) {
          throw new ForbiddenException(
            `Límite de variantes del plan (${limits.maxVariants}). Mejora tu plan.`,
          );
        }
        break;
      case "invite_member":
        if (usage.members >= limits.maxMembers) {
          throw new ForbiddenException(
            `Límite de miembros del plan (${limits.maxMembers}). Mejora tu plan.`,
          );
        }
        break;
      case "upload_knowledge":
        if (usage.knowledgeDocs >= limits.maxKnowledgeDocs) {
          throw new ForbiddenException(
            `Límite de documentos de conocimiento (${limits.maxKnowledgeDocs}). Mejora tu plan.`,
          );
        }
        break;
      case "use_whatsapp":
        if (usage.waInbound >= limits.maxWaMessagesMonth) {
          throw new ForbiddenException("Cupo mensual de mensajes WhatsApp agotado.");
        }
        break;
      case "use_ai":
        if (usage.aiReplies >= limits.maxAiRepliesMonth) {
          throw new ForbiddenException("Cupo mensual de respuestas IA agotado.");
        }
        break;
      case "connect_whatsapp":
        break;
      default:
        break;
    }
  }

  async recordWaInbound(companyId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      await this.assertCan(companyId, "use_whatsapp");
    } catch (error) {
      return {
        allowed: false,
        reason: error instanceof Error ? error.message : "Límite de WhatsApp",
      };
    }
    await this.incrementUsage(companyId, "waInboundCount");
    return { allowed: true };
  }

  async recordAiReply(companyId: string): Promise<{ allowed: boolean; reason?: string }> {
    try {
      await this.assertCan(companyId, "use_ai");
    } catch (error) {
      return {
        allowed: false,
        reason: error instanceof Error ? error.message : "Límite de IA",
      };
    }
    await this.incrementUsage(companyId, "aiReplyCount");
    return { allowed: true };
  }

  async checkout(
    companyId: string | null,
    planCode: PlanCode,
  ): Promise<BillingCheckoutResult> {
    if (!companyId) {
      throw new BadRequestException("Selecciona una empresa activa");
    }
    if (planCode === "free") {
      throw new BadRequestException("El plan Free no requiere pago");
    }
    await this.ensurePlansSeeded();
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.isPublic) {
      throw new NotFoundException("Plan no encontrado");
    }

    await this.prisma.subscription.update({
      where: { companyId },
      data: { desiredPlanId: plan.id },
    });

    const allowDev =
      this.config.get("NODE_ENV", { infer: true }) === "development" ||
      this.config.get("BILLING_ALLOW_DEV_UPGRADE", { infer: true }) === true;

    const platformToken = this.config.get("MP_ACCESS_TOKEN", { infer: true })?.trim();
    if (!platformToken) {
      if (allowDev) {
        await this.activatePaidPlan(companyId, planCode, null);
        return {
          initPoint: null,
          activatedWithoutPayment: true,
          planCode,
        };
      }
      throw new ServiceUnavailableException(
        "Cobro de suscripción no configurado (MP_ACCESS_TOKEN de plataforma)",
      );
    }

    const frontend = this.config.getOrThrow<string>("FRONTEND_URL").replace(/\/$/, "");
    const notificationUrl = this.mercadoPago.getWebhookNotificationUrl();
    // Cobro en COP aproximado (1 USD ~ 4000 COP) para sandbox; metadata lleva plan real.
    const amountCop = Math.max(1000, Math.round((plan.priceUsdCents / 100) * 4000));

    const preference = await this.mercadoPago.preferenceApi(platformToken).create({
      body: {
        items: [
          {
            id: `plan-${plan.code}`,
            title: `Commerce AI — ${plan.name} (1 mes)`,
            quantity: 1,
            unit_price: amountCop,
            currency_id: "COP",
          },
        ],
        external_reference: `sub:${companyId}:${plan.code}`,
        metadata: {
          purpose: "subscription",
          companyId,
          planCode: plan.code,
        },
        back_urls: {
          success: `${frontend}/dashboard/billing?status=success`,
          failure: `${frontend}/dashboard/billing?status=failure`,
          pending: `${frontend}/dashboard/billing?status=pending`,
        },
        auto_return: "approved",
        ...(notificationUrl
          ? {
              notification_url: `${notificationUrl}?purpose=subscription&companyId=${encodeURIComponent(companyId)}`,
            }
          : {}),
      },
    });

    const initPoint = preference.init_point ?? preference.sandbox_init_point ?? null;
    if (preference.id) {
      await this.prisma.subscription.update({
        where: { companyId },
        data: { mpPreferenceId: String(preference.id) },
      });
    }

    if (!initPoint && allowDev) {
      await this.activatePaidPlan(companyId, planCode, null);
      return { initPoint: null, activatedWithoutPayment: true, planCode };
    }

    if (!initPoint) {
      throw new ServiceUnavailableException("No se pudo iniciar el checkout de Mercado Pago");
    }

    return { initPoint, activatedWithoutPayment: false, planCode };
  }

  async activatePaidPlan(
    companyId: string,
    planCode: PlanCode,
    mpPaymentId: string | null,
  ): Promise<void> {
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      throw new NotFoundException("Plan no encontrado");
    }
    const now = new Date();
    const periodEnd = new Date(now.getTime() + PAID_PERIOD_DAYS * 24 * 60 * 60 * 1000);
    await this.prisma.subscription.update({
      where: { companyId },
      data: {
        planId: plan.id,
        status: "active",
        desiredPlanId: null,
        trialEndsAt: null,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        mpPaymentId: mpPaymentId,
      },
    });
  }

  async handleSubscriptionPaymentApproved(
    companyId: string,
    planCode: PlanCode,
    paymentId: string,
  ): Promise<void> {
    await this.activatePaidPlan(companyId, planCode, paymentId);
  }

  private async refreshTrialStatus(companyId: string) {
    let sub = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { plan: true, desiredPlan: true },
    });
    if (!sub) {
      await this.ensurePlansSeeded();
      const free = await this.prisma.plan.findUniqueOrThrow({ where: { code: "free" } });
      const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
      sub = await this.prisma.subscription.create({
        data: {
          companyId,
          planId: free.id,
          status: "trialing",
          trialEndsAt,
        },
        include: { plan: true, desiredPlan: true },
      });
    }
    if (
      sub.status === "trialing" &&
      sub.trialEndsAt &&
      sub.trialEndsAt.getTime() < Date.now()
    ) {
      sub = await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "trial_expired" },
        include: { plan: true, desiredPlan: true },
      });
    }
    return sub;
  }

  private async incrementUsage(
    companyId: string,
    field: "waInboundCount" | "aiReplyCount",
  ): Promise<void> {
    const periodKey = this.currentPeriodKey();
    await this.prisma.usageCounter.upsert({
      where: { companyId_periodKey: { companyId, periodKey } },
      create: {
        companyId,
        periodKey,
        waInboundCount: field === "waInboundCount" ? 1 : 0,
        aiReplyCount: field === "aiReplyCount" ? 1 : 0,
      },
      update: { [field]: { increment: 1 } },
    });
  }

  private currentPeriodKey(date = new Date()): string {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  }

  private toPlanView(plan: Plan): PlanView {
    return {
      code: plan.code as PlanCode,
      name: plan.name,
      priceUsdCents: plan.priceUsdCents,
      maxMembers: plan.maxMembers,
      maxProducts: plan.maxProducts,
      maxVariants: plan.maxVariants,
      maxWaMessagesMonth: plan.maxWaMessagesMonth,
      maxAiRepliesMonth: plan.maxAiRepliesMonth,
      maxKnowledgeDocs: plan.maxKnowledgeDocs,
      sortOrder: plan.sortOrder,
      highlighted: plan.code === "pro",
    };
  }
}
