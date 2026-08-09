"use client";

import type {
  BillingCheckoutResult,
  PlanCode,
  SubscriptionDetails,
} from "@commerce-ai/types";
import { canManageBilling, SUBSCRIPTION_STATUS_LABELS } from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Wallet } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

function UsageBar({ label, used, max }: { label: string; used: number; max: number }) {
  const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="text-muted-foreground">
          {used} / {max}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function BillingPageInner() {
  const { user, refresh } = useSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const canManage = Boolean(user && canManageBilling(user.role));

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["billing-subscription", user?.companyId],
    queryFn: () => apiFetch<SubscriptionDetails>("/billing/subscription"),
    enabled: Boolean(user?.companyId),
  });

  useEffect(() => {
    const status = searchParams.get("status");
    if (status === "success" || status === "pending") {
      void refetch();
      void refresh();
    }
  }, [searchParams, refetch, refresh]);

  const checkoutMutation = useMutation({
    mutationFn: (planCode: Exclude<PlanCode, "free">) =>
      apiFetch<BillingCheckoutResult>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planCode }),
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

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Solo el dueño de la empresa puede gestionar la facturación.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Facturación</h1>
        <p className="text-muted-foreground">
          Plan actual, uso del periodo y upgrade a Pro o Business.
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando suscripción…</p>}
      {error && (
        <p className="text-sm text-destructive">
          {error instanceof ApiClientError ? error.message : "No se pudo cargar la suscripción"}
        </p>
      )}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="border-border/70 bg-card/80 shadow-brand-sm">
              <CardHeader>
                <CardTitle className="font-heading flex items-center gap-2 text-xl">
                  <Wallet className="size-5" aria-hidden />
                  {data.planName}
                </CardTitle>
                <CardDescription>
                  {SUBSCRIPTION_STATUS_LABELS[data.status]}
                  {data.trialDaysLeft != null ? ` · ${data.trialDaysLeft} días de prueba` : ""}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-3 text-sm">
                {data.featuresLocked ? (
                  <p className="text-destructive">
                    Funciones bloqueadas hasta que actives un plan de pago.
                  </p>
                ) : (
                  <p className="text-muted-foreground">
                    Periodo: {data.usage.periodKey}
                    {data.currentPeriodEnd
                      ? ` · renueva ~${new Date(data.currentPeriodEnd).toLocaleDateString("es-CO")}`
                      : ""}
                  </p>
                )}
                {data.desiredPlanCode && data.status === "trialing" ? (
                  <p className="text-sm">
                    Plan elegido al registrarte: <strong>{data.desiredPlanCode}</strong> (pendiente
                    de pago)
                  </p>
                ) : null}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/80 shadow-brand-sm">
              <CardHeader>
                <CardTitle className="font-heading flex items-center gap-2 text-xl">
                  <CreditCard className="size-5" aria-hidden />
                  Mejorar plan
                </CardTitle>
                <CardDescription>Pro $39 USD · Business $99 USD (aprox. local al pagar)</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  disabled={checkoutMutation.isPending || data.planCode === "pro"}
                  onClick={() => checkoutMutation.mutate("pro")}
                >
                  Activar Pro
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={checkoutMutation.isPending || data.planCode === "business"}
                  onClick={() => checkoutMutation.mutate("business")}
                >
                  Activar Business
                </Button>
                {checkoutMutation.isError && (
                  <p className="w-full text-sm text-destructive">
                    {checkoutMutation.error instanceof ApiClientError
                      ? checkoutMutation.error.message
                      : "No se pudo iniciar el checkout"}
                  </p>
                )}
                {checkoutMutation.isSuccess && checkoutMutation.data.activatedWithoutPayment && (
                  <p className="w-full text-sm text-primary">
                    Plan activado en modo desarrollo (sin cobro MP).
                  </p>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 bg-card/80 shadow-brand-sm">
            <CardHeader>
              <CardTitle className="font-heading text-xl">Uso del periodo</CardTitle>
              <CardDescription>Contadores del mes {data.usage.periodKey} (UTC)</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <UsageBar label="Miembros" used={data.usage.members} max={data.limits.maxMembers} />
              <UsageBar label="Productos" used={data.usage.products} max={data.limits.maxProducts} />
              <UsageBar label="Variantes" used={data.usage.variants} max={data.limits.maxVariants} />
              <UsageBar
                label="Knowledge"
                used={data.usage.knowledgeDocs}
                max={data.limits.maxKnowledgeDocs}
              />
              <UsageBar
                label="WhatsApp inbound"
                used={data.usage.waInbound}
                max={data.limits.maxWaMessagesMonth}
              />
              <UsageBar
                label="Respuestas IA"
                used={data.usage.aiReplies}
                max={data.limits.maxAiRepliesMonth}
              />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
      <BillingPageInner />
    </Suspense>
  );
}
