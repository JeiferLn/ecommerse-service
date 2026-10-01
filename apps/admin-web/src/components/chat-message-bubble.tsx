import type { WhatsAppMessage } from "@commerce-ai/types";

import { cn } from "@/lib/utils";

const MESSAGE_STATUS_LABELS: Record<NonNullable<WhatsAppMessage["status"]>, string> = {
  received: "Recibido",
  sent: "Enviado",
  failed: "No enviado",
};

export function ChatMessageBubble({
  message,
  showStatus = true,
  className,
}: {
  message: WhatsAppMessage;
  showStatus?: boolean;
  className?: string;
}) {
  const outbound = message.direction === "outbound";
  const isImage = message.type === "image" && /^https?:\/\//i.test(message.body);
  const date = new Date(message.createdAt);
  const failed = message.status === "failed";

  return (
    <div
      className={cn(
        "max-w-[80%] rounded-lg px-3 py-2 text-sm",
        outbound
          ? "ml-auto rounded-br-sm bg-accent text-foreground"
          : "mr-auto rounded-bl-sm border border-border bg-card text-card-foreground",
        failed && "border border-destructive/60",
        className,
      )}
    >
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
          outbound ? "text-right" : "text-left",
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
    </div>
  );
}
