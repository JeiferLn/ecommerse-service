import {
  COMPANY_COUNTRIES,
  isCompanyCommerceConfigured,
  SHIPPING_SCOPE_LABELS,
  type ShippingScope,
} from "@commerce-ai/types";

export function formatCommercePromptBlock(company: {
  countryCode: string | null;
  shippingRegion?: string | null;
  shippingCity?: string | null;
  shippingScopes: string[];
  shippingCarriers: string[];
}): { configured: boolean; block: string } {
  const configured = isCompanyCommerceConfigured(company);
  if (!configured) {
    return { configured: false, block: "(sin configurar)" };
  }

  const countryName =
    COMPANY_COUNTRIES.find((item) => item.code === company.countryCode)?.name ??
    company.countryCode;

  const scopes = company.shippingScopes
    .map((scope) => SHIPPING_SCOPE_LABELS[scope as ShippingScope] ?? scope)
    .join(", ");

  const locationParts = [company.shippingCity?.trim(), company.shippingRegion?.trim()].filter(
    Boolean,
  );
  const cityLine =
    locationParts.length > 0
      ? `- Ubicación base de la tienda: ${locationParts.join(", ")}`
      : null;

  return {
    configured: true,
    block: [
      `- País de la tienda: ${countryName}`,
      ...(cityLine ? [cityLine] : []),
      `- Alcance de envíos: ${scopes}`,
      `- Transportadoras: ${company.shippingCarriers.join(", ")}`,
      "- Pago: se procesa por pasarela de la plataforma (no ofrezcas transferencias, tarjetas ni contraentrega como métodos de la tienda).",
      "- Si solo hay alcance local, NO digas que envían a otras ciudades del país.",
    ].join("\n"),
  };
}
