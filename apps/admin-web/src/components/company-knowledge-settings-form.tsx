"use client";

import {
  canManageKnowledge,
  KNOWLEDGE_DOCUMENT_TYPE_LABELS,
  type KnowledgeSlot,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, FileUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useStaggerOnce } from "@/lib/use-stagger-once";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/providers/confirm-provider";
import { useSession } from "@/providers/session-provider";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function CompanyKnowledgeSettingsForm() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const canManage = Boolean(user && canManageKnowledge(user.role));
  const [message, setMessage] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: slots, isLoading } = useQuery({
    queryKey: ["knowledge", user?.companyId],
    queryFn: () => apiFetch<KnowledgeSlot[]>("/knowledge"),
    enabled: Boolean(user?.companyId && canManage),
  });
  const listStagger = useStaggerOnce(Boolean(slots?.length));

  const uploadMutation = useMutation({
    mutationFn: async ({ type, file }: { type: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_URL}/api/v1/knowledge/${type}/file`, {
        method: "PUT",
        body: formData,
        credentials: "include",
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        data?: KnowledgeSlot;
      } | null;
      if (!response.ok) {
        throw new ApiClientError(response.status, payload?.message ?? "No se pudo subir el PDF");
      }
      return payload?.data as KnowledgeSlot;
    },
    onSuccess: () => {
      setMessage("PDF indexado correctamente");
      void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      void queryClient.invalidateQueries({ queryKey: ["company"] });
    },
    onError: (error: unknown) => {
      setMessage(error instanceof ApiClientError ? error.message : "No se pudo subir el PDF");
    },
    onSettled: () => setUploadingType(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (type: string) =>
      apiFetch<null>(`/knowledge/${type}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      setMessage("Documento eliminado");
      void queryClient.invalidateQueries({ queryKey: ["knowledge"] });
      void queryClient.invalidateQueries({ queryKey: ["company"] });
    },
    onError: (error: unknown) => {
      setMessage(error instanceof ApiClientError ? error.message : "No se pudo eliminar");
    },
  });

  if (!user) {
    return <SkeletonRows rows={4} columns={3} className="max-w-4xl" />;
  }

  if (!user.companyId) {
    return null;
  }

  if (!canManage) {
    return (
      <p id="conocimiento" className="text-sm text-muted-foreground">
        Solo el dueño o un manager pueden subir los documentos del asistente.
      </p>
    );
  }

  const uploadedCount = slots?.filter((slot) => slot.uploaded).length ?? 0;

  return (
    <section id="conocimiento" className="flex max-w-4xl flex-col gap-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Opcionales: el asistente atiende sin ellos, pero con cada uno responde mejor. Usa PDFs con
          texto seleccionable (no escaneados).
        </p>
        {slots ? (
          <span className="text-sm tabular-nums">
            {uploadedCount} de {slots.length} cargados
          </span>
        ) : null}
      </div>

      {isLoading ? <SkeletonRows rows={4} columns={3} /> : null}

      {slots ? (
        <ul className={cn("divide-y divide-border border-y border-border", listStagger)}>
          {slots.map((slot) => {
            const uploading = uploadingType === slot.type;
            return (
              <li
                key={slot.type}
                className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:gap-6"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground max-sm:hidden">
                  <FileText className="size-4" aria-hidden />
                </span>
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{slot.title}</p>
                    <StatusPill tone={slot.uploaded ? "positive" : "neutral"}>
                      {slot.uploaded ? "Cargado" : "Sin subir"}
                    </StatusPill>
                  </div>
                  <p className="text-sm text-muted-foreground">{slot.reason}</p>
                  {slot.uploaded ? (
                    <p className="truncate text-xs text-muted-foreground">
                      <span className="font-data">{slot.fileName ?? "PDF"}</span> ·{" "}
                      {slot.chunksCount} {slot.chunksCount === 1 ? "fragmento" : "fragmentos"}
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <input
                    ref={(el) => {
                      inputRefs.current[slot.type] = el;
                    }}
                    type="file"
                    accept="application/pdf,.pdf"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) {
                        return;
                      }
                      setMessage(null);
                      setUploadingType(slot.type);
                      uploadMutation.mutate({ type: slot.type, file });
                    }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={uploading}
                    onClick={() => inputRefs.current[slot.type]?.click()}
                  >
                    <FileUp className="size-3.5" aria-hidden />
                    {uploading ? "Subiendo…" : slot.uploaded ? "Reemplazar" : "Subir PDF"}
                  </Button>
                  {slot.uploaded && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Quitar ${KNOWLEDGE_DOCUMENT_TYPE_LABELS[slot.type]}`}
                      disabled={deleteMutation.isPending}
                      onClick={async () => {
                        const confirmed = await confirm({
                          title: `¿Eliminar ${KNOWLEDGE_DOCUMENT_TYPE_LABELS[slot.type]}?`,
                          description: "El asistente dejará de usar este documento para responder.",
                          confirmLabel: "Eliminar",
                          destructive: true,
                        });
                        if (confirmed) {
                          deleteMutation.mutate(slot.type);
                        }
                      }}
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {message ? (
        <p key={message} role="status" className="slide-up-in text-sm text-muted-foreground">
          {message}
        </p>
      ) : null}
    </section>
  );
}
