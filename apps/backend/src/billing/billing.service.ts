import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type {
  BillingCancelResult,
  BillingCheckoutResult,
  BillingInterval,
  PlanCode,
  PlanView,
  SubscriptionDetails,
  SubscriptionStatus,
  SubscriptionSummary,
} from "@commerce-ai/types";
import { priceYearUsdCents } from "@commerce-ai/types";
import {
  BillingInterval as PrismaBillingInterval,
  PlanCode as PrismaPlanCode,
  type Plan,
  type Prisma,
} from "@prisma/client";

import type { Env } from "../config/env.validation";
import { MercadoPagoService } from "../payments/mercadopago.service";
import { PrismaService } from "../prisma/prisma.service";

const TRIAL_DAYS = 15;
const MONTH_PERIOD_DAYS = 30;
const YEAR_PERIOD_DAYS = 365;
/** 1 USD ≈ 4000 COP (aprox. sandbox / display local). */
const USD_TO_COP = 4000;
/** MP Colombia rechaza suscripciones por debajo de este monto. */
const MP_MIN_AMOUNT_COP = 1600;

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
    desiredBillingInterval?: BillingInterval | null,
  ): Promise<void> {
    const free = await tx.plan.findUnique({ where: { code: "free" } });
    if (!free) {
      throw new ServiceUnavailableException("Planes no inicializados; ejecuta el seed");
    }
    let desiredPlanId: string | null = null;
    let interval: PrismaBillingInterval | null = null;
    if (desiredPlanCode && desiredPlanCode !== "free") {
      const desired = await tx.plan.findUnique({ where: { code: desiredPlanCode } });
      desiredPlanId = desired?.id ?? null;
      interval = (desiredBillingInterval ?? "month") as PrismaBillingInterval;
    }
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
    await tx.subscription.create({
      data: {
        companyId,
        planId: free.id,
        status: "trialing",
        trialEndsAt,
        desiredPlanId,
        desiredBillingInterval: interval,
      },
    });
  }

  /** Suscripción activa de pago al crear cuenta tras cobro de registro. */
  async createActivePaidSubscription(
    tx: Prisma.TransactionClient,
    companyId: string,
    planCode: PlanCode,
    interval: BillingInterval,
    mpPreapprovalId: string | null,
    mpPaymentId: string | null,
  ): Promise<void> {
    const plan = await tx.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      throw new NotFoundException("Plan no encontrado");
    }
    const now = new Date();
    const periodDays = interval === "year" ? YEAR_PERIOD_DAYS : MONTH_PERIOD_DAYS;
    const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);
    await tx.subscription.create({
      data: {
        companyId,
        planId: plan.id,
        status: "active",
        billingInterval: interval as PrismaBillingInterval,
        cancelAtPeriodEnd: false,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        mpPreapprovalId,
        mpPaymentId,
        trialEndsAt: null,
        desiredPlanId: null,
        desiredBillingInterval: null,
      },
    });
  }

  /**
   * Checkout MP para un PendingRegistration (antes de crear User/Company).
   * external_reference: preg:{pendingId}:{plan}:{interval}
   */
  async createPendingRegistrationCheckout(params: {
    pendingId: string;
    payerEmail: string;
    planCode: "pro" | "business";
    interval: BillingInterval;
  }): Promise<{ initPoint: string; mpPreapprovalId: string | null }> {
    const plan = await this.prisma.plan.findUnique({ where: { code: params.planCode } });
    if (!plan || !plan.isPublic) {
      throw new NotFoundException("Plan no encontrado");
    }

    const platformToken = this.config.get("MP_ACCESS_TOKEN", { infer: true })?.trim();
    if (!platformToken) {
      throw new ServiceUnavailableException(
        "Cobro de suscripción no configurado (MP_ACCESS_TOKEN de plataforma)",
      );
    }

    const backUrl = this.resolveMercadoPagoBackUrl("success", {
      flow: "register",
      pendingId: params.pendingId,
    });
    const notificationUrlBase = this.mercadoPago.getWebhookNotificationUrl();
    const notificationUrl = notificationUrlBase
      ? `${notificationUrlBase}?purpose=subscription&pendingId=${encodeURIComponent(params.pendingId)}`
      : null;

    const usdCents =
      params.interval === "year" ? priceYearUsdCents(plan.priceUsdCents) : plan.priceUsdCents;
    const amountCop = Math.max(MP_MIN_AMOUNT_COP, Math.round((usdCents / 100) * USD_TO_COP));
    const frequency = params.interval === "year" ? 12 : 1;
    const intervalLabel = params.interval === "year" ? "anual" : "mensual";
    const payerEmail = this.resolvePayerEmailForCheckout(params.payerEmail);

    let preapproval;
    try {
      preapproval = await this.mercadoPago.createPreapproval(platformToken, {
        reason: `Commerce AI — ${plan.name} (${intervalLabel})`,
        payerEmail,
        externalReference: `preg:${params.pendingId}:${params.planCode}:${params.interval}`,
        backUrl,
        transactionAmount: amountCop,
        currencyId: "COP",
        frequency,
        frequencyType: "months",
        notificationUrl,
      });
    } catch (error) {
      throw new BadRequestException(this.mapMercadoPagoError(error));
    }

    const initPoint = preapproval.init_point ?? null;
    if (!initPoint) {
      throw new ServiceUnavailableException("No se pudo iniciar la suscripción de Mercado Pago");
    }

    return {
      initPoint,
      mpPreapprovalId: preapproval.id ? String(preapproval.id) : null,
    };
  }

  mapMercadoPagoError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (lower.includes("back_url")) {
      return "Mercado Pago exige una back_url HTTPS válida. En local define API_PUBLIC_URL (ngrok) o FRONTEND_URL con https://";
    }
    if (lower.includes("real or test") || lower.includes("payer and collector")) {
      return (
        "Mercado Pago exige que el pagador sea un usuario de prueba cuando usas credenciales de prueba. " +
        "Define MP_TEST_PAYER_EMAIL con el email del comprador de prueba " +
        "(formato test_user_…@testuser.com, visible en /users/me del comprador) " +
        "o regístrate usando ese email. En el checkout de MP inicia sesión con el usuario Comprador de prueba."
      );
    }
    if (lower.includes("cannot be the same user")) {
      return "El pagador no puede ser el mismo usuario vendedor de prueba. Usa el comprador de prueba (otra cuenta).";
    }
    if (lower.includes("lower than")) {
      return `Mercado Pago: el monto mínimo de suscripción no se cumple (${message}).`;
    }
    return `Mercado Pago: ${message}`;
  }

  /**
   * Con credenciales de prueba, `payer_email` debe ser un usuario test de MP.
   * Si hay MP_TEST_PAYER_EMAIL, se usa para el preapproval (la cuenta SaaS puede usar otro email).
   */
  resolvePayerEmailForCheckout(accountEmail: string): string {
    const testPayer = this.config.get("MP_TEST_PAYER_EMAIL", { infer: true })?.trim();
    if (testPayer) {
      return testPayer.toLowerCase();
    }
    return accountEmail.trim().toLowerCase();
  }

  parsePendingRegistrationExternalRef(
    external: string,
  ): { pendingId: string; planCode: PlanCode; interval: BillingInterval } | null {
    const match = /^preg:([^:]+):(pro|business):(month|year)$/.exec(external.trim());
    if (!match?.[1] || !match[2] || !match[3]) {
      return null;
    }
    return {
      pendingId: match[1],
      planCode: match[2] as PlanCode,
      interval: match[3] as BillingInterval,
    };
  }

  async resolvePendingFromPreapproval(
    preapprovalId: string,
  ): Promise<{ pendingId: string; planCode: PlanCode; interval: BillingInterval } | null> {
    const platformToken = this.config.get("MP_ACCESS_TOKEN", { infer: true })?.trim();
    if (!platformToken) {
      return null;
    }
    const preapproval = await this.mercadoPago.getPreapproval(platformToken, preapprovalId);
    const status = (preapproval.status || "").toLowerCase();
    if (status !== "authorized" && status !== "paused") {
      return null;
    }
    const external =
      typeof preapproval.external_reference === "string"
        ? preapproval.external_reference
        : String(preapproval.external_reference ?? "");
    const parsed = this.parsePendingRegistrationExternalRef(external);
    if (parsed) {
      return parsed;
    }
    return null;
  }

  async isPreapprovalAuthorized(preapprovalId: string): Promise<boolean> {
    const platformToken = this.config.get("MP_ACCESS_TOKEN", { infer: true })?.trim();
    if (!platformToken) {
      return false;
    }
    const preapproval = await this.mercadoPago.getPreapproval(platformToken, preapprovalId);
    const status = (preapproval.status || "").toLowerCase();
    return status === "authorized" || status === "paused";
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
      billingInterval: details.billingInterval,
      cancelAtPeriodEnd: details.cancelAtPeriodEnd,
      currentPeriodEnd: details.currentPeriodEnd,
    };
  }

  async getSubscriptionDetails(companyId: string): Promise<SubscriptionDetails> {
    await this.ensurePlansSeeded();
    const sub = await this.refreshSubscriptionStatus(companyId);
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
    const featuresLocked =
      status === "trial_expired" || status === "canceled" || status === "past_due";
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
      billingInterval: (sub.billingInterval as BillingInterval | null) ?? null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      priceUsdCents: plan.priceUsdCents,
      priceYearUsdCents: priceYearUsdCents(plan.priceUsdCents),
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
      desiredBillingInterval: (sub.desiredBillingInterval as BillingInterval | null) ?? null,
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
          "Tu plan no está activo. Elige un plan en Facturación para continuar.",
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
    interval: BillingInterval,
    payerUserId: string,
  ): Promise<BillingCheckoutResult> {
    if (!companyId) {
      throw new BadRequestException("Selecciona una empresa activa");
    }
    if (planCode === "free") {
      throw new BadRequestException("El plan Free no requiere pago");
    }
    if (interval !== "month" && interval !== "year") {
      throw new BadRequestException("Intervalo de facturación inválido");
    }
    const payer = await this.prisma.user.findUnique({
      where: { id: payerUserId },
      select: { email: true },
    });
    const email = payer?.email?.trim().toLowerCase() ?? "";
    if (!email) {
      throw new BadRequestException("Email del pagador requerido");
    }

    await this.ensurePlansSeeded();
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan || !plan.isPublic) {
      throw new NotFoundException("Plan no encontrado");
    }

    await this.prisma.subscription.update({
      where: { companyId },
      data: {
        desiredPlanId: plan.id,
        desiredBillingInterval: interval as PrismaBillingInterval,
      },
    });

    const allowDev =
      this.config.get("NODE_ENV", { infer: true }) === "development" ||
      this.config.get("BILLING_ALLOW_DEV_UPGRADE", { infer: true }) === true;

    const platformToken = this.config.get("MP_ACCESS_TOKEN", { infer: true })?.trim();
    if (!platformToken) {
      if (allowDev) {
        await this.activatePaidPlan(companyId, planCode, interval, null);
        return {
          initPoint: null,
          activatedWithoutPayment: true,
          planCode,
          interval,
        };
      }
      throw new ServiceUnavailableException(
        "Cobro de suscripción no configurado (MP_ACCESS_TOKEN de plataforma)",
      );
    }

    const backUrl = this.resolveMercadoPagoBackUrl("success");
    const notificationUrlBase = this.mercadoPago.getWebhookNotificationUrl();
    const notificationUrl = notificationUrlBase
      ? `${notificationUrlBase}?purpose=subscription&companyId=${encodeURIComponent(companyId)}`
      : null;

    const usdCents =
      interval === "year" ? priceYearUsdCents(plan.priceUsdCents) : plan.priceUsdCents;
    const amountCop = Math.max(MP_MIN_AMOUNT_COP, Math.round((usdCents / 100) * USD_TO_COP));
    const frequency = interval === "year" ? 12 : 1;
    const intervalLabel = interval === "year" ? "anual" : "mensual";
    const payerEmail = this.resolvePayerEmailForCheckout(email);

    let preapproval;
    try {
      preapproval = await this.mercadoPago.createPreapproval(platformToken, {
        reason: `Commerce AI — ${plan.name} (${intervalLabel})`,
        payerEmail,
        externalReference: `sub:${companyId}:${plan.code}:${interval}`,
        backUrl,
        transactionAmount: amountCop,
        currencyId: "COP",
        frequency,
        frequencyType: "months",
        notificationUrl,
      });
    } catch (error) {
      throw new BadRequestException(this.mapMercadoPagoError(error));
    }

    if (preapproval.id) {
      await this.prisma.subscription.update({
        where: { companyId },
        data: { mpPreapprovalId: String(preapproval.id) },
      });
    }

    const initPoint = preapproval.init_point ?? null;
    if (!initPoint && allowDev) {
      await this.activatePaidPlan(companyId, planCode, interval, null);
      return { initPoint: null, activatedWithoutPayment: true, planCode, interval };
    }

    if (!initPoint) {
      throw new ServiceUnavailableException("No se pudo iniciar la suscripción de Mercado Pago");
    }

    return { initPoint, activatedWithoutPayment: false, planCode, interval };
  }

  /**
   * MP Preapproval rechaza http://localhost. Preferir FRONTEND_URL si es HTTPS;
   * si no, usar API_PUBLIC_URL → /billing/mp-return o /auth/mp-return.
   * Registro siempre vuelve por el API para poder crear la cuenta antes del login.
   */
  resolveMercadoPagoBackUrl(
    status: "success" | "failure" | "pending",
    options?: { flow?: "billing" | "register"; pendingId?: string },
  ): string {
    const flow = options?.flow ?? "billing";
    const frontend = this.config.getOrThrow<string>("FRONTEND_URL").replace(/\/$/, "");
    const apiPublic = this.config.get("API_PUBLIC_URL", { infer: true })?.trim().replace(/\/$/, "");

    const query = new URLSearchParams({ status, flow });
    if (options?.pendingId) {
      query.set("pendingId", options.pendingId);
    }

    // Registro: pendingId en el PATH (MP concatena mal otro `?preapproval_id=` sobre query strings).
    if (flow === "register") {
      if (!options?.pendingId) {
        throw new BadRequestException("pendingId requerido para retorno de registro");
      }
      const path = `/api/v1/auth/mp-return/${encodeURIComponent(options.pendingId)}`;
      if (apiPublic?.startsWith("https://")) {
        return `${apiPublic}${path}`;
      }
      if (frontend.startsWith("https://")) {
        return `${frontend.replace(/\/$/, "")}${path}`;
      }
      throw new BadRequestException(
        "Mercado Pago exige HTTPS para volver del pago. Define API_PUBLIC_URL con https:// (ngrok).",
      );
    }

    if (frontend.startsWith("https://")) {
      return this.buildFrontendReturnPath(frontend, status, flow);
    }
    if (apiPublic?.startsWith("https://")) {
      return `${apiPublic}/api/v1/billing/mp-return?${query.toString()}`;
    }
    throw new BadRequestException(
      "Mercado Pago exige HTTPS para volver del pago. Define FRONTEND_URL o API_PUBLIC_URL con https:// (ngrok).",
    );
  }

  private buildFrontendReturnPath(
    frontend: string,
    status: string,
    flow: "billing" | "register",
  ): string {
    if (flow === "register") {
      return `${frontend}/login?registered=1&status=${status}`;
    }
    return `${frontend}/billing?status=${status}`;
  }

  /** Destino local tras el retorno HTTPS del API (ngrok). */
  getFrontendBillingReturnUrl(status: string, flow?: string): string {
    const frontend = this.config.getOrThrow<string>("FRONTEND_URL").replace(/\/$/, "");
    const safe =
      status === "success" || status === "failure" || status === "pending" ? status : "success";
    const resolvedFlow = flow === "register" ? "register" : "billing";
    return this.buildFrontendReturnPath(frontend, safe, resolvedFlow);
  }

  async cancelAtPeriodEnd(companyId: string | null): Promise<BillingCancelResult> {
    if (!companyId) {
      throw new BadRequestException("Selecciona una empresa activa");
    }
    const sub = await this.prisma.subscription.findUnique({ where: { companyId } });
    if (!sub) {
      throw new NotFoundException("Suscripción no encontrada");
    }
    if (sub.status !== "active" && sub.status !== "past_due") {
      throw new BadRequestException("Solo puedes cancelar una suscripción activa o en mora");
    }

    const platformToken = this.config.get("MP_ACCESS_TOKEN", { infer: true })?.trim();
    if (sub.mpPreapprovalId && platformToken) {
      try {
        await this.mercadoPago.cancelPreapproval(platformToken, sub.mpPreapprovalId);
      } catch {
        // Seguimos marcando cancelAtPeriodEnd localmente; MP puede ya estar cancelled.
      }
    }

    const updated = await this.prisma.subscription.update({
      where: { companyId },
      data: { cancelAtPeriodEnd: true },
    });

    return {
      cancelAtPeriodEnd: true,
      currentPeriodEnd: updated.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  async activatePaidPlan(
    companyId: string,
    planCode: PlanCode,
    interval: BillingInterval,
    mpPaymentId: string | null,
  ): Promise<void> {
    const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
    if (!plan) {
      throw new NotFoundException("Plan no encontrado");
    }
    const now = new Date();
    const periodDays = interval === "year" ? YEAR_PERIOD_DAYS : MONTH_PERIOD_DAYS;
    const periodEnd = new Date(now.getTime() + periodDays * 24 * 60 * 60 * 1000);
    await this.prisma.subscription.update({
      where: { companyId },
      data: {
        planId: plan.id,
        status: "active",
        desiredPlanId: null,
        desiredBillingInterval: null,
        trialEndsAt: null,
        billingInterval: interval as PrismaBillingInterval,
        cancelAtPeriodEnd: false,
        currentPeriodStart: now,
        currentPeriodEnd: periodEnd,
        mpPaymentId: mpPaymentId,
      },
    });
  }

  /**
   * Activa o extiende el periodo tras un cobro aprobado de suscripción.
   * Idempotente si el mismo mpPaymentId ya fue aplicado.
   */
  async handleSubscriptionPaymentApproved(
    companyId: string,
    planCode: PlanCode,
    paymentId: string,
    interval?: BillingInterval | null,
  ): Promise<void> {
    const sub = await this.prisma.subscription.findUnique({
      where: { companyId },
      include: { plan: true },
    });
    if (!sub) {
      throw new NotFoundException("Suscripción no encontrada");
    }
    if (sub.mpPaymentId && sub.mpPaymentId === paymentId) {
      return;
    }

    const resolvedInterval: BillingInterval =
      interval ??
      (sub.desiredBillingInterval as BillingInterval | null) ??
      (sub.billingInterval as BillingInterval | null) ??
      "month";

    if (sub.status === "active" && !sub.cancelAtPeriodEnd) {
      const base =
        sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > Date.now()
          ? sub.currentPeriodEnd
          : new Date();
      const periodDays = resolvedInterval === "year" ? YEAR_PERIOD_DAYS : MONTH_PERIOD_DAYS;
      const periodEnd = new Date(base.getTime() + periodDays * 24 * 60 * 60 * 1000);
      const plan = await this.prisma.plan.findUnique({ where: { code: planCode } });
      await this.prisma.subscription.update({
        where: { companyId },
        data: {
          ...(plan ? { planId: plan.id } : {}),
          status: "active",
          cancelAtPeriodEnd: false,
          billingInterval: resolvedInterval as PrismaBillingInterval,
          currentPeriodEnd: periodEnd,
          mpPaymentId: paymentId,
          desiredPlanId: null,
          desiredBillingInterval: null,
          trialEndsAt: null,
        },
      });
      return;
    }

    await this.activatePaidPlan(companyId, planCode, resolvedInterval, paymentId);
  }

  async handlePreapprovalAuthorized(preapprovalId: string): Promise<void> {
    const platformToken = this.config.get("MP_ACCESS_TOKEN", { infer: true })?.trim();
    if (!platformToken) {
      return;
    }
    const preapproval = await this.mercadoPago.getPreapproval(platformToken, preapprovalId);
    const status = (preapproval.status || "").toLowerCase();
    if (status !== "authorized" && status !== "paused") {
      return;
    }

    const parsed = this.parseSubscriptionExternalRef(
      typeof preapproval.external_reference === "string"
        ? preapproval.external_reference
        : String(preapproval.external_reference ?? ""),
    );
    if (!parsed) {
      return;
    }

    await this.prisma.subscription.update({
      where: { companyId: parsed.companyId },
      data: { mpPreapprovalId: preapprovalId },
    });

    // Primer alta: si aún no está active, activar (el cobro puede llegar aparte).
    const sub = await this.prisma.subscription.findUnique({
      where: { companyId: parsed.companyId },
    });
    if (sub && sub.status !== "active") {
      await this.activatePaidPlan(
        parsed.companyId,
        parsed.planCode,
        parsed.interval,
        null,
      );
    }
  }

  parseSubscriptionExternalRef(
    external: string,
  ): { companyId: string; planCode: PlanCode; interval: BillingInterval } | null {
    const match = /^sub:([^:]+):(pro|business):(month|year)$/.exec(external.trim());
    if (!match) {
      // Compat legacy: sub:companyId:plan
      const legacy = /^sub:([^:]+):(pro|business)$/.exec(external.trim());
      if (!legacy?.[1] || !legacy[2]) {
        return null;
      }
      return {
        companyId: legacy[1],
        planCode: legacy[2] as PlanCode,
        interval: "month",
      };
    }
    if (!match[1] || !match[2] || !match[3]) {
      return null;
    }
    return {
      companyId: match[1],
      planCode: match[2] as PlanCode,
      interval: match[3] as BillingInterval,
    };
  }

  private async refreshSubscriptionStatus(companyId: string) {
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
    } else if (
      sub.status === "active" &&
      sub.cancelAtPeriodEnd &&
      sub.currentPeriodEnd &&
      sub.currentPeriodEnd.getTime() < Date.now()
    ) {
      sub = await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "canceled" },
        include: { plan: true, desiredPlan: true },
      });
    } else if (
      sub.status === "active" &&
      !sub.cancelAtPeriodEnd &&
      sub.currentPeriodEnd &&
      sub.currentPeriodEnd.getTime() < Date.now()
    ) {
      sub = await this.prisma.subscription.update({
        where: { id: sub.id },
        data: { status: "past_due" },
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
      priceYearUsdCents: priceYearUsdCents(plan.priceUsdCents),
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
