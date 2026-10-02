"use client";

import {
  canEditCompany,
  type CompanyDetails,
  type CompanyPaymentsSettings,
} from "@commerce-ai/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  CreditCard,
  Link2Off,
  Unplug,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { FormSection } from "@/components/form-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SkeletonText } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useConfirm } from "@/providers/confirm-provider";
import { useSession } from "@/providers/session-provider";

const manualSchema = z.object({
  accessToken: z.string().min(10, "Pega el Access Token de Mercado Pago"),
  publicKey: z.string().optional(),
});

type ManualValues = z.infer<typeof manualSchema>;

const DEV_TOOLS_ENABLED = process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS === "true";
const IS_DEVELOPMENT = process.env.NODE_ENV !== "production";

export function MercadoPagoConnectionSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const confirm = useConfirm();
  const canEdit = Boolean(user && canEditCompany(user.role));
  const [showManual, setShowManual] = useState(false);
  const [banner, setBanner] = useState<"connected" | "error" | null>(null);

  const { data: company, isLoading } = useQuery({
    queryKey: ["company", user?.companyId],
    queryFn: () => apiFetch<CompanyDetails>("/company"),
    enabled: Boolean(user?.companyId),
  });

  useEffect(() => {
    const mp = searchParams.get("mp");
    if (mp === "connected") {
      setBanner("connected");
      void queryClient.invalidateQueries({ queryKey: ["company"] });
    } else if (mp === "error") {
      setBanner("error");
    }
  }, [searchParams, queryClient]);

  const payments = company?.payments;
  const connected = Boolean(payments?.isConfigured);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ManualValues>({
    resolver: zodResolver(manualSchema),
    defaultValues: { accessToken: "", publicKey: "" },
  });

  const oauthMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ authorizationUrl: string }>("/payments/mercadopago/oauth/start", {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: (data) => {
      window.location.href = data.authorizationUrl;
    },
  });

  const manualMutation = useMutation({
    mutationFn: (values: ManualValues) =>
      apiFetch<CompanyPaymentsSettings>("/payments/mercadopago/connection", {
        method: "PUT",
        body: JSON.stringify({
          accessToken: values.accessToken.trim(),
          publicKey: values.publicKey?.trim() || undefined,
        }),
      }),
    onSuccess: () => {
      reset();
      setShowManual(false);
      setBanner("connected");
      void queryClient.invalidateQueries({ queryKey: ["company"] });
    },
  });

  const disconnectMutation = useMutation({
    mutationFn: () => apiFetch<null>("/payments/mercadopago/connection", { method: "DELETE" }),
    onSuccess: () => {
      setBanner(null);
      void queryClient.invalidateQueries({ queryKey: ["company"] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
    },
  });

  if (!user || isLoading) {
    return <SkeletonText lines={4} className="max-w-md" />;
  }

  const connection = connected ? payments?.connection : null;
  const holderName = connection
    ? [connection.mpFirstName, connection.mpLastName].filter(Boolean).join(" ")
    : "";

  return (
    <div id="pagos-mercadopago" className="flex flex-col">
      {banner === "connected" ? (
        <p className="slide-up-in mb-6 flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-sm text-accent-foreground">
          <CheckCircle2 className="size-4 shrink-0" aria-hidden />
          Mercado Pago conectado correctamente.
        </p>
      ) : null}
      {banner === "error" ? (
        <p className="slide-up-in mb-6 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          No se pudo completar la autorización con Mercado Pago. Intenta de nuevo.
        </p>
      ) : null}

      <FormSection
        title="Mercado Pago"
        description="Tus clientes pagan con Mercado Pago y el dinero llega directo a tu cuenta. Es necesario para activar WhatsApp."
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground">
            <CreditCard className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="text-sm font-medium">Cuenta de cobro</span>
            <span className="text-xs text-muted-foreground">
              {connection ? (connection.mpEmail ?? "Cuenta vinculada") : "Sin cuenta vinculada"}
            </span>
          </div>
          <StatusPill tone={connected ? "positive" : "attention"} className="ml-auto">
            {connected ? "Conectado" : "No conectado"}
          </StatusPill>
        </div>

        {connection && !connection.liveMode ? (
          <p className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            Esta cuenta está en modo prueba: los pagos de tus clientes no serán reales.
          </p>
        ) : null}

        {connection && (holderName || connection.mpNickname || connection.mpEmail) ? (
          <dl className="divide-y divide-border border-y border-border text-sm">
            {holderName ? (
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Titular</dt>
                <dd className="truncate">{holderName}</dd>
              </div>
            ) : null}
            {connection.mpNickname ? (
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Usuario</dt>
                <dd className="truncate font-data text-[13px]">{connection.mpNickname}</dd>
              </div>
            ) : null}
            {connection.mpEmail ? (
              <div className="flex justify-between gap-4 py-2">
                <dt className="text-muted-foreground">Email</dt>
                <dd className="truncate">{connection.mpEmail}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        {!canEdit ? (
          <p className="text-sm text-muted-foreground">
            Solo el dueño puede conectar o desconectar Mercado Pago.
          </p>
        ) : connected ? (
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              disabled={disconnectMutation.isPending}
              onClick={async () => {
                const confirmed = await confirm({
                  title: "¿Desconectar Mercado Pago?",
                  description:
                    "Tus clientes no podrán pagar y el asistente de WhatsApp quedará en pausa hasta que vuelvas a conectarlo.",
                  confirmLabel: "Desconectar",
                  destructive: true,
                });
                if (confirmed) {
                  disconnectMutation.mutate();
                }
              }}
            >
              <Link2Off className="size-4" aria-hidden />
              {disconnectMutation.isPending ? "Desconectando…" : "Desconectar"}
            </Button>
            {disconnectMutation.isError && (
              <p className="text-sm text-destructive">
                {disconnectMutation.error instanceof ApiClientError
                  ? disconnectMutation.error.message
                  : "No se pudo desconectar"}
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {payments?.oauthAvailable ? (
              <Button
                type="button"
                className="w-fit"
                disabled={oauthMutation.isPending}
                onClick={() => oauthMutation.mutate()}
              >
                <Unplug className="size-4" aria-hidden />
                {oauthMutation.isPending ? "Redirigiendo…" : "Conectar Mercado Pago"}
              </Button>
            ) : IS_DEVELOPMENT ? (
              <p className="flex max-w-xl items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-foreground">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
                <span>
                  El botón para conectar aparece cuando el backend tiene la app de Mercado Pago:
                  define <code className="font-data text-[13px]">MP_CLIENT_ID</code> y{" "}
                  <code className="font-data text-[13px]">MP_CLIENT_SECRET</code> en{" "}
                  <code className="font-data text-[13px]">apps/api-py/.env</code>, más{" "}
                  <code className="font-data text-[13px]">API_PUBLIC_URL</code> o{" "}
                  <code className="font-data text-[13px]">MP_REDIRECT_URI</code>, y reinicia el
                  backend. Solo se ve en desarrollo.
                </span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Los pagos no están disponibles por ahora. Escríbenos a soporte para activarlos en tu
                tienda.
              </p>
            )}
            {oauthMutation.isError && (
              <p className="text-sm text-destructive">
                {oauthMutation.error instanceof ApiClientError
                  ? oauthMutation.error.message
                  : "No se pudo iniciar OAuth"}
              </p>
            )}
          </div>
        )}
      </FormSection>

      {DEV_TOOLS_ENABLED && canEdit && !connected ? (
        <FormSection
          title="Credenciales manuales"
          description="Solo desarrollo. Conecta con un Access Token de prueba."
        >
          {showManual ? (
            <form
              className="flex flex-col gap-4"
              onSubmit={handleSubmit((values) => manualMutation.mutate(values))}
            >
              <div className="flex flex-col gap-2">
                <Label htmlFor="mp-access-token">Access Token</Label>
                <Input
                  id="mp-access-token"
                  type="password"
                  autoComplete="off"
                  placeholder="TEST-… o APP_USR-…"
                  {...register("accessToken")}
                />
                {errors.accessToken && (
                  <p className="text-sm text-destructive">{errors.accessToken.message}</p>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="mp-public-key">Public Key (opcional)</Label>
                <Input
                  id="mp-public-key"
                  autoComplete="off"
                  placeholder="TEST-… o APP_USR-…"
                  {...register("publicKey")}
                />
              </div>
              <div className="flex gap-2">
                <Button type="submit" disabled={manualMutation.isPending}>
                  {manualMutation.isPending ? "Guardando…" : "Guardar credenciales"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowManual(false)}>
                  Cancelar
                </Button>
              </div>
              {manualMutation.isError && (
                <p className="text-sm text-destructive">
                  {manualMutation.error instanceof ApiClientError
                    ? manualMutation.error.message
                    : "No se pudo guardar"}
                </p>
              )}
            </form>
          ) : (
            <Button
              type="button"
              variant="outline"
              className="w-fit"
              onClick={() => setShowManual(true)}
            >
              Usar Access Token
            </Button>
          )}
        </FormSection>
      ) : null}
    </div>
  );
}
