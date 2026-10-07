"use client";

import {
  canManageWhatsapp,
  type CompanyDetails,
  type SubscriptionDetails,
  type WhatsAppConnection,
  type WhatsAppNumberRequest,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  Copy,
  ExternalLink,
  FlaskConical,
  MessageCircle,
  MessageSquareText,
  Pause,
  Pencil,
  Phone,
  Play,
  Power,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { NumberRequestPanel } from "@/components/whatsapp-number-request-panel";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

const E164 = /^\+[1-9]\d{7,14}$/;

/** "+57 300 111 2233" → "+573001112233". */
function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

function StorePhoneField({
  id,
  value,
  onChange,
  touched,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  touched: boolean;
}) {
  const invalid = touched && !E164.test(toE164(value));
  return (
    <div className="flex max-w-sm flex-col gap-1.5">
      <Label htmlFor={id}>WhatsApp de tu tienda</Label>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        placeholder="+573001112233"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid ? true : undefined}
      />
      <p className="text-xs text-pretty text-muted-foreground">
        Con código de país. Es tu número de contacto y no puede usarlo otra tienda.
      </p>
    </div>
  );
}

export function WhatsAppConnectionSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canManage = Boolean(user && canManageWhatsapp(user.role));
  const [copied, setCopied] = useState(false);
  const [phoneDraft, setPhoneDraft] = useState<string | null>(null);
  const [editingPhone, setEditingPhone] = useState(false);

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

  const { data: numberRequest } = useQuery({
    queryKey: ["whatsapp-number-request", user?.companyId],
    queryFn: () => apiFetch<WhatsAppNumberRequest | null>("/whatsapp/number-request"),
    enabled: Boolean(user?.companyId && canManage && isPaid),
  });

  const onConnectionSaved = (data: WhatsAppConnection) => {
    queryClient.setQueryData(["whatsapp-connection", user?.companyId], data);
    setPhoneDraft(null);
    setEditingPhone(false);
  };

  const activateMutation = useMutation({
    mutationFn: (phoneNumber: string) =>
      apiFetch<WhatsAppConnection>("/whatsapp/connection/shared", {
        method: "POST",
        body: JSON.stringify({ phoneNumber }),
      }),
    onSuccess: (data) => {
      onConnectionSaved(data);
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-connection"] });
      void queryClient.invalidateQueries({ queryKey: ["company"] });
    },
  });

  const phoneMutation = useMutation({
    mutationFn: (phoneNumber: string) =>
      apiFetch<WhatsAppConnection>("/whatsapp/connection/phone", {
        method: "PUT",
        body: JSON.stringify({ phoneNumber }),
      }),
    onSuccess: onConnectionSaved,
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

  const ownNumberSection =
    !connection || connection.mode === "shared" ? (
      <FormSection
        title="¿Quieres número propio?"
        description="Un número de WhatsApp solo para tu tienda, sin código en el mensaje."
      >
        {isPaid ? (
          <NumberRequestPanel
            request={numberRequest ?? null}
            isOwner={isOwner}
            companyId={user.companyId}
          />
        ) : (
          <p className="text-sm text-pretty text-muted-foreground">
            Está disponible en los planes de pago.{" "}
            <Link href="/billing" className="text-foreground underline-offset-4 hover:underline">
              Ver planes
            </Link>
          </p>
        )}
      </FormSection>
    ) : null;

  if (!connection) {
    // Solo se precarga el teléfono de la empresa si ya trae código de país.
    const savedPhone = company.phone?.trim().startsWith("+") ? company.phone.trim() : "";
    const phone = phoneDraft ?? savedPhone;
    const phoneValid = E164.test(toE164(phone));
    return (
      <div className="flex max-w-4xl flex-col gap-3">
        <div className="flex flex-col gap-4 rounded-lg border border-border p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <MessageCircle className="size-4" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <h2 className="text-sm font-medium">Activa tu canal de WhatsApp</h2>
              <p className="max-w-xl text-sm text-pretty text-muted-foreground">
                Tu tienda ya tiene todo lo necesario. Escribe el WhatsApp de tu tienda y al
                activarlo recibes un enlace para tus clientes; el asistente empieza a atenderlos al
                instante.
              </p>
              {isOwner ? null : (
                <p className="text-sm text-muted-foreground">
                  Solo el dueño de la tienda puede activar el canal.
                </p>
              )}
            </div>
            <Button asChild variant="ghost" size="sm" className="w-fit shrink-0">
              <Link href="/assistant/playground">
                <FlaskConical className="size-4" aria-hidden />
                Prueba tu asistente
              </Link>
            </Button>
          </div>
          {isOwner ? (
            <div className="flex flex-col gap-3 sm:pl-13">
              <StorePhoneField
                id="wa-activate-phone"
                value={phone}
                onChange={setPhoneDraft}
                touched={phoneDraft !== null}
              />
              {activateMutation.isError ? (
                <p className="text-sm text-destructive">
                  {errorMessage(activateMutation.error, "No se pudo activar el canal")}
                </p>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="w-fit"
                disabled={activateMutation.isPending || !phoneValid}
                onClick={() => activateMutation.mutate(toE164(phone))}
              >
                <Power className="size-4" aria-hidden />
                {activateMutation.isPending ? "Activando…" : "Activar canal"}
              </Button>
            </div>
          ) : null}
        </div>
        <KnowledgeHint company={company} />
        {ownNumberSection}
      </div>
    );
  }

  const isShared = connection.mode === "shared";
  const headline = isShared ? `#${connection.storeCode ?? ""}` : connection.twilioWhatsAppNumber;
  const nextActive = !connection.isActive;
  const editPhone = phoneDraft ?? connection.displayPhoneNumber ?? "";

  const copyLink = async () => {
    if (!connection.waMeLink) {
      return;
    }
    await navigator.clipboard.writeText(connection.waMeLink);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const cancelEdit = () => {
    setEditingPhone(false);
    setPhoneDraft(null);
    phoneMutation.reset();
  };

  const requirements = setupItems.filter((item) => !item.optional);

  return (
    <div className="flex max-w-4xl flex-col">
      <div className="mb-8 flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-xs text-muted-foreground">
            {isShared ? "Código de tu tienda" : "Número de tu asistente"}
          </span>
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-data text-2xl tracking-tight">{headline}</span>
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
          description={
            isShared
              ? "Compártelo en tu Instagram, tu web o tus anuncios. Abre WhatsApp con el código de tu tienda ya escrito, y así sabemos que te escriben a ti. Tus clientes deben entrar siempre por este enlace."
              : "Compártelo en tu Instagram, tu web o tus anuncios para que te escriban directo al asistente."
          }
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
        title="WhatsApp de tu tienda"
        description="Tu número de contacto. Solo puede usarlo una tienda y no cambia tu enlace para clientes."
      >
        {editingPhone ? (
          <div className="flex flex-col gap-3">
            <StorePhoneField
              id="wa-edit-phone"
              value={editPhone}
              onChange={setPhoneDraft}
              touched={phoneDraft !== null}
            />
            {phoneMutation.isError ? (
              <p className="text-sm text-destructive">
                {errorMessage(phoneMutation.error, "No se pudo guardar el número")}
              </p>
            ) : null}
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                disabled={phoneMutation.isPending || !E164.test(toE164(editPhone))}
                onClick={() => phoneMutation.mutate(toE164(editPhone))}
              >
                {phoneMutation.isPending ? "Guardando…" : "Guardar"}
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={cancelEdit}>
                Cancelar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
            <dl className="grid flex-1 gap-3 text-sm sm:grid-cols-2">
              <div className="flex items-center gap-2">
                <Phone className="size-4 text-muted-foreground" aria-hidden />
                <dt className="text-muted-foreground">Tienda</dt>
                <dd className="font-data">{connection.displayPhoneNumber ?? "Sin registrar"}</dd>
              </div>
              {isShared ? null : (
                <div className="flex items-center gap-2">
                  <RadioTower className="size-4 text-muted-foreground" aria-hidden />
                  <dt className="text-muted-foreground">Asistente</dt>
                  <dd className="font-data">{connection.twilioWhatsAppNumber}</dd>
                </div>
              )}
            </dl>
            {isOwner ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-fit"
                onClick={() => setEditingPhone(true)}
              >
                <Pencil className="size-4" aria-hidden />
                Cambiar número
              </Button>
            ) : null}
          </div>
        )}
      </FormSection>

      {ownNumberSection}

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
