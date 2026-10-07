"use client";

import type { WhatsAppNumberRequest, WhatsAppNumberRequestKind } from "@commerce-ai/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Clock, Send, Smartphone, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";

const E164 = /^\+[1-9]\d{7,14}$/;

const OPTIONS: {
  kind: WhatsAppNumberRequestKind;
  title: string;
  description: string;
  icon: typeof Building2;
}[] = [
  {
    kind: "platform_number",
    title: "Número empresarial",
    description: "Te asignamos un número de WhatsApp Business nuevo, exclusivo para tu tienda.",
    icon: Building2,
  },
  {
    kind: "own_number",
    title: "Conectar mi número",
    description: "El asistente responde desde el número que ya usas, conectado por Meta.",
    icon: Smartphone,
  },
];

const KIND_LABELS: Record<WhatsAppNumberRequestKind, string> = {
  platform_number: "Número empresarial",
  own_number: "Conectar mi número",
};

const dateFormatter = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  return digits ? `+${digits}` : "";
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

/** Pedido de número propio (planes de pago): elegir opción o ver la solicitud pendiente. */
export function NumberRequestPanel({
  request,
  isOwner,
  companyId,
}: {
  request: WhatsAppNumberRequest | null;
  isOwner: boolean;
  companyId: string | null | undefined;
}) {
  const queryClient = useQueryClient();
  const [kind, setKind] = useState<WhatsAppNumberRequestKind>("platform_number");
  const [phone, setPhone] = useState("");

  const onSaved = (data: WhatsAppNumberRequest | null) => {
    queryClient.setQueryData(["whatsapp-number-request", companyId], data);
  };

  const submitMutation = useMutation({
    mutationFn: () =>
      apiFetch<WhatsAppNumberRequest>("/whatsapp/number-request", {
        method: "POST",
        body: JSON.stringify(
          kind === "own_number" ? { kind, phoneNumber: toE164(phone) } : { kind },
        ),
      }),
    onSuccess: onSaved,
  });

  const cancelMutation = useMutation({
    mutationFn: () => apiFetch<null>("/whatsapp/number-request", { method: "DELETE" }),
    onSuccess: () => onSaved(null),
  });

  if (request) {
    return (
      <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Clock className="size-4" aria-hidden />
          </span>
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <h3 className="text-sm font-medium">Solicitud en revisión</h3>
            <p className="text-sm text-pretty text-muted-foreground">
              {KIND_LABELS[request.kind]}
              {request.phoneNumber ? (
                <>
                  {" · "}
                  <span className="font-data text-foreground">{request.phoneNumber}</span>
                </>
              ) : null}
              {" · "}
              {dateFormatter.format(new Date(request.createdAt))}
            </p>
            <p className="text-sm text-pretty text-muted-foreground">
              {request.kind === "own_number"
                ? "Te contactaremos para verificar tu número con Meta. Cuando quede conectado, el asistente empezará a responder desde él."
                : "Estamos preparando tu número. Cuando esté listo, aparecerá aquí con tu enlace para clientes."}
            </p>
          </div>
        </div>
        {cancelMutation.isError ? (
          <p className="text-sm text-destructive">
            {errorMessage(cancelMutation.error, "No se pudo cancelar la solicitud")}
          </p>
        ) : null}
        {isOwner ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="w-fit"
            disabled={cancelMutation.isPending}
            onClick={() => cancelMutation.mutate()}
          >
            <X className="size-4" aria-hidden />
            {cancelMutation.isPending ? "Cancelando…" : "Cancelar solicitud"}
          </Button>
        ) : null}
      </div>
    );
  }

  if (!isOwner) {
    return (
      <p className="text-sm text-muted-foreground">
        Solo el dueño de la tienda puede solicitar el número de WhatsApp.
      </p>
    );
  }

  const phoneValid = E164.test(toE164(phone));
  const canSubmit = kind === "platform_number" || phoneValid;

  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="Tipo de número" className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map((option) => {
          const selected = option.kind === kind;
          const Icon = option.icon;
          return (
            <button
              key={option.kind}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setKind(option.kind)}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-4 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
                selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
              )}
            >
              <Icon
                className={cn("size-4", selected ? "text-primary" : "text-muted-foreground")}
                aria-hidden
              />
              <span className="text-sm font-medium">{option.title}</span>
              <span className="text-sm text-pretty text-muted-foreground">
                {option.description}
              </span>
            </button>
          );
        })}
      </div>

      {kind === "own_number" ? (
        <div className="flex max-w-sm flex-col gap-1.5">
          <Label htmlFor="wa-own-number">Número que quieres conectar</Label>
          <Input
            id="wa-own-number"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+573001112233"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={phone.length > 0 && !phoneValid ? true : undefined}
          />
          <p className="text-xs text-pretty text-muted-foreground">
            Con código de país. El número no puede seguir activo en la app de WhatsApp: al
            conectarlo, lo usa el asistente. Te contactaremos para verificarlo con Meta.
          </p>
        </div>
      ) : null}

      {submitMutation.isError ? (
        <p className="text-sm text-destructive">
          {errorMessage(submitMutation.error, "No se pudo enviar la solicitud")}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        className="w-fit"
        disabled={!canSubmit || submitMutation.isPending}
        onClick={() => submitMutation.mutate()}
      >
        <Send className="size-4" aria-hidden />
        {submitMutation.isPending ? "Enviando…" : "Enviar solicitud"}
      </Button>
    </div>
  );
}
