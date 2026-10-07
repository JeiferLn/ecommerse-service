"use client";

import type { WhatsAppNumberRequest } from "@commerce-ai/types";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Building2, Clock, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { apiFetch, ApiClientError } from "@/lib/api";

const dateFormatter = new Intl.DateTimeFormat("es-CO", { dateStyle: "medium" });

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof ApiClientError ? error.message : fallback;
}

/** Pedido de número de la plataforma (planes de pago). */
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

  const onSaved = (data: WhatsAppNumberRequest | null) => {
    queryClient.setQueryData(["whatsapp-number-request", companyId], data);
  };

  const submitMutation = useMutation({
    mutationFn: () =>
      apiFetch<WhatsAppNumberRequest>("/whatsapp/number-request", {
        method: "POST",
        body: JSON.stringify({ kind: "platform_number" }),
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
              Número empresarial · {dateFormatter.format(new Date(request.createdAt))}
            </p>
            <p className="text-sm text-pretty text-muted-foreground">
              Estamos preparando tu número. Cuando esté listo, aparecerá aquí con tu enlace para
              clientes.
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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 rounded-lg border border-border p-4">
        <Building2 className="size-4 text-primary" aria-hidden />
        <span className="text-sm font-medium">Número empresarial</span>
        <span className="text-sm text-pretty text-muted-foreground">
          Te asignamos un número de WhatsApp Business nuevo, exclusivo para tu tienda.
        </span>
      </div>

      {submitMutation.isError ? (
        <p className="text-sm text-destructive">
          {errorMessage(submitMutation.error, "No se pudo enviar la solicitud")}
        </p>
      ) : null}

      <Button
        type="button"
        size="sm"
        className="w-fit"
        disabled={submitMutation.isPending}
        onClick={() => submitMutation.mutate()}
      >
        <Send className="size-4" aria-hidden />
        {submitMutation.isPending ? "Enviando…" : "Solicitar número"}
      </Button>
    </div>
  );
}
