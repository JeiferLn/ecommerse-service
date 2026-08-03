"use client";

import {
  canManageWhatsapp,
  type ConversationSummary,
  type PaginatedResponse,
  type WhatsAppMessage,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Send } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

export function WhatsAppInboxSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canManage = Boolean(user && canManageWhatsapp(user.role));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const {
    data: conversations,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["whatsapp-conversations", user?.companyId],
    queryFn: () =>
      apiFetch<PaginatedResponse<ConversationSummary>>("/whatsapp/conversations?page=1&perPage=50"),
    enabled: Boolean(user?.companyId),
  });

  const {
    data: messages,
    isLoading: messagesLoading,
  } = useQuery({
    queryKey: ["whatsapp-messages", selectedId],
    queryFn: () => apiFetch<WhatsAppMessage[]>(`/whatsapp/conversations/${selectedId}/messages`),
    enabled: Boolean(selectedId),
  });

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      apiFetch<WhatsAppMessage>(`/whatsapp/conversations/${selectedId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    onSuccess: () => {
      setDraft("");
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-messages", selectedId] });
      void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    },
  });

  const selected = conversations?.items.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      <Button asChild variant="ghost" className="w-fit px-0">
        <Link href="/dashboard/whatsapp">
          <ArrowLeft className="size-4" aria-hidden />
          Conexión WhatsApp
        </Link>
      </Button>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Conversaciones</CardTitle>
            <CardDescription>
              {conversations ? `${conversations.total} en total` : "Cargando…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading && (
              <p className="px-4 pb-4 text-sm text-muted-foreground">Cargando…</p>
            )}
            {error && (
              <p className="px-4 pb-4 text-sm text-destructive">
                {error instanceof ApiClientError ? error.message : "Error al cargar"}
              </p>
            )}
            {!isLoading && conversations?.items.length === 0 && (
              <p className="px-4 pb-4 text-sm text-muted-foreground">
                Aún no hay conversaciones. Simula un mensaje desde la conexión.
              </p>
            )}
            <ul className="max-h-112 overflow-y-auto border-t border-border/60">
              {conversations?.items.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(conversation.id)}
                    className={cn(
                      "flex w-full flex-col gap-0.5 px-4 py-3 text-left transition-colors hover:bg-accent/60",
                      selectedId === conversation.id && "bg-accent",
                    )}
                  >
                    <span className="truncate text-sm font-medium">
                      {conversation.customerName || conversation.customerWaId}
                    </span>
                    <span className="truncate text-xs text-muted-foreground">
                      {conversation.lastMessagePreview || "Sin mensajes"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="flex min-h-112 flex-col">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">
              {selected
                ? selected.customerName || selected.customerWaId
                : "Selecciona una conversación"}
            </CardTitle>
            {selected && (
              <CardDescription>{selected.customerWaId}</CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-3">
            {!selectedId && (
              <p className="text-sm text-muted-foreground">
                Elige un hilo a la izquierda para ver los mensajes.
              </p>
            )}
            {selectedId && messagesLoading && (
              <p className="text-sm text-muted-foreground">Cargando mensajes…</p>
            )}
            {selectedId && !messagesLoading && (
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto rounded-xl border border-border/60 bg-muted/20 p-3">
                {(messages ?? []).map((message) => (
                  <div
                    key={message.id}
                    className={cn(
                      "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                      message.direction === "outbound"
                        ? "ml-auto bg-primary text-primary-foreground"
                        : "mr-auto bg-card text-card-foreground shadow-sm",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.body}</p>
                    <p
                      className={cn(
                        "mt-1 text-[10px] opacity-70",
                        message.direction === "outbound" ? "text-right" : "text-left",
                      )}
                    >
                      {new Date(message.createdAt).toLocaleString()}
                      {message.status ? ` · ${message.status}` : ""}
                    </p>
                  </div>
                ))}
                {(messages ?? []).length === 0 && (
                  <p className="text-sm text-muted-foreground">Sin mensajes en este hilo.</p>
                )}
              </div>
            )}

            {selectedId && canManage && (
              <form
                className="flex gap-2"
                onSubmit={(event) => {
                  event.preventDefault();
                  const text = draft.trim();
                  if (!text || sendMutation.isPending) {
                    return;
                  }
                  sendMutation.mutate(text);
                }}
              >
                <Input
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Escribe una respuesta…"
                  disabled={sendMutation.isPending}
                />
                <Button type="submit" disabled={sendMutation.isPending || !draft.trim()}>
                  <Send className="size-4" aria-hidden />
                  Enviar
                </Button>
              </form>
            )}
            {selectedId && !canManage && (
              <p className="text-xs text-muted-foreground">
                Solo owner/manager pueden enviar respuestas manuales.
              </p>
            )}
            {sendMutation.isError && (
              <p className="text-sm text-destructive">
                {sendMutation.error instanceof ApiClientError
                  ? sendMutation.error.message
                  : "No se pudo enviar"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
