"use client";

import {
  canManageWhatsapp,
  CONVERSATION_HANDLER_LABELS,
  type AssistantPlaygroundThread,
  type CompanyDetails,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FlaskConical, RotateCcw, Send, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { ChatMessageBubble } from "@/components/chat-message-bubble";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";
import { WhatsAppCommerceRequiredGate } from "@/components/whatsapp-commerce-required-gate";
import { WhatsAppKnowledgeRequiredGate } from "@/components/whatsapp-knowledge-required-gate";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useFillHeight } from "@/lib/use-fill-height";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

const SUGGESTIONS = [
  "Hola, ¿qué productos tienen?",
  "¿Hacen envíos a mi ciudad?",
  "Quiero hablar con un asesor",
];

export function AssistantPlaygroundSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canManage = Boolean(user && canManageWhatsapp(user.role));
  const [draft, setDraft] = useState("");
  const [pendingText, setPendingText] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const seenRef = useRef<Set<string> | null>(null);
  const fill = useFillHeight<HTMLDivElement>();

  const { data: company, isLoading: companyLoading } = useQuery({
    queryKey: ["company", user?.companyId],
    queryFn: () => apiFetch<CompanyDetails>("/company"),
    enabled: Boolean(user?.companyId) && canManage,
  });
  const commerceReady = Boolean(company?.commerce.isConfigured);
  const knowledgeReady = Boolean(company?.knowledge.isConfigured);
  const ready = commerceReady && knowledgeReady;

  const threadKey = ["assistant-playground", user?.companyId];
  const { data: thread, isLoading: threadLoading } = useQuery({
    queryKey: threadKey,
    queryFn: () => apiFetch<AssistantPlaygroundThread>("/assistant/playground"),
    enabled: Boolean(user?.companyId) && canManage && ready,
  });

  const sendMutation = useMutation({
    mutationFn: (text: string) =>
      apiFetch<AssistantPlaygroundThread>("/assistant/playground/messages", {
        method: "POST",
        body: JSON.stringify({ text }),
      }),
    onMutate: (text) => {
      setPendingText(text);
      setDraft("");
    },
    onSuccess: (data) => {
      queryClient.setQueryData(threadKey, data);
      if (!company?.onboarding.playgroundTried) {
        void queryClient.invalidateQueries({ queryKey: ["company"] });
      }
    },
    onError: (_error, text) => setDraft(text),
    onSettled: () => setPendingText(null),
  });

  const resetMutation = useMutation({
    mutationFn: () => apiFetch<null>("/assistant/playground", { method: "DELETE" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: threadKey });
    },
  });

  const messages = thread?.messages ?? [];

  useEffect(() => {
    if (thread && seenRef.current === null) {
      seenRef.current = new Set(thread.messages.map((message) => message.id));
    }
  }, [thread]);

  useEffect(() => {
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages.length, pendingText]);

  if (!user) {
    return <Skeleton className="h-120 w-full rounded-lg" />;
  }

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Solo el dueño o un administrador de la tienda pueden probar el asistente.
      </p>
    );
  }

  if (companyLoading) {
    return <Skeleton className="h-120ull rounded-lg" />;
  }

  if (!commerceReady) {
    return <WhatsAppCommerceRequiredGate />;
  }

  if (!knowledgeReady) {
    return <WhatsAppKnowledgeRequiredGate missingTypes={company?.knowledge.missingTypes ?? []} />;
  }

  const send = (text: string) => {
    const body = text.trim();
    if (!body || sendMutation.isPending) {
      return;
    }
    sendMutation.mutate(body);
  };

  const error = sendMutation.error ?? resetMutation.error;

  return (
    <div
      ref={fill.ref}
      style={fill.height ? { height: fill.height } : undefined}
      className="grid h-[calc(100dvh-12rem)] min-h-120 overflow-hidden rounded-lg border border-border bg-card lg:grid-cols-[minmax(0,1fr)_280px]"
    >
      <section aria-label="Chat de prueba" className="flex min-h-0 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-3 py-3 sm:px-4">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <UserRound className="size-4" />
          </span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-sm font-medium">Cliente de prueba</span>
            <span className="truncate text-xs text-muted-foreground">
              {thread ? `Atiende: ${CONVERSATION_HANDLER_LABELS[thread.handler]}` : "Cargando…"}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={resetMutation.isPending || sendMutation.isPending || messages.length === 0}
            onClick={() => {
              seenRef.current = null;
              resetMutation.mutate();
            }}
          >
            <RotateCcw className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">
              {resetMutation.isPending ? "Reiniciando…" : "Reiniciar"}
            </span>
          </Button>
        </header>

        <div
          ref={scrollRef}
          className="min-h-0 flex-1 overflow-y-auto bg-background px-3 py-4 sm:px-6"
          aria-live="polite"
        >
          {threadLoading ? <SkeletonText lines={4} className="max-w-sm" /> : null}
          {!threadLoading && messages.length === 0 && !pendingText ? (
            <div className="fade-swap flex h-full flex-col items-center justify-center gap-4 text-center">
              <p className="max-w-xs text-sm text-muted-foreground">
                Escribe como lo haría un cliente, o empieza con una de estas:
              </p>
              <div className="flex max-w-md flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <Button
                    key={suggestion}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => send(suggestion)}
                  >
                    {suggestion}
                  </Button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.length > 0 || pendingText ? (
            <div className="flex flex-col gap-2">
              {messages.map((message) => (
                <ChatMessageBubble
                  key={message.id}
                  message={message}
                  showStatus={false}
                  className={cn(seenRef.current && !seenRef.current.has(message.id) && "bubble-in")}
                />
              ))}
              {pendingText ? (
                <>
                  <div className="bubble-in mr-auto max-w-[80%] rounded-lg rounded-bl-sm border border-border bg-card px-3 py-2 text-sm opacity-70">
                    <p className="whitespace-pre-wrap">{pendingText}</p>
                  </div>
                  <p className="ml-auto inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="size-1.5 animate-pulse rounded-full bg-primary" aria-hidden />
                    El asistente está escribiendo…
                  </p>
                </>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="flex flex-col gap-2 border-t border-border p-3">
          <p className="text-xs text-muted-foreground lg:hidden">
            Nada se envía por WhatsApp ni se crean pedidos.
          </p>
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              send(draft);
            }}
          >
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Escribe como si fueras un cliente…"
              maxLength={1000}
              disabled={sendMutation.isPending}
              aria-label="Mensaje de prueba"
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
          {error ? (
            <p className="text-sm text-destructive">
              {error instanceof ApiClientError ? error.message : "No se pudo completar la acción"}
            </p>
          ) : null}
        </div>
      </section>

      <aside className="hidden min-h-0 flex-col gap-4 overflow-y-auto border-l border-border p-5 text-sm lg:flex">
        <div className="flex items-center gap-2">
          <FlaskConical className="size-4 text-muted-foreground" aria-hidden />
          <span className="font-medium">Así lo verá tu cliente</span>
        </div>
        <ul className="flex flex-col divide-y divide-border text-muted-foreground">
          <li className="pb-3">No se envía nada por WhatsApp y no aparece en Conversaciones.</li>
          <li className="py-3">
            Puedes armar un carrito, pero al confirmar no se crea el pedido ni se descuenta stock.
          </li>
          <li className="py-3">
            Las respuestas del asistente sí cuentan en tu cupo mensual de IA.
          </li>
          <li className="pt-3">Usa Reiniciar para empezar de cero, como un cliente nuevo.</li>
        </ul>
      </aside>
    </div>
  );
}
