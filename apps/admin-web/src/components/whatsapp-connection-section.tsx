"use client";

import {
  canManageWhatsapp,
  type CompanyDetails,
  type WhatsAppConnection,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Clock,
  Copy,
  ExternalLink,
  FlaskConical,
  MessageSquareText,
  Pause,
  Play,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { FormSection } from "@/components/form-section";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { WhatsAppCommerceRequiredGate } from "@/components/whatsapp-commerce-required-gate";
import { WhatsAppKnowledgeRequiredGate } from "@/components/whatsapp-knowledge-required-gate";
import { WhatsAppPaymentsRequiredGate } from "@/components/whatsapp-payments-required-gate";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

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

  if (!company?.commerce.isConfigured) {
    return <WhatsAppCommerceRequiredGate />;
  }

  if (!company.knowledge.isConfigured) {
    return <WhatsAppKnowledgeRequiredGate missingTypes={company.knowledge.missingTypes} />;
  }

  if (!company.payments.isConfigured) {
    return <WhatsAppPaymentsRequiredGate />;
  }

  if (!connection) {
    return (
      <div className="flex max-w-4xl flex-col gap-4 rounded-lg border border-border p-5 sm:flex-row sm:items-start">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <Clock className="size-4" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="text-sm font-medium">Estamos preparando tu número</h2>
          <p className="max-w-xl text-sm text-pretty text-muted-foreground">
            Tu tienda ya tiene todo lo necesario. Nuestro equipo está asignando el número de
            WhatsApp de tu asistente; te avisaremos cuando esté listo para recibir clientes.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="w-fit shrink-0">
          <Link href="/assistant/playground">
            <FlaskConical className="size-4" aria-hidden />
            Prueba tu asistente
          </Link>
        </Button>
      </div>
    );
  }

  const phone = connection.displayPhoneNumber || connection.twilioWhatsAppNumber;
  const nextActive = !connection.isActive;

  const copyLink = async () => {
    if (!connection.waMeLink) {
      return;
    }
    await navigator.clipboard.writeText(connection.waMeLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const requirements = [
    { label: "Envíos configurados", href: "/settings/shipping" },
    { label: "Documentos de conocimiento", href: "/knowledge" },
    { label: "Mercado Pago conectado", href: "/settings/payments" },
  ];

  return (
    <div className="flex max-w-4xl flex-col">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">Número de tu asistente</span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-data text-2xl tracking-tight">{phone}</span>
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
          description="Compártelo en tu Instagram, tu web o tus anuncios para que te escriban directo."
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

      <FormSection
        title="Requisitos"
        description="Lo que el asistente necesita para atender. Si quitas alguno, el canal se pausa."
      >
        <ul className="divide-y divide-border border-y border-border">
          {requirements.map((item) => (
            <li key={item.href} className="flex items-center gap-3 py-2.5 text-sm">
              <Check className="size-4 text-primary" aria-hidden />
              <span className="flex-1">{item.label}</span>
              <Link
                href={item.href}
                className="text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
              >
                Ver
              </Link>
            </li>
          ))}
        </ul>
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
