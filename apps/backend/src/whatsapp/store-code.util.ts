/** Códigos de 3–30 caracteres: letras, números y guiones internos. */
const STORE_CODE_IN_TEXT = /#([a-z0-9][a-z0-9-]{1,28}[a-z0-9])\b/i;

/** "Tienda Ñandú & Co." → "tienda-nandu-co" (3–24 caracteres; deja sitio para un sufijo). */
export function slugifyStoreCode(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24)
    .replace(/-+$/g, "");
  return slug.length >= 3 ? slug : `tienda${slug ? `-${slug}` : ""}`;
}

/** Busca `#codigo` en el mensaje y devuelve el código en minúsculas y el texto sin él. */
export function extractStoreCode(text: string): { code: string | null; rest: string } {
  const match = STORE_CODE_IN_TEXT.exec(text);
  if (!match?.[1]) {
    return { code: null, rest: text.trim() };
  }
  const rest = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`
    .replace(/\s+/g, " ")
    .trim();
  return { code: match[1].toLowerCase(), rest };
}

export function buildWaMeLink(params: {
  number: string;
  storeCode?: string | null;
  storeName?: string | null;
}): string | null {
  const digits = params.number.replace(/\D/g, "");
  if (!digits) {
    return null;
  }
  if (!params.storeCode) {
    return `https://wa.me/${digits}`;
  }
  const greeting = params.storeName?.trim() ? `Hola ${params.storeName.trim()}` : "Hola";
  return `https://wa.me/${digits}?text=${encodeURIComponent(`${greeting} #${params.storeCode}`)}`;
}
