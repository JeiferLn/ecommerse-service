"use client";

import type {
  BillingCancelResult,
  BillingCheckoutResult,
  BillingInterval,
  PlanCode,
  PlanView,
  SubscriptionDetails,
  SubscriptionStatus,
} from "@commerce-ai/types";
import {
  BILLING_INTERVAL_LABELS,
  PLAN_CODE_LABELS,
  canManageBilling,
  SUBSCRIPTION_STATUS_LABELS,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { apiFetch, ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

const STATUS_TONE: Record<SubscriptionStatus, StatusTone> = {
  trialing: "neutral",
  active: "positive",
  past_due: "attention",
  trial_expired: "negative",
  canceled: "negative",
};

function formatUsd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function UsageRow({ label, used, max }: { label: string; used: number; max: number }) {
  const [shown, setShown] = useState(false);
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;

  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-1.5 py-3 sm:grid-cols-[10rem_minmax(0,1fr)_7rem]">
      <span className="text-sm">{label}</span>
      <span className="text-right text-sm text-muted-foreground tabular-nums sm:order-last">
        {used.toLocaleString("es-CO")} / {max.toLocaleString("es-CO")}
      </span>
      <div className="col-span-2 h-1 overflow-hidden rounded-full bg-muted sm:col-span-1">
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-700 ease-out",
            pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-warning" : "bg-primary",
          )}
          style={{ width: shown ? `${pct}%` : 0 }}
        />
      </div>
    </li>
  );
}

function BillingPageInner() {
  const { user, refresh } = useSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const canManage = Boolean(user && canManageBilling(user.role));
  const [interval, setInterval] = useState<BillingInterval>("month");
  const autoCheckoutStarted = useRef(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["billing-subscription", user?.companyId],
    queryFn: () => apiFetch<SubscriptionDetails>("/billing/subscription"),
    enabled: Boolean(user?.companyId),
  });

  const { data: plans } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () => apiFetch<PlanView[]>("/billing/plans"),
    enabled: canManage,
  });

  useEffect(() => {
    if (data?.desiredBillingInterval) {
      setInterval(data.desiredBillingInterval);
    } else if (data?.billingInterval) {
      setInterval(data.billingInterval);
    }
  }, [data?.desiredBillingInterval, data?.billingInterval]);

  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "success" || status === "pending") {
      void refetch();
      void refresh();
    }
  }, [searchParams, refetch, refresh]);

  const checkoutMutation = useMutation({
    mutationFn: ({
      planCode,
      billingInterval,
    }: {
      planCode: Exclude<PlanCode, "free">;
      billingInterval: BillingInterval;
    }) =>
      apiFetch<BillingCheckoutResult>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planCode, interval: billingInterval }),
      }),
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ["billing-subscription"] });
      await refresh();
      if (result.initPoint) {
        window.location.assign(result.initPoint);
        return;
      }
      if (result.activatedWithoutPayment) {
        await refetch();
      }
    },
  });

  // Plan pendiente del registro: abrir pasarela sin esperar otro clic.
  useEffect(() => {
    if (!canManage || !data || autoCheckoutStarted.current) {
      return;
    }
    if (
      data.checkoutRequired &&
      (data.desiredPlanCode === "pro" || data.desiredPlanCode === "business")
    ) {
      autoCheckoutStarted.current = true;
      const billingInterval = data.desiredBillingInterval ?? "month";
      checkoutMutation.mutate({
        planCode: data.desiredPlanCode,
        billingInterval,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cargar suscripción pendiente
  }, [canManage, data?.checkoutRequired, data?.desiredPlanCode, data?.desiredBillingInterval]);

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiFetch<BillingCancelResult>("/billing/cancel", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["billing-subscription"] });
      await refresh();
      await refetch();
    },
  });

  const header = (
    <PageHeader
      title="Facturación"
      description="Tu plan, lo que llevas usado este periodo y la suscripción a Pro o Business."
      className="mb-6"
    />
  );

  if (!user) {
    return (
      <>
        {header}
        <Skeleton className="h-20 w-full max-w-5xl rounded-lg" />
      </>
    );
  }

  if (!canManage) {
    return (
      <>
        {header}
        <p className="text-sm text-muted-foreground">
          Solo el dueño de la empresa puede gestionar la facturación.
        </p>
      </>
    );
  }

  const periodEndLabel = data?.currentPeriodEnd
    ? new Date(data.currentPeriodEnd).toLocaleDateString("es-CO", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  const paidPlans = [...(plans ?? [])]
    .filter((plan): plan is PlanView & { code: Exclude<PlanCode, "free"> } => plan.code !== "free")
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="flex max-w-5xl flex-col">
      {header}

      {isLoading ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-20 w-full rounded-lg" />
          <SkeletonText lines={5} />
        </div>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive">
          {error instanceof ApiClientError ? error.message : "No se pudo cargar la suscripción"}
        </p>
      ) : null}

      {data ? (
        <>
          <section className="flex flex-col gap-4 rounded-lg border border-border p-5 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-medium">{data.planName}</span>
                <StatusPill tone={STATUS_TONE[data.status]}>
                  {SUBSCRIPTION_STATUS_LABELS[data.status]}
                </StatusPill>
                {data.billingInterval ? (
                  <span className="text-sm text-muted-foreground">
                    {BILLING_INTERVAL_LABELS[data.billingInterval]}
                  </span>
                ) : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {data.featuresLocked
                  ? "Funciones bloqueadas hasta que actives un plan de pago."
                  : data.trialDaysLeft != null
                    ? `Te quedan ${data.trialDaysLeft} días de prueba.`
                    : periodEndLabel
                      ? data.cancelAtPeriodEnd
                        ? `Acceso hasta el ${periodEndLabel}.`
                        : `Se renueva el ${periodEndLabel}.`
                      : `Periodo ${data.usage.periodKey}.`}
              </p>
              {data.desiredPlanCode && data.status === "trialing" ? (
                <p className="text-sm">
                  Elegiste {PLAN_CODE_LABELS[data.desiredPlanCode]}
                  {data.desiredBillingInterval
                    ? ` (${BILLING_INTERVAL_LABELS[data.desiredBillingInterval].toLowerCase()})`
                    : ""}{" "}
                  al registrarte; está pendiente de pago.
                </p>
              ) : null}
            </div>
            {data.status === "active" && !data.cancelAtPeriodEnd ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit text-muted-foreground"
                disabled={cancelMutation.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      "¿Cancelar la renovación automática? Mantendrás el acceso hasta el fin del periodo actual.",
                    )
                  ) {
                    cancelMutation.mutate();
                  }
                }}
              >
                {cancelMutation.isPending ? "Cancelando…" : "Cancelar renovación"}
              </Button>
            ) : null}
          </section>

          {data.cancelAtPeriodEnd && periodEndLabel && !data.featuresLocked ? (
            <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              Renovación cancelada. Sigues con el plan hasta el {periodEndLabel}.
            </p>
          ) : null}
          {cancelMutation.isError ? (
            <p className="mt-3 text-sm text-destructive">
              {cancelMutation.error instanceof ApiClientError
                ? cancelMutation.error.message
                : "No se pudo cancelar"}
            </p>
          ) : null}

          <section className="mt-10 flex flex-col gap-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-sm font-medium">Planes</h2>
                <p className="text-sm text-muted-foreground">
                  Precios en USD; al pagar se cobra el equivalente en tu moneda.
                </p>
              </div>
              <Segmented
                label="Periodo de facturación"
                size="sm"
                value={interval}
                onChange={setInterval}
                options={[
                  { value: "month" as const, label: "Mensual" },
                  { value: "year" as const, label: "Anual · 2 meses gratis" },
                ]}
              />
            </div>

            {plans ? (
              <div className="grid divide-y divide-border rounded-lg border border-border md:grid-cols-2 md:divide-x md:divide-y-0">
                {paidPlans.map((plan) => {
                  const isCurrent =
                    data.planCode === plan.code && data.status === "active" && !data.featuresLocked;
                  const price = interval === "year" ? plan.priceYearUsdCents : plan.priceUsdCents;
                  return (
                    <div key={plan.code} className="flex flex-col gap-4 p-5">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{plan.name}</span>
                        {isCurrent ? <StatusPill tone="positive">Plan actual</StatusPill> : null}
                      </div>
                      <p key={interval} className="fade-swap flex items-baseline gap-1">
                        <span className="text-3xl font-semibold tracking-tight tabular-nums">
                          {formatUsd(price)}
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {interval === "year" ? "/año" : "/mes"}
                        </span>
                      </p>
                      <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
                        <li>{plan.maxProducts.toLocaleString("es-CO")} productos</li>
                        <li>{plan.maxMembers.toLocaleString("es-CO")} personas en el equipo</li>
                        <li>
                          {plan.maxAiRepliesMonth.toLocaleString("es-CO")} respuestas del asistente
                          al mes
                        </li>
                      </ul>
                      <Button
                        type="button"
                        className="mt-auto w-fit"
                        variant={plan.highlighted ? "default" : "outline"}
                        disabled={checkoutMutation.isPending || isCurrent}
                        onClick={() =>
                          checkoutMutation.mutate({
                            planCode: plan.code,
                            billingInterval: interval,
                          })
                        }
                      >
                        {isCurrent ? "Tu plan" : `Activar ${plan.name}`}
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <Skeleton className="h-56 w-full rounded-lg" />
            )}
            {checkoutMutation.isError ? (
              <p className="text-sm text-destructive">
                {checkoutMutation.error instanceof ApiClientError
                  ? checkoutMutation.error.message
                  : "No se pudo iniciar el checkout"}
              </p>
            ) : null}
            {checkoutMutation.isSuccess && checkoutMutation.data.activatedWithoutPayment ? (
              <p className="text-sm text-muted-foreground">
                Plan activado en modo desarrollo (sin cobro).
              </p>
            ) : null}
          </section>

          <section className="mt-10 flex flex-col gap-2">
            <div className="flex flex-col gap-1">
              <h2 className="text-sm font-medium">Uso del periodo</h2>
              <p className="text-sm text-muted-foreground">
                Contadores de {data.usage.periodKey} (UTC).
              </p>
            </div>
            <ul className="divide-y divide-border border-y border-border">
              <UsageRow label="Miembros" used={data.usage.members} max={data.limits.maxMembers} />
              <UsageRow
                label="Productos"
                used={data.usage.products}
                max={data.limits.maxProducts}
              />
              <UsageRow
                label="Variantes"
                used={data.usage.variants}
                max={data.limits.maxVariants}
              />
              <UsageRow
                label="Documentos"
                used={data.usage.knowledgeDocs}
                max={data.limits.maxKnowledgeDocs}
              />
              <UsageRow
                label="Mensajes recibidos"
                used={data.usage.waInbound}
                max={data.limits.maxWaMessagesMonth}
              />
              <UsageRow
                label="Respuestas IA"
                used={data.usage.aiReplies}
                max={data.limits.maxAiRepliesMonth}
              />
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<SkeletonText lines={4} className="max-w-md" />}>
      <BillingPageInner />
    </Suspense>
  );
}
