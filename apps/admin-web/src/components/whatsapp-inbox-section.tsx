"use client";

import {
  canManageWhatsapp,
  CONVERSATION_HANDLER_LABELS,
  type CompanyDetails,
  type ConversationHandler,
  type ConversationSummary,
  type PaginatedResponse,
  type WhatsAppMessage,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bot,
  ClipboardList,
  MessagesSquare,
  MousePointerClick,
  Search,
  Send,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { ChatSurface } from "@/components/chat-interactive";
import { ChatMessageBubble } from "@/components/chat-message-bubble";
import {
  getSetupItems,
  missingRequiredItems,
  SetupRequirements,
} from "@/components/setup-requirements";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useFillHeight } from "@/lib/use-fill-height";
import { useStaggerOnce } from "@/lib/use-stagger-once";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

type HandlerFilter = "all" | ConversationHandler;

const HANDLER_TONE: Record<ConversationHandler, StatusTone> = {
  human: "attention",
  bot: "positive",
  pending: "neutral",
};

const HANDLER_FILTERS: HandlerFilter[] = ["all", "human", "bot", "pending"];

const POLL_MS = 10_000;

function isHandlerFilter(value: string | null): value is HandlerFilter {
  return value === "all" || value === "human" || value === "bot" || value === "pending";
}

function initials(name: string): string {
  const parts = name.replace(/^\+/, "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (/^\d/.test(parts[0])) {
    return parts[0].slice(-2);
  }
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function displayName(conversation: ConversationSummary): string {
  return conversation.customerName || `+${conversation.customerWaId.replace(/^\+/, "")}`;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function dayLabel(date: Date): string {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) {
    return "Hoy";
  }
  if (dayKey(date) === dayKey(yesterday)) {
    return "Ayer";
  }
  return date.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
}

function relativeTime(iso: string): string {
  const date = new Date(iso);
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) {
    return "ahora";
  }
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const label = dayLabel(date);
  if (label === "Hoy") {
    return date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  }
  if (label === "Ayer") {
    return "ayer";
  }
  return date.toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}

export function WhatsAppInboxSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const canManage = Boolean(user && canManageWhatsapp(user.role));
  const initialFilter = searchParams.get("handler");
  const [filter, setFilter] = useState<HandlerFilter>(
    isHandlerFilter(initialFilter) ? initialFilter : "all",
  );
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("id"));
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const fill = useFillHeight<HTMLDivElement>();

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ["company", user?.companyId],
    queryFn: () => apiFetch<CompanyDetails>("/company"),
    enabled: Boolean(user?.companyId),
  });
  const whatsappReady = Boolean(
    company &&
    missingRequiredItems(getSetupItems(company, user?.role, { requirePayments: true })).length ===
      0,
  );

  const {
    data: conversations,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["whatsapp-conversations", user?.companyId],
    queryFn: () =>
      apiFetch<PaginatedResponse<ConversationSummary>>("/whatsapp/conversations?page=1&perPage=50"),
    enabled: Boolean(user?.companyId) && whatsappReady,
    refetchInterval: POLL_MS,
  });

  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ["whatsapp-messages", selectedId],
    queryFn: () => apiFetch<WhatsAppMessage[]>(`/whatsapp/conversations/${selectedId}/messages`),
    enabled: Boolean(selectedId),
    refetchInterval: POLL_MS,
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
    onSuccess: invalidateInbox,
  });

  const items = useMemo(() => conversations?.items ?? [], [conversations]);
  const counts = useMemo(() => {
    const result: Record<HandlerFilter, number> = {
      all: items.length,
      human: 0,
      bot: 0,
      pending: 0,
    };
    for (const item of items) {
      result[item.handler] += 1;
    }
    return result;
  }, [items]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.handler !== filter) {
        return false;
      }
      if (!term) {
        return true;
      }
      return (
        (item.customerName ?? "").toLowerCase().includes(term) ||
        item.customerWaId.includes(term.replace(/\D/g, "") || term)
      );
    });
  }, [items, filter, search]);

  const selected = items.find((item) => item.id === selectedId) ?? null;
  const listStagger = useStaggerOnce(Boolean(conversations) && items.length > 0);

  // Los mensajes que ya estaban al abrir el chat no se animan; solo los que llegan después.
  const seenRef = useRef<{ conversationId: string | null; ids: Set<string> }>({
    conversationId: null,
    ids: new Set(),
  });
  if (messages && seenRef.current.conversationId !== selectedId) {
    seenRef.current = { conversationId: selectedId, ids: new Set(messages.map((item) => item.id)) };
  }
  const messageCount = messages?.length ?? 0;

  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [selectedId, messageCount]);

  if (companyLoading || !company) {
    return <Skeleton className="h-120 w-full rounded-lg" />;
  }

  if (!whatsappReady) {
    return (
      <SetupRequirements
        company={company}
        requirePayments
        purpose="recibir conversaciones por WhatsApp"
      />
    );
  }

  const actionError =
    (sendMutation.error instanceof ApiClientError && sendMutation.error.message) ||
    (handlerMutation.error instanceof ApiClientError && handlerMutation.error.message) ||
    (sendMutation.isError || handlerMutation.isError ? "No se pudo completar la acción" : null);

  return (
    <div
      ref={fill.ref}
      style={fill.height ? { height: fill.height } : undefined}
      className="grid h-[calc(100dvh-12rem)] min-h-120 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[320px_minmax(0,1fr)]"
    >
      <aside
        aria-label="Lista de conversaciones"
        className={cn(
          "min-h-0 flex-col border-border lg:flex lg:border-r",
          selectedId ? "hidden" : "flex",
        )}
      >
        <div className="flex flex-col gap-3 border-b border-border p-3">
          <div className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nombre o número"
              aria-label="Buscar conversaciones"
              className="h-9 pl-9"
            />
          </div>
          <Segmented
            label="Filtrar por quién atiende"
            size="sm"
            value={filter}
            onChange={setFilter}
            className="flex-nowrap overflow-x-auto"
            options={HANDLER_FILTERS.map((value) => ({
              value,
              label: value === "all" ? "Todas" : CONVERSATION_HANDLER_LABELS[value],
              count: value !== "all" && counts[value] > 0 ? counts[value] : undefined,
            }))}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col gap-4 p-3">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="flex items-center gap-3">
                  <Skeleton className="size-9 shrink-0 rounded-full" />
                  <div className="flex flex-1 flex-col gap-2">
                    <Skeleton className="h-3.5 w-2/5" />
                    <Skeleton className="h-3 w-4/5" />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          {error && (
            <p className="p-4 text-sm text-destructive">
              {error instanceof ApiClientError ? error.message : "Error al cargar"}
            </p>
          )}
          {!isLoading && !error && visible.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title={items.length === 0 ? "Aún no hay conversaciones" : "Sin resultados"}
              description={
                items.length === 0
                  ? "Cuando un cliente escriba a tu WhatsApp, verás el chat aquí."
                  : "Prueba con otro filtro o busca otro nombre."
              }
            />
          ) : null}
          <ul className={cn("divide-y divide-border", listStagger)}>
            {visible.map((conversation) => {
              const active = conversation.id === selectedId;
              const name = displayName(conversation);
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(conversation.id)}
                    aria-current={active ? "true" : undefined}
                    className={cn(
                      "flex w-full items-start gap-3 px-3 py-3 text-left transition-colors",
                      active ? "bg-muted" : "hover:bg-muted/50",
                    )}
                  >
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                      {initials(name)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-sm font-medium">{name}</span>
                        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                          {relativeTime(conversation.lastMessageAt)}
                        </span>
                      </span>
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm text-muted-foreground">
                          {conversation.lastMessagePreview || "Sin mensajes"}
                        </span>
                        {conversation.handler === "human" ? (
                          <span
                            className="size-2 shrink-0 rounded-full bg-warning"
                            aria-label="Atiende un asesor"
                          />
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <section
        aria-label="Conversación"
        className={cn("min-h-0 flex-col", selectedId ? "flex" : "hidden lg:flex")}
      >
        {!selected ? (
          <EmptyState
            key="empty"
            icon={MousePointerClick}
            title="Elige una conversación"
            description="Verás los mensajes del cliente y podrás tomar el chat o devolverlo al bot."
            className="flex-1"
          />
        ) : (
          <ChatSurface key={selected.id} className="fade-swap flex min-h-0 flex-1 flex-col">
            <header className="flex items-center gap-3 border-b border-border px-3 py-3 sm:px-4">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="lg:hidden"
                aria-label="Volver a la lista"
                onClick={() => setSelectedId(null)}
              >
                <ArrowLeft className="size-4" aria-hidden />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="truncate text-sm font-semibold">{displayName(selected)}</h2>
                  <StatusPill tone={HANDLER_TONE[selected.handler]}>
                    {CONVERSATION_HANDLER_LABELS[selected.handler]}
                  </StatusPill>
                </div>
                <p className="font-data text-xs text-muted-foreground">
                  +{selected.customerWaId.replace(/^\+/, "")}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button asChild variant="ghost" size="sm">
                  <Link href={`/orders?conversationId=${selected.id}`}>
                    <ClipboardList className="size-4" aria-hidden />
                    <span className="sr-only sm:not-sr-only">Pedidos</span>
                  </Link>
                </Button>
                {canManage && selected.handler === "human" ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={handlerMutation.isPending}
                    onClick={() => handlerMutation.mutate("bot")}
                  >
                    <Bot className="size-4" aria-hidden />
                    <span className="sr-only sm:not-sr-only">
                      {handlerMutation.isPending ? "Activando…" : "Devolver al bot"}
                    </span>
                  </Button>
                ) : null}
                {canManage && selected.handler !== "human" ? (
                  <Button
                    type="button"
                    size="sm"
                    disabled={handlerMutation.isPending}
                    onClick={() => handlerMutation.mutate("human")}
                  >
                    <UserRound className="size-4" aria-hidden />
                    <span className="sr-only sm:not-sr-only">
                      {handlerMutation.isPending ? "Asignando…" : "Tomar chat"}
                    </span>
                  </Button>
                ) : null}
              </div>
            </header>

            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-4 sm:px-6"
              aria-live="polite"
            >
              {messagesLoading ? (
                <SkeletonText lines={4} className="max-w-sm" />
              ) : messageCount === 0 ? (
                <p className="text-center text-sm text-muted-foreground">
                  Sin mensajes en este chat.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {(messages ?? []).map((message, index, list) => {
                    const date = new Date(message.createdAt);
                    const previous = index > 0 ? new Date(list[index - 1].createdAt) : null;
                    const newDay = !previous || dayKey(previous) !== dayKey(date);
                    return (
                      <Fragment key={message.id}>
                        {newDay ? (
                          <div className="my-2 flex items-center gap-3 text-xs text-muted-foreground first:mt-0">
                            <span className="h-px flex-1 bg-border" />
                            <span className="first-letter:uppercase">{dayLabel(date)}</span>
                            <span className="h-px flex-1 bg-border" />
                          </div>
                        ) : null}
                        <ChatMessageBubble
                          message={message}
                          className={cn(!seenRef.current.ids.has(message.id) && "bubble-in")}
                        />
                      </Fragment>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-border p-3">
              {canManage ? (
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
                    placeholder={
                      selected.handler === "human"
                        ? "Escribe una respuesta…"
                        : "Escribe para responder tú; el bot sigue activo"
                    }
                    aria-label="Mensaje"
                    disabled={sendMutation.isPending}
                  />
                  <Button
                    type="submit"
                    disabled={sendMutation.isPending || !draft.trim()}
                    aria-label="Enviar"
                  >
                    <Send className="size-4" aria-hidden />
                    <span className="hidden sm:inline">Enviar</span>
                  </Button>
                </form>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Solo el dueño o un administrador pueden responder desde aquí.
                </p>
              )}
              {actionError ? <p className="mt-2 text-sm text-destructive">{actionError}</p> : null}
            </div>
          </ChatSurface>
        )}
      </section>
    </div>
  );
}
