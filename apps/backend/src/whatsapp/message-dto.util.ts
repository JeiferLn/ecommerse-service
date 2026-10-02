import type { MessageInteractive, WhatsAppMessage } from "@commerce-ai/types";
import type { Message } from "@prisma/client";

const INTERACTIVE_KINDS = new Set(["buttons", "list", "product_card", "link_button", "reply"]);

/** Lee `Message.interactive` (Json) descartando valores que no tengan una forma conocida. */
export function parseInteractive(value: unknown): MessageInteractive | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === "string" && INTERACTIVE_KINDS.has(kind)
    ? (value as MessageInteractive)
    : null;
}

/** `mapImageUrl` reescribe las URLs de imagen (fotos enviadas y tarjetas) para el navegador. */
export function toWhatsAppMessageDto(
  message: Pick<
    Message,
    | "id"
    | "conversationId"
    | "direction"
    | "wamid"
    | "type"
    | "body"
    | "status"
    | "interactive"
    | "createdAt"
  >,
  mapImageUrl: (url: string) => string = (url) => url,
): WhatsAppMessage {
  const interactive = parseInteractive(message.interactive);
  return {
    id: message.id,
    conversationId: message.conversationId,
    direction: message.direction,
    wamid: message.wamid,
    type: message.type,
    body: message.type === "image" ? mapImageUrl(message.body) : message.body,
    status: message.status,
    interactive:
      interactive?.kind === "product_card" && interactive.imageUrl
        ? { ...interactive, imageUrl: mapImageUrl(interactive.imageUrl) }
        : interactive,
    createdAt: message.createdAt.toISOString(),
  };
}
