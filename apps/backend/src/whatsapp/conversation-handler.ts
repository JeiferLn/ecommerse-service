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

/**
 * Si el mensaje elige bot y además trae una pregunta
 * (ej. "bot, qué productos tienen"), devuelve solo la pregunta residual.
 */
export function extractResidualAfterBotChoice(text: string): string | null {
  if (!detectsBotChoice(text)) {
    return null;
  }

  const residual = text
    .replace(/\binteligencia\s+artificial\b/gi, " ")
    .replace(/\basistente(\s+virtual)?\b/gi, " ")
    .replace(/\b(el\s+)?bot\b/gi, " ")
    .replace(/\bautomatico\b/gi, " ")
    .replace(/\b\bia\b/gi, " ")
    .replace(/\bvirtual\b/gi, " ")
    .replace(/\bpor\s+favor\b/gi, " ")
    .replace(/\bdisculpa(me|le)?\b/gi, " ")
    .replace(/^[,.:;!?\-\s]+/, "")
    .replace(/[,.:;!?\-\s]+$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (!residual || residual.length < 3) {
    return null;
  }

  // Si tras limpiar sigue siendo solo elección, no hay pregunta.
  if (detectsBotChoice(residual) && residual.split(/\s+/).length <= 3) {
    return null;
  }

  return residual;
}
