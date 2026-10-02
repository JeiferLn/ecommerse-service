export type OrderChatIntent =
  { type: "view_cart" } | { type: "clear_cart" } | { type: "checkout" } | { type: "add_to_cart" };

export function detectsViewCart(text: string): boolean {
  const normalized = normalize(text);
  return (
    /\b(ver|mostrar|mira(r)?)\s+(el\s+)?carrito\b/.test(normalized) ||
    normalized === "carrito" ||
    /\bmi carrito\b/.test(normalized)
  );
}

export function detectsClearCart(text: string): boolean {
  const normalized = normalize(text);
  return (
    /\b(vaciar|limpiar|borrar|eliminar)\s+(el\s+)?carrito\b/.test(normalized) ||
    normalized === "vaciar carrito"
  );
}

export function detectsCheckout(text: string): boolean {
  const normalized = normalize(text);
  return (
    /\b(confirmar|cerrar|finalizar)\s+(el\s+)?pedido\b/.test(normalized) ||
    /\bcheckout\b/.test(normalized) ||
    normalized === "confirmar pedido" ||
    normalized === "hacer pedido"
  );
}

/**
 * Consulta de catálogo / disponibilidad (no es comando de carrito).
 * Ej: "quiero una gorra, cuales tienes disponibles?"
 */
export function looksLikeCatalogInquiry(text: string): boolean {
  const normalized = normalize(text);
  return (
    /\b(cual|cuales)\b/.test(normalized) ||
    /\b(cuanto|cuantos|cuantas)\b/.test(normalized) ||
    /\b(disponible|disponibles|opcion|opciones|modelo|modelos|variante|variantes)\b/.test(
      normalized,
    ) ||
    /\b(tienen|tienes)\b/.test(normalized) ||
    /\bque\s+(tienen|tienes|hay|ofrecen|venden)\b/.test(normalized) ||
    /\b(hay|tienen|tienes)\s+\w+/.test(normalized) ||
    /\b(me\s+)?(muestran|muestra|ensenan|ensena)\b/.test(normalized) ||
    /\b(precio|precios|stock)\b/.test(normalized) ||
    /\b(quiero\s+ver|me\s+interesa|estoy\s+interesad)\b/.test(normalized) ||
    /\b(busco|buscando)\b/.test(normalized) ||
    normalized.includes("?")
  );
}

const SPANISH_QTY = "una|uno|un|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|\\d+";

/**
 * Intención de agregar al carrito / pedir el producto del contexto.
 * Consultas abiertas ("tienen gorras?", "quiero una gorra cuales tienes") NO cuentan.
 */
export function detectsAddToCart(text: string): boolean {
  const normalized = normalize(text);
  if (looksLikeCatalogInquiry(normalized)) {
    return false;
  }

  return (
    /\b(agregar|anadir|añadir|meter|sumar)\b/.test(normalized) ||
    /\bal carrito\b/.test(normalized) ||
    /\b(me llevo|compro)\s+\d*\s*\w+/.test(normalized) ||
    /\b(me\s+)?gustaria\s+pedir\b/.test(normalized) ||
    /\bquiero\s+pedir\b/.test(normalized) ||
    /\bpedir\s+(una|uno|unas|unos)\b/.test(normalized) ||
    /\b(la|lo)\s+quiero\b/.test(normalized) ||
    /\bme\s+la\s+llevo\b/.test(normalized) ||
    /\bdame\s+(una|uno|\d+)\b/.test(normalized) ||
    // "quiero 2", "quiero dos", "quiero una gorra"
    new RegExp(`\\bquiero\\s+(${SPANISH_QTY})\\b`).test(normalized) ||
    /^(quiero\s+(una|uno))(!|\.|$)/.test(normalized) ||
    /^quiero\s+(una|uno)\s+\w+(\s+\w+){0,3}$/.test(normalized)
  );
}

/** Confirmación corta ("sí", "dale") tras oferta del bot de agregar al carrito. */
export function detectsAffirmativeCartConfirm(text: string): boolean {
  const normalized = normalize(text);
  if (!normalized || normalized.length > 80) {
    return false;
  }
  if (detectsCheckout(normalized) || detectsClearCart(normalized) || detectsViewCart(normalized)) {
    return false;
  }
  return (
    /^(si|ok|dale|claro|va|perfecto|listo|de acuerdo|hazlo|agregalo|agregala|anadelo|añadelo)([!.]|$)/.test(
      normalized,
    ) ||
    /^(si|ok|dale|claro)\b.{0,40}\b(por favor|gracias|agrega|añade|anade|carrito)\b/.test(
      normalized,
    ) ||
    /^(si|ok)\b.{0,50}\bno\s+comprare?\b/.test(normalized)
  );
}

/** El bot ofreció / anunció agregar al carrito (aún sin hacerlo el sistema). */
export function botOfferedAddToCart(botText: string): boolean {
  const normalized = normalize(botText);
  return (
    /\bagreg(o|amos|are|aremos|aria)\b/.test(normalized) ||
    /\bañad(o|imos|ire|iremos)\b/.test(normalized) ||
    /\banad(o|imos|ire|iremos)\b/.test(normalized) ||
    /\bquieres que (te )?(la |lo |las |los )?(agreg|añad|anad)/.test(normalized) ||
    /\bte (la |lo )?agrego\b/.test(normalized) ||
    /\bponemos?\b.{0,30}\bcarrito\b/.test(normalized) ||
    /\bal carrito\b/.test(normalized)
  );
}

export function resolveOrderChatIntent(text: string): OrderChatIntent | null {
  if (detectsViewCart(text)) {
    return { type: "view_cart" };
  }
  if (detectsClearCart(text)) {
    return { type: "clear_cart" };
  }
  if (detectsCheckout(text)) {
    return { type: "checkout" };
  }
  if (detectsAddToCart(text)) {
    return { type: "add_to_cart" };
  }
  return null;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
