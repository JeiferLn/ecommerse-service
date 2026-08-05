"use client";

import {
  canManageWhatsapp,
  CONVERSATION_HANDLER_LABELS,
  type CompanyDetails,
  type ConversationSummary,
  type PaginatedResponse,
  type WhatsAppMessage,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Bot, Eraser, RotateCcw, Send, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { WhatsAppCommerceRequiredGate } from "@/components/whatsapp-commerce-required-gate";
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

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ["company", user?.companyId],
    queryFn: () => apiFetch<CompanyDetails>("/company"),
    enabled: Boolean(user?.companyId),
  });
  const commerceReady = Boolean(company?.commerce.isConfigured);

  const {
    data: conversations,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["whatsapp-conversations", user?.companyId],
    queryFn: () =>
      apiFetch<PaginatedResponse<ConversationSummary>>("/whatsapp/conversations?page=1&perPage=50"),
    enabled: Boolean(user?.companyId) && commerceReady,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["whatsapp-messages", selectedId],
    queryFn: () => apiFetch<WhatsAppMessage[]>(`/whatsapp/conversations/${selectedId}/messages`),
    enabled: Boolean(selectedId),
  });

  const invalidateInbox = () => {
    void queryClient.invalidateQueries({ queryKey: ["whatsapp-conversations"] });
    void queryClient.invalidateQueries({ queryKey: ["whatsapp-messages"] });
  };

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      apiFetch<WhatsAppMessage>(`/whatsapp/conversations/${selectedId}/messages`, {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    onSuccess: () => {
      setDraft("");
      invalidateInbox();
    },
  });

  const handlerMutation = useMutation({
    mutationFn: (handler: "bot" | "human") =>
      apiFetch<ConversationSummary>(`/whatsapp/conversations/${selectedId}/handler`, {
        method: "PATCH",
        body: JSON.stringify({ handler }),
      }),
    onSuccess: () => {
      invalidateInbox();
    },
  });

  const resetChatMutation = useMutation({
    mutationFn: (conversationId: string) =>
      apiFetch<null>(`/whatsapp/conversations/${conversationId}`, { method: "DELETE" }),
    onSuccess: () => {
      setSelectedId(null);
      setDraft("");
      invalidateInbox();
    },
  });

  const clearAllMutation = useMutation({
    mutationFn: () =>
      apiFetch<{ deleted: number }>("/whatsapp/conversations", { method: "DELETE" }),
    onSuccess: () => {
      setSelectedId(null);
      setDraft("");
      invalidateInbox();
    },
  });

  const selected = conversations?.items.find((item) => item.id === selectedId) ?? null;
  const isResetting = resetChatMutation.isPending || clearAllMutation.isPending;
  const isHandlerBusy = handlerMutation.isPending;

  if (companyLoading) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  if (!commerceReady) {
    return (
      <div className="flex flex-col gap-4">
        <Button asChild variant="ghost" className="w-fit px-0">
          <Link href="/dashboard/whatsapp">
            <ArrowLeft className="size-4" aria-hidden />
            Conexión WhatsApp
          </Link>
        </Button>
        <WhatsAppCommerceRequiredGate />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="ghost" className="w-fit px-0">
          <Link href="/dashboard/whatsapp">
            <ArrowLeft className="size-4" aria-hidden />
            Conexión WhatsApp
          </Link>
        </Button>
        {canManage && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isResetting || !conversations?.items.length}
            onClick={() => {
              if (
                window.confirm(
                  "¿Borrar todas las conversaciones del inbox? Útil para empezar casos de prueba desde cero.",
                )
              ) {
                clearAllMutation.mutate();
              }
            }}
          >
            <Eraser className="size-4" aria-hidden />
            {clearAllMutation.isPending ? "Limpiando…" : "Limpiar inbox"}
          </Button>
        )}
      </div>

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
                      {CONVERSATION_HANDLER_LABELS[conversation.handler]} ·{" "}
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
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <CardTitle className="text-base">
                  {selected
                    ? selected.customerName || selected.customerWaId
                    : "Selecciona una conversación"}
                </CardTitle>
                {selected && (
                  <CardDescription>
                    {selected.customerWaId} · {CONVERSATION_HANDLER_LABELS[selected.handler]}
                  </CardDescription>
                )}
              </div>
              {selectedId && canManage && (
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                  {selected?.handler === "human" && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isResetting || isHandlerBusy}
                      onClick={() => handlerMutation.mutate("bot")}
                    >
                      <Bot className="size-4" aria-hidden />
                      {handlerMutation.isPending ? "Activando…" : "Activar bot"}
                    </Button>
                  )}
                  {selected?.handler === "bot" && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={isResetting || isHandlerBusy}
                      onClick={() => handlerMutation.mutate("human")}
                    >
                      <UserRound className="size-4" aria-hidden />
                      {handlerMutation.isPending ? "Asignando…" : "Tomar chat"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isResetting}
                    onClick={() => {
                      if (
                        window.confirm(
                          "¿Resetear este chat? Se borrará el historial y la próxima simulación empezará de cero.",
                        )
                      ) {
                        resetChatMutation.mutate(selectedId);
                      }
                    }}
                  >
                    <RotateCcw className="size-4" aria-hidden />
                    {resetChatMutation.isPending ? "Reseteando…" : "Resetear chat"}
                  </Button>
                </div>
              )}
            </div>
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
            {(sendMutation.isError ||
              handlerMutation.isError ||
              resetChatMutation.isError ||
              clearAllMutation.isError) && (
              <p className="text-sm text-destructive">
                {(sendMutation.error instanceof ApiClientError && sendMutation.error.message) ||
                  (handlerMutation.error instanceof ApiClientError &&
                    handlerMutation.error.message) ||
                  (resetChatMutation.error instanceof ApiClientError &&
                    resetChatMutation.error.message) ||
                  (clearAllMutation.error instanceof ApiClientError &&
                    clearAllMutation.error.message) ||
                  "No se pudo completar la acción"}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
