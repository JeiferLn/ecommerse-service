"use client";

import {
  canManageWhatsapp,
  type CompanyDetails,
  type SubscriptionDetails,
  type WhatsAppConnectStatus,
  type WhatsAppConnection,
  type WhatsAppNumberRequest,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  ExternalLink,
  FlaskConical,
  Link2,
  MessageCircle,
  MessageSquareText,
  Pause,
  Play,
  RadioTower,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { FormSection } from "@/components/form-section";
import {
  getSetupItems,
  KnowledgeHint,
  missingRequiredItems,
  SetupRequirements,
} from "@/components/setup-requirements";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { NumberRequestPanel } from "@/components/whatsapp-number-request-panel";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

const ONBOARDING_LABELS: Record<string, string> = {
  pending: "Pendiente",
  awaiting_meta: "Esperando Meta",
  registering: "Registrando sender",
  online: "En línea",
  failed: "Falló",
};

export function WhatsAppConnectionSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canManage = Boolean(user && canManageWhatsapp(user.role));
  const [copied, setCopied] = useState(false);

  const {
    data: connection,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["whatsapp-connection", user?.companyId],
    queryFn: () => apiFetch<WhatsAppConnection | null>("/whatsapp/connection"),
    enabled: Boolean(user?.companyId && canManage),
  });

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ["company", user?.companyId],
    queryFn: () => apiFetch<CompanyDetails>("/company"),
    enabled: Boolean(user?.companyId && canManage),
  });

  const { data: subscription } = useQuery({
    queryKey: ["billing-subscription", user?.companyId],
    queryFn: () => apiFetch<SubscriptionDetails>("/billing/subscription"),
    enabled: Boolean(user?.companyId && canManage),
  });
  const isPaid = Boolean(subscription && subscription.planCode !== "free");

  const { data: connectStatus } = useQuery({
    queryKey: ["whatsapp-connect-status", user?.companyId],
    queryFn: () => apiFetch<WhatsAppConnectStatus>("/whatsapp/connect/status"),
    enabled: Boolean(user?.companyId && canManage),
  });

  const { data: numberRequest } = useQuery({
    queryKey: ["whatsapp-number-request", user?.companyId],
    queryFn: () => apiFetch<WhatsAppNumberRequest | null>("/whatsapp/number-request"),
    enabled: Boolean(user?.companyId && canManage && isPaid),
  });

  const connectStart = useMutation({
    mutationFn: () =>
      apiFetch<WhatsAppConnectStatus>("/whatsapp/connect/start", { method: "POST" }),
    onSuccess: (data) => {
      queryClient.setQueryData(["whatsapp-connect-status", user?.companyId], data);
      if (data.connection) {
        queryClient.setQueryData(["whatsapp-connection", user?.companyId], data.connection);
      }
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (isActive: boolean) =>
      apiFetch<WhatsAppConnection>("/whatsapp/connection", {
        method: "PATCH",
        body: JSON.stringify({ isActive }),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["whatsapp-connection", user?.companyId], data);
      void queryClient.invalidateQueries({ queryKey: ["company"] });
    },
  });

  if (!user) {
    return <Skeleton className="h-40 w-full max-w-4xl rounded-lg" />;
  }

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Solo el dueño o un administrador de la tienda pueden ver el canal de WhatsApp.
      </p>
    );
  }

  if (isLoading || companyLoading) {
    return <Skeleton className="h-40 w-full max-w-4xl rounded-lg" />;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof ApiClientError ? error.message : "No se pudo cargar el canal"}
      </p>
    );
  }

  if (!company) {
    return <Skeleton className="h-40 w-full max-w-4xl rounded-lg" />;
  }

  const setupItems = getSetupItems(company, user.role, { requirePayments: true });
  if (missingRequiredItems(setupItems).length > 0) {
    return (
      <SetupRequirements company={company} requirePayments purpose="activar tu canal de WhatsApp" />
    );
  }

  const isOwner = user.role === "owner";
  const online =
    connection?.onboardingStatus === "online" && Boolean(connection.twilioWhatsAppNumber);
  const techReady = Boolean(connectStatus?.techProviderReady);

  if (!online) {
    const onboarding = connection && connection.onboardingStatus !== "online" ? connection : null;
    return (
      <div className="flex max-w-4xl flex-col gap-3">
        <div className="flex flex-col gap-4 rounded-lg border border-border p-5 sm:flex-row sm:items-start">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MessageCircle className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h2 className="text-sm font-medium">WhatsApp de tu tienda</h2>
            <p className="max-w-xl text-sm text-pretty text-muted-foreground">
              Prueba el asistente en la app. Cuando quieras atender en WhatsApp, conecta tu propio
              número o, en un plan de pago, solicita uno de la plataforma.
            </p>
            {onboarding ? (
              <p className="text-sm text-muted-foreground">
                Estado: {ONBOARDING_LABELS[onboarding.onboardingStatus] ?? onboarding.onboardingStatus}
                {onboarding.onboardingError ? ` · ${onboarding.onboardingError}` : null}
              </p>
            ) : null}
            {connectStart.isError ? (
              <p className="text-sm text-destructive">
                {errorMessage(connectStart.error, "No se pudo iniciar la conexión")}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <Button asChild variant="ghost" size="sm" className="w-fit">
              <Link href="/assistant/playground">
                <FlaskConical className="size-4" aria-hidden />
                Prueba tu asistente
              </Link>
            </Button>
            {isOwner ? (
              <Button
                type="button"
                size="sm"
                className="w-fit"
                disabled={connectStart.isPending}
                onClick={() => connectStart.mutate()}
              >
                <Link2 className="size-4" aria-hidden />
                {connectStart.isPending ? "Iniciando…" : "Conectar WhatsApp"}
              </Button>
            ) : null}
          </div>
        </div>

        {!techReady ? (
          <p className="text-sm text-pretty text-muted-foreground">
            La conexión con Meta (Embedded Signup) aún no está habilitada en esta instalación. Puedes
            seguir probando el asistente en la app
            {isPaid ? " o solicitar un número de la plataforma abajo" : ""}.
          </p>
        ) : null}

        <KnowledgeHint company={company} />

        {isPaid ? (
          <FormSection
            title="Número de la plataforma"
            description="Un número de WhatsApp Business exclusivo para tu tienda. Disponible en planes de pago."
          >
            <NumberRequestPanel
              request={numberRequest ?? null}
              isOwner={isOwner}
              companyId={user.companyId}
            />
          </FormSection>
        ) : (
          <FormSection
            title="¿Quieres un número nuestro?"
            description="Si no tienes número propio o no quieres gestionar Meta, mejora tu plan y te asignamos uno."
          >
            <p className="text-sm text-pretty text-muted-foreground">
              Disponible en los planes de pago.{" "}
              <Link href="/billing" className="text-foreground underline-offset-4 hover:underline">
                Ver planes
              </Link>
            </p>
          </FormSection>
        )}
      </div>
    );
  }

  const nextActive = !connection.isActive;
  const requirements = setupItems.filter((item) => !item.optional);

  const copyLink = async () => {
    if (!connection.waMeLink) {
      return;
    }
    await navigator.clipboard.writeText(connection.waMeLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex max-w-4xl flex-col">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">Número de tu asistente</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-data text-2xl tracking-tight">
              {connection.twilioWhatsAppNumber}
            </span>
            <StatusPill tone={connection.isActive ? "positive" : "attention"}>
              {connection.isActive ? "Activo" : "En pausa"}
            </StatusPill>
          </div>
          <p key={String(connection.isActive)} className="fade-swap text-sm text-muted-foreground">
            {connection.isActive
              ? "El asistente responde a tus clientes las 24 horas."
              : "En pausa, el asistente no responde y los mensajes nuevos no llegan a Conversaciones."}
          </p>
        </div>
        <Button
          type="button"
          variant={connection.isActive ? "outline" : "default"}
          disabled={toggleMutation.isPending}
          onClick={() => toggleMutation.mutate(nextActive)}
          className="w-fit shrink-0"
        >
          {connection.isActive ? (
            <Pause className="size-4" aria-hidden />
          ) : (
            <Play className="size-4" aria-hidden />
          )}
          {toggleMutation.isPending
            ? "Guardando…"
            : connection.isActive
              ? "Pausar asistente"
              : "Activar asistente"}
        </Button>
      </div>
      {toggleMutation.isError ? (
        <p className="-mt-4 mb-6 text-sm text-destructive">
          {toggleMutation.error instanceof ApiClientError
            ? toggleMutation.error.message
            : "No se pudo cambiar el estado"}
        </p>
      ) : null}

      {connection.waMeLink ? (
        <FormSection
          title="Enlace para clientes"
          description="Compártelo en tu Instagram, tu web o tus anuncios para que te escriban directo al asistente."
        >
          <div className="flex min-w-0 items-center gap-2 rounded-md border border-border py-1 pr-1 pl-3">
            <a
              href={connection.waMeLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-w-0 flex-1 items-center gap-1.5 truncate font-data text-[13px] underline-offset-4 hover:underline"
            >
              <span className="truncate">{connection.waMeLink}</span>
              <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
            </a>
            <Button type="button" variant="ghost" size="sm" onClick={() => void copyLink()}>
              {copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Copy className="size-4" aria-hidden />
              )}
              <span key={String(copied)} className="fade-swap">
                {copied ? "Copiado" : "Copiar"}
              </span>
            </Button>
          </div>
        </FormSection>
      ) : null}

      <FormSection title="Canal">
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div className="flex items-center gap-2">
            <RadioTower className="size-4 text-muted-foreground" aria-hidden />
            <dt className="text-muted-foreground">Tipo</dt>
            <dd>
              {connection.connectionKind === "own_number"
                ? "Número propio"
                : "Número de la plataforma"}
            </dd>
          </div>
        </dl>
      </FormSection>

      <FormSection
        title="Requisitos"
        description="Lo que el asistente necesita para atender. Si quitas alguno, el canal se pausa."
      >
        <ul className="divide-y divide-border border-y border-border">
          {requirements.map((item) => (
            <li key={item.href} className="flex items-center gap-3 py-2.5 text-sm">
              <Check className="size-4 text-primary" aria-hidden />
              <span className="flex-1">{item.doneLabel}</span>
              <Link
                href={item.href}
                className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Ver
              </Link>
            </li>
          ))}
        </ul>
        <KnowledgeHint company={company} className="mt-3" />
      </FormSection>

      <FormSection title="Atajos">
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/whatsapp/inbox">
              <MessageSquareText className="size-4" aria-hidden />
              Ver conversaciones
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/assistant/playground">
              <FlaskConical className="size-4" aria-hidden />
              Prueba tu asistente
            </Link>
          </Button>
        </div>
      </FormSection>
    </div>
  );
}
