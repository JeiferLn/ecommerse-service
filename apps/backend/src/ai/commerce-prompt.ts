import {
  COMPANY_COUNTRIES,
  isCompanyCommerceConfigured,
  PAYMENT_METHOD_LABELS,
  SHIPPING_SCOPE_LABELS,
  type PaymentMethod,
  type ShippingScope,
} from "@commerce-ai/types";

export function formatCommercePromptBlock(company: {
  countryCode: string | null;
  shippingScopes: string[];
  paymentMethods: string[];
  shippingCarriers: string[];
  banks: string[];
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
  const payments = company.paymentMethods
    .map((method) => PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method)
    .join(", ");

  return {
    configured: true,
    block: [
      `- País de la tienda: ${countryName}`,
      `- Alcance de envíos: ${scopes}`,
      `- Transportadoras: ${company.shippingCarriers.join(", ")}`,
      `- Métodos de pago: ${payments}`,
      company.banks.length > 0
        ? `- Bancos / medios para transferencia: ${company.banks.join(", ")}`
        : null,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}
