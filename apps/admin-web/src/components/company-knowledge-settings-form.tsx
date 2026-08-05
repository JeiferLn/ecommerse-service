"use client";

import {
  canManageKnowledge,
  KNOWLEDGE_DOCUMENT_TYPE_LABELS,
  type KnowledgeSlot,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, FileUp, Trash2 } from "lucide-react";
import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function CompanyKnowledgeSettingsForm() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canManage = Boolean(user && canManageKnowledge(user.role));
  const [message, setMessage] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const { data: slots, isLoading } = useQuery({
    queryKey: ["knowledge", user?.companyId],
    queryFn: () => apiFetch<KnowledgeSlot[]>("/knowledge"),
    enabled: Boolean(user?.companyId && canManage),
  });

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
        throw new ApiClientError(
          response.status,
          payload?.message ?? "No se pudo subir el PDF",
        );
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

  if (!user?.companyId) {
    return null;
  }

  if (!canManage) {
    return (
      <Card id="conocimiento" className="border-border/70 bg-card/80 shadow-brand-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl font-bold">Conocimiento (PDFs)</CardTitle>
          <CardDescription>
            Solo el dueño o un manager pueden subir los documentos obligatorios del bot.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card id="conocimiento" className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-heading flex items-center gap-2 text-xl font-bold">
          <BookOpen className="size-5" aria-hidden />
          Conocimiento (PDFs obligatorios)
        </CardTitle>
        <CardDescription>
          Sube estos 4 PDFs con texto seleccionable. Sin ellos, WhatsApp permanece bloqueado. Alimentan
          al bot (RAG).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isLoading && <p className="text-sm text-muted-foreground">Cargando…</p>}
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {slots?.map((slot) => (
          <div
            key={slot.type}
            className="flex h-full flex-col gap-3 rounded-xl border border-border/60 p-4"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium">{slot.title}</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{slot.reason}</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {slot.uploaded
                  ? `${slot.fileName ?? "PDF"} · ${slot.chunksCount} fragmento(s)`
                  : "Pendiente — PDF requerido"}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
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
                disabled={uploadingType === slot.type}
                onClick={() => inputRefs.current[slot.type]?.click()}
              >
                <FileUp className="size-3.5" aria-hidden />
                {slot.uploaded
                  ? uploadingType === slot.type
                    ? "Subiendo…"
                    : "Reemplazar PDF"
                  : uploadingType === slot.type
                    ? "Subiendo…"
                    : "Subir PDF"}
              </Button>
              {slot.uploaded && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`¿Eliminar ${KNOWLEDGE_DOCUMENT_TYPE_LABELS[slot.type]}?`)) {
                      deleteMutation.mutate(slot.type);
                    }
                  }}
                >
                  <Trash2 className="size-3.5" aria-hidden />
                  Quitar
                </Button>
              )}
            </div>
          </div>
        ))}
        </div>
        {message && <p className="text-sm text-muted-foreground">{message}</p>}
      </CardContent>
    </Card>
  );
}
