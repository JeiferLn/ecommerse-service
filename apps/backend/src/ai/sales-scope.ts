/**
 * Heurísticas para mantener al bot en ventas (no asistente general).
 * Conservadoras a propósito: mejor dejar pasar un caso dudoso al modelo
 * que bloquear una consulta legítima de producto.
 */

const OFF_TOPIC_PATTERNS: RegExp[] = [
  /\bhola\s*mundo\b/,
  /\bhello\s*world\b/,
  /\bprint\s*\(/,
  /\bconsole\.log\b/,
  /\bdef\s+[a-z_]\w*\s*\(/,
  /\bfunction\s+[a-z_]\w*\s*\(/,
  /\b```(?:python|javascript|js|ts|java|html|css|sql|bash)?/,
  /\b(programa|codigo|script|funcion)\s+(en\s+)?(python|javascript|java|typescript|c\+\+|php|ruby|go|rust)\b/,
  /\b(hazme|escribe|genera|crea|dame)\s+(un\s+)?(programa|codigo|script|funcion|clase)\b/,
  /\b(hazme|escribe|genera|crea|dame)\s+(un\s+)?hola\s*mundo\b/,
  /\b(aprende|tutorial|ejercicio)\s+(de\s+)?(python|programacion|javascript|java)\b/,
  /\bresolveme\s+(esta\s+)?(tarea|ecuacion|integral)\b/,
  /\b(inventa|escribe)\s+(un\s+)?(cuento|poema|ensayo|historia)\b/,
];

const OFF_TOPIC_REPLY_PATTERNS: RegExp[] = [
  /```[\s\S]*```/,
  /\bprint\s*\(/,
  /\bconsole\.log\b/,
  /###\s*¿?c[oó]mo funciona/,
  /###\s*¿?c[oó]mo ejecutarlo/,
  /\bpython\s+hola_mundo\.py\b/,
  /\bdef\s+[a-z_]\w*\s*\(/,
];

export function normalizeForScopeCheck(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** True si el mensaje del cliente es claramente ajeno a ventas. */
export function isClearlyOffTopicSalesQuery(customerText: string): boolean {
  const normalized = normalizeForScopeCheck(customerText);
  if (normalized.length < 4) {
    return false;
  }
  return OFF_TOPIC_PATTERNS.some((pattern) => pattern.test(normalized));
}

/** True si la respuesta del modelo parece un tutorial / código genérico. */
export function looksLikeOffTopicAssistantReply(reply: string): boolean {
  const normalized = normalizeForScopeCheck(reply);
  if (normalized.length < 40) {
    return false;
  }
  const hits = OFF_TOPIC_REPLY_PATTERNS.filter((pattern) => pattern.test(normalized)).length;
  return hits >= 1 && (reply.includes("```") || hits >= 2 || /\bprint\s*\(/.test(normalized));
}

export function buildSalesScopeRedirect(companyName: string): string {
  const name = companyName.trim() || "nuestra tienda";
  return `Solo puedo ayudarte con productos, pedidos y políticas de ${name}. ¿Buscas algo de nuestro catálogo?`;
}
