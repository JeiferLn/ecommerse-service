export type ConversationHandlerMode = "pending" | "bot" | "human";

/** Detecta si el cliente pide un asesor / persona real. */
export function detectsHumanRequest(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return (
    /\basesor(es|a)?\b/.test(normalized) ||
    /\bpersona\s+real\b/.test(normalized) ||
    /\bhumano\b/.test(normalized) ||
    /\batencion\s+humana\b/.test(normalized) ||
    /\bhablar\s+con\s+(alguien|una\s+persona|un\s+asesor)\b/.test(normalized) ||
    /\bpasame\s+con\b/.test(normalized) ||
    /\bpasa(me)?\s+con\s+(un\s+)?asesor\b/.test(normalized)
  );
}

/** Detecta si el cliente elige el bot / asistente virtual. */
export function detectsBotChoice(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

  if (detectsHumanRequest(normalized)) {
    return false;
  }

  return (
    /^(bot|asistente|ia|virtual)[!?.]*$/i.test(normalized) ||
    /\b(el\s+)?bot\b/.test(normalized) ||
    /\basistente(\s+virtual)?\b/.test(normalized) ||
    /\bautomatico\b/.test(normalized) ||
    /\binteligencia\s+artificial\b/.test(normalized)
  );
}
