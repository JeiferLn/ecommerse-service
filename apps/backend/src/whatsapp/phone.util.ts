/**
 * Normaliza números WhatsApp a E.164 con + (sin prefijo whatsapp:).
 * Acepta: whatsapp:+57…, +57…, 57… (si ya trae + se conserva).
 */
export function normalizeWhatsAppE164(raw: string): string {
  let value = raw.trim();
  if (value.toLowerCase().startsWith("whatsapp:")) {
    value = value.slice("whatsapp:".length).trim();
  }
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  return `+${digits}`;
}

export function toTwilioWhatsAppAddress(e164: string): string {
  const normalized = normalizeWhatsAppE164(e164);
  return `whatsapp:${normalized}`;
}
