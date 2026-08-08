"use client";

import {
  canEditCompany,
  type CompanyDetails,
  type CompanyPaymentsSettings,
} from "@commerce-ai/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CreditCard, Link2Off, Unplug } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

const manualSchema = z.object({
  accessToken: z.string().min(10, "Pega el Access Token de Mercado Pago"),
  publicKey: z.string().optional(),
});

type ManualValues = z.infer<typeof manualSchema>;

export function MercadoPagoConnectionSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
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
    mutationFn: () =>
      apiFetch<null>("/payments/mercadopago/connection", { method: "DELETE" }),
    onSuccess: () => {
      setBanner(null);
      void queryClient.invalidateQueries({ queryKey: ["company"] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
    },
  });

  if (!canEdit) {
    return (
      <Card id="pagos-mercadopago">
        <CardHeader>
          <CardTitle className="font-heading flex items-center gap-2 text-xl font-bold">
            <CreditCard className="size-5" aria-hidden />
            Pagos · Mercado Pago
          </CardTitle>
          <CardDescription>
            Solo el dueño puede conectar o desconectar Mercado Pago. El dinero de los pedidos llega
            a la cuenta del comercio.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            {connected
              ? "Mercado Pago está conectado."
              : "Mercado Pago aún no está conectado."}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <p id="pagos-mercadopago" className="text-sm text-muted-foreground">
        Cargando pagos…
      </p>
    );
  }

  return (
    <Card id="pagos-mercadopago">
      <CardHeader>
        <CardTitle className="font-heading flex items-center gap-2 text-xl font-bold">
          <CreditCard className="size-5" aria-hidden />
          Pagos · Mercado Pago
        </CardTitle>
        <CardDescription>
          Conecta la cuenta Mercado Pago de tu empresa. Sin esto no puedes configurar WhatsApp y
          los clientes no podrán pagar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {banner === "connected" && (
          <p className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-900 dark:text-emerald-100">
            Mercado Pago conectado correctamente.
          </p>
        )}
        {banner === "error" && (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            No se pudo completar la autorización con Mercado Pago. Intenta de nuevo o pega las
            credenciales.
          </p>
        )}

        {connected && payments?.connection ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              Estado: <span className="font-medium text-foreground">Conectado</span>
              {" · "}
              vía {payments.connection.source === "oauth" ? "OAuth" : "credenciales"}
              {payments.connection.liveMode ? " · producción" : " · prueba"}
            </p>
            <dl className="grid gap-1 text-sm text-muted-foreground sm:grid-cols-[8rem_1fr]">
              {(payments.connection.mpFirstName || payments.connection.mpLastName) && (
                <>
                  <dt>Nombre</dt>
                  <dd className="text-foreground">
                    {[payments.connection.mpFirstName, payments.connection.mpLastName]
                      .filter(Boolean)
                      .join(" ")}
                  </dd>
                </>
              )}
              {payments.connection.mpNickname && (
                <>
                  <dt>Usuario MP</dt>
                  <dd className="text-foreground">{payments.connection.mpNickname}</dd>
                </>
              )}
              {payments.connection.mpEmail && (
                <>
                  <dt>Email</dt>
                  <dd className="text-foreground">{payments.connection.mpEmail}</dd>
                </>
              )}
              {payments.connection.mpSiteId && (
                <>
                  <dt>Sitio</dt>
                  <dd className="text-foreground">{payments.connection.mpSiteId}</dd>
                </>
              )}
              {payments.connection.mpUserId && (
                <>
                  <dt>ID</dt>
                  <dd className="font-mono text-xs text-foreground">
                    {payments.connection.mpUserId}
                  </dd>
                </>
              )}
            </dl>
            <Button
              type="button"
              variant="outline"
              disabled={disconnectMutation.isPending}
              onClick={() => {
                if (
                  window.confirm(
                    "¿Desconectar Mercado Pago? WhatsApp se desactivará hasta que vuelvas a conectar pagos.",
                  )
                ) {
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
          <div className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">Estado: no conectado</p>
            {payments?.oauthAvailable ? (
              <Button
                type="button"
                disabled={oauthMutation.isPending}
                onClick={() => oauthMutation.mutate()}
              >
                <Unplug className="size-4" aria-hidden />
                {oauthMutation.isPending
                  ? "Redirigiendo…"
                  : "Conectar Mercado Pago"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">
                OAuth de plataforma no está configurado (falta MP_CLIENT_ID en el servidor). Puedes
                pegar el Access Token de tu cuenta abajo.
              </p>
            )}
            {oauthMutation.isError && (
              <p className="text-sm text-destructive">
                {oauthMutation.error instanceof ApiClientError
                  ? oauthMutation.error.message
                  : "No se pudo iniciar OAuth"}
              </p>
            )}

            <Button
              type="button"
              variant="ghost"
              className="self-start"
              onClick={() => setShowManual((v) => !v)}
            >
              {showManual ? "Ocultar credenciales" : "Usar Access Token (sandbox / avanzado)"}
            </Button>

            {showManual && (
              <form
                className="flex flex-col gap-3 rounded-md border p-4"
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
                <Button type="submit" disabled={manualMutation.isPending}>
                  {manualMutation.isPending ? "Guardando…" : "Guardar credenciales"}
                </Button>
                {manualMutation.isError && (
                  <p className="text-sm text-destructive">
                    {manualMutation.error instanceof ApiClientError
                      ? manualMutation.error.message
                      : "No se pudo guardar"}
                  </p>
                )}
              </form>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
