import type { WhatsAppMessage } from "@commerce-ai/types";

import {
  type ChatActionHandler,
  InteractiveFooter,
  InteractiveHeader,
  InteractiveReplyLabel,
} from "@/components/chat-interactive";
import { cn } from "@/lib/utils";

const MESSAGE_STATUS_LABELS: Record<NonNullable<WhatsAppMessage["status"]>, string> = {
  received: "Recibido",
  sent: "Enviado",
  failed: "No enviado",
};

/** Sin `onAction`, los botones y listas se muestran pero no se pueden tocar. */
export function ChatMessageBubble({
  message,
  showStatus = true,
  className,
  onAction,
  actionsDisabled = false,
}: {
  message: WhatsAppMessage;
  showStatus?: boolean;
  className?: string;
  onAction?: ChatActionHandler;
  actionsDisabled?: boolean;
}) {
  const outbound = message.direction === "outbound";
  const isImage = message.type === "image" && /^https?:\/\//i.test(message.body);
  const date = new Date(message.createdAt);
  const failed = message.status === "failed";
  const interactive = message.interactive ?? null;

  return (
    <div
      className={cn(
        "max-w-[80%] overflow-hidden rounded-lg px-3 py-2 text-sm",
        outbound
          ? "mr-auto rounded-bl-sm bg-accent text-foreground"
          : "ml-auto rounded-br-sm border border-border bg-card text-card-foreground",
        interactive?.kind === "product_card" && "w-72",
        failed && "border border-destructive/60",
        className,
      )}
    >
      <InteractiveReplyLabel interactive={interactive} />
      <InteractiveHeader interactive={interactive} />
      {isImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={message.body}
          alt="Producto"
          className="max-h-56 w-full rounded-md object-contain"
        />
      ) : (
        <p className="whitespace-pre-wrap text-pretty">{message.body}</p>
      )}
      <p
        className={cn(
          "mt-1 text-[11px] text-muted-foreground tabular-nums",
          outbound ? "text-left" : "text-right",
          failed && "text-destructive",
        )}
      >
        <time dateTime={message.createdAt} title={date.toLocaleString("es-CO")}>
          {date.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
        </time>
        {showStatus && message.status && message.status !== "received"
          ? ` · ${MESSAGE_STATUS_LABELS[message.status]}`
          : ""}
      </p>
      <InteractiveFooter interactive={interactive} onAction={onAction} disabled={actionsDisabled} />
    </div>
  );
}
