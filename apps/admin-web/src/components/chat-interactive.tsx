"use client";

import type { InteractiveAction, MessageInteractive } from "@commerce-ai/types";
import { CornerDownRight, ExternalLink, List, Reply, X } from "lucide-react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { createContext, useContext, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ChatActionHandler = (action: InteractiveAction) => void;

const ChatSurfaceContext = createContext<HTMLElement | null>(null);

/** Marco del chat: el drawer de las listas se abre dentro de él, como en el teléfono. */
export function ChatSurface({ className, children }: { className?: string; children: ReactNode }) {
  const [node, setNode] = useState<HTMLElement | null>(null);
  return (
    <ChatSurfaceContext.Provider value={node}>
      <div ref={setNode} className={cn("relative", className)}>
        {children}
      </div>
    </ChatSurfaceContext.Provider>
  );
}

/** Imagen, título y precio de la tarjeta de producto (van antes del texto). */
export function InteractiveHeader({ interactive }: { interactive: MessageInteractive | null }) {
  if (interactive?.kind !== "product_card") {
    return null;
  }
  return (
    <div className="-mx-3 -mt-2 mb-2 flex flex-col">
      {interactive.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={interactive.imageUrl}
          alt={interactive.title}
          className="aspect-square max-h-56 w-full rounded-t-lg bg-muted object-cover"
        />
      ) : null}
      <div className="flex flex-col gap-0.5 px-3 pt-2">
        <span className="font-medium text-pretty">{interactive.title}</span>
        <span className="text-xs text-muted-foreground tabular-nums">{interactive.subtitle}</span>
      </div>
    </div>
  );
}

/** "Tocó un botón": aparece sobre el mensaje del cliente que eligió una opción. */
export function InteractiveReplyLabel({ interactive }: { interactive: MessageInteractive | null }) {
  if (interactive?.kind !== "reply") {
    return null;
  }
  return (
    <span className="mb-1 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <CornerDownRight className="size-3" aria-hidden />
      Tocó un botón
    </span>
  );
}

/** Botones, lista o enlace de pago debajo del texto del bot. */
export function InteractiveFooter({
  interactive,
  onAction,
  disabled = false,
}: {
  interactive: MessageInteractive | null;
  onAction?: ChatActionHandler;
  disabled?: boolean;
}) {
  if (!interactive) {
    return null;
  }
  switch (interactive.kind) {
    case "buttons":
    case "product_card":
      return (
        <ActionStack>
          {interactive.actions.map((action) => (
            <ActionRow
              key={action.id}
              icon={<Reply className="size-3.5" aria-hidden />}
              label={action.title}
              onClick={onAction ? () => onAction(action) : undefined}
              disabled={disabled}
            />
          ))}
        </ActionStack>
      );
    case "list":
      return <ListPicker interactive={interactive} onAction={onAction} disabled={disabled} />;
    case "link_button":
      return (
        <ActionStack>
          {interactive.url ? (
            <a href={interactive.url} target="_blank" rel="noreferrer" className={actionRowClass}>
              <ExternalLink className="size-3.5" aria-hidden />
              {interactive.title}
            </a>
          ) : (
            <span className={cn(actionRowClass, "cursor-not-allowed opacity-60")}>
              <ExternalLink className="size-3.5" aria-hidden />
              {interactive.title}
              <span className="text-[11px] font-normal text-muted-foreground">· Modo prueba</span>
            </span>
          )}
        </ActionStack>
      );
    default:
      return null;
  }
}

const actionRowClass =
  "flex min-h-10 w-full items-center justify-center gap-1.5 px-2 py-2 text-sm font-medium text-primary transition-colors";

function ActionStack({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-3 mt-2 -mb-2 flex flex-col divide-y divide-border border-t border-border">
      {children}
    </div>
  );
}

function ActionRow({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick?: () => void;
  disabled: boolean;
}) {
  if (!onClick) {
    return (
      <span className={actionRowClass}>
        {icon}
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        actionRowClass,
        "last:rounded-b-lg hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none active:bg-primary/10 disabled:pointer-events-none disabled:opacity-60",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function ListPicker({
  interactive,
  onAction,
  disabled,
}: {
  interactive: Extract<MessageInteractive, { kind: "list" }>;
  onAction?: ChatActionHandler;
  disabled: boolean;
}) {
  const container = useContext(ChatSurfaceContext);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const readOnly = !onAction;
  const choice = interactive.items.find((item) => item.id === selected);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setSelected(null);
        }
      }}
    >
      <ActionStack>
        <DialogPrimitive.Trigger
          disabled={disabled && !readOnly}
          className={cn(
            actionRowClass,
            "rounded-b-lg hover:bg-primary/5 focus-visible:bg-primary/5 focus-visible:outline-none active:bg-primary/10 disabled:pointer-events-none disabled:opacity-60",
          )}
        >
          <List className="size-3.5" aria-hidden />
          {interactive.button}
        </DialogPrimitive.Trigger>
      </ActionStack>
      <DialogPrimitive.Portal container={container}>
        <DialogPrimitive.Overlay
          className={cn(
            "inset-0 z-40 bg-black/40 duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
            container ? "absolute" : "fixed",
          )}
        />
        <DialogPrimitive.Content
          className={cn(
            "inset-x-0 bottom-0 z-50 flex max-h-[75%] flex-col rounded-t-xl border-t border-border bg-card text-card-foreground shadow-lg duration-200 ease-out data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:animate-in data-[state=open]:slide-in-from-bottom",
            container ? "absolute" : "fixed",
          )}
        >
          <div className="flex items-center gap-2 border-b border-border px-4 py-3">
            <DialogPrimitive.Close className="rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">
              <X className="size-4" aria-hidden />
              <span className="sr-only">Cerrar</span>
            </DialogPrimitive.Close>
            <DialogPrimitive.Title className="flex-1 truncate text-sm font-medium">
              {interactive.button}
            </DialogPrimitive.Title>
          </div>
          <DialogPrimitive.Description className="sr-only">
            {readOnly
              ? "Opciones que vio el cliente en WhatsApp."
              : "Elige una opción y envíala al asistente."}
          </DialogPrimitive.Description>
          {readOnly ? (
            <ul className="flex flex-col divide-y divide-border overflow-y-auto">
              {interactive.items.map((item) => (
                <li key={item.id} className="flex flex-col gap-0.5 px-4 py-3">
                  <span className="text-sm">{item.title}</span>
                  {item.description ? (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {item.description}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <fieldset className="flex min-h-0 flex-col overflow-y-auto">
              <legend className="sr-only">{interactive.button}</legend>
              {interactive.items.map((item) => (
                <label
                  key={item.id}
                  className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/50 has-checked:bg-primary/5"
                >
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="text-sm">{item.title}</span>
                    {item.description ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {item.description}
                      </span>
                    ) : null}
                  </span>
                  <input
                    type="radio"
                    name={`list-${interactive.button}`}
                    value={item.id}
                    checked={selected === item.id}
                    onChange={() => setSelected(item.id)}
                    className="size-4 shrink-0 accent-primary"
                  />
                </label>
              ))}
            </fieldset>
          )}
          {readOnly ? (
            <p className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
              Así vio el cliente la lista. Su elección aparece como respuesta en el chat.
            </p>
          ) : (
            <div className="border-t border-border p-3">
              <Button
                type="button"
                className="w-full"
                disabled={!choice || disabled}
                onClick={() => {
                  if (choice && onAction) {
                    onAction({ id: choice.id, title: choice.title });
                    setOpen(false);
                    setSelected(null);
                  }
                }}
              >
                Enviar
              </Button>
            </div>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
