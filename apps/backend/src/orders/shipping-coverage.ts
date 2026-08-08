import type { ShippingScope } from "@commerce-ai/types";
import { COMPANY_COUNTRIES, SHIPPING_SCOPE_LABELS } from "@commerce-ai/types";

/** Alias comunes (sin tildes) → forma canónica. */
const CITY_ALIAQUES: Record<string, string> = {
  bogota: "bogota",
  "bogota d c": "bogota",
  "bogota dc": "bogota",
  "santa fe de bogota": "bogota",
  cali: "cali",
  "santiago de cali": "cali",
  medellin: "medellin",
  "ciudad de mexico": "ciudad de mexico",
  cdmx: "ciudad de mexico",
  "mexico city": "ciudad de mexico",
};

export function normalizePlaceName(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalCityName(value: string): string {
  const normalized = normalizePlaceName(value);
  return CITY_ALIAQUES[normalized] ?? normalized;
}

export function citiesMatch(a: string, b: string): boolean {
  const left = canonicalCityName(a);
  const right = canonicalCityName(b);
  if (!left || !right) {
    return false;
  }
  return left === right || left.includes(right) || right.includes(left);
}

export function resolveCountryCode(input: string): string | null {
  const raw = input.trim();
  if (!raw) {
    return null;
  }
  if (/^[A-Za-z]{2}$/.test(raw)) {
    return raw.toUpperCase();
  }
  const normalized = normalizePlaceName(raw);
  const match = COMPANY_COUNTRIES.find(
    (country) => normalizePlaceName(country.name) === normalized || country.code.toLowerCase() === normalized,
  );
  return match?.code ?? null;
}

export function countryDisplayName(code: string | null | undefined): string {
  if (!code) {
    return "";
  }
  return COMPANY_COUNTRIES.find((country) => country.code === code)?.name ?? code;
}

export function describeShippingCoverage(params: {
  countryCode: string | null;
  shippingRegion?: string | null;
  shippingCity: string | null;
  shippingScopes: readonly string[];
}): string {
  const scopes = params.shippingScopes as ShippingScope[];
  const country = countryDisplayName(params.countryCode) || "tu país";
  const city = params.shippingCity?.trim();
  const region = params.shippingRegion?.trim();
  const place = city && region ? `${city} (${region})` : city || region;
  const labels = scopes.map((scope) => SHIPPING_SCOPE_LABELS[scope] ?? scope);

  if (scopes.includes("international") && scopes.includes("national") && scopes.includes("local")) {
    return `Envíos locales${place ? ` en ${place}` : ""}, nacionales en ${country} e internacionales.`;
  }
  if (scopes.includes("national") && scopes.includes("local")) {
    return `Envíos locales${place ? ` en ${place}` : ""} y nacionales en ${country}.`;
  }
  if (scopes.includes("local") && !scopes.includes("national") && !scopes.includes("international")) {
    return place
      ? `Solo envíos locales en ${place} (${country}).`
      : `Solo envíos locales en el municipio de la tienda (${country}).`;
  }
  if (scopes.includes("national") && !scopes.includes("international")) {
    return `Envíos nacionales en ${country}${place ? ` (base: ${place})` : ""}.`;
  }
  if (scopes.includes("international")) {
    return `Envíos internacionales${place ? ` desde ${place}` : ""}.`;
  }
  return labels.length > 0 ? `Cobertura: ${labels.join(", ")}.` : "Sin cobertura de envío configurada.";
}

export type ShippingCoverageInput = {
  companyCountryCode: string | null;
  companyCity: string | null;
  shippingScopes: readonly string[];
  destinationCountry: string;
  destinationCity: string;
};

/**
 * Valida si el destino del cliente está cubierto por los alcances de la tienda.
 * @returns null si OK, o mensaje de error en español.
 */
export function validateShippingCoverage(input: ShippingCoverageInput): string | null {
  const scopes = new Set(input.shippingScopes);
  if (scopes.size === 0) {
    return "La tienda aún no tiene cobertura de envío configurada.";
  }

  const companyCountry = input.companyCountryCode?.trim().toUpperCase() || null;
  const destCountry = resolveCountryCode(input.destinationCountry);
  if (!destCountry) {
    return "Indica un país de destino válido.";
  }

  const destCity = input.destinationCity.trim();
  if (!destCity) {
    return "Indica la ciudad de destino.";
  }

  if (!companyCountry) {
    return "La tienda no tiene país de operación configurado.";
  }

  const sameCountry = destCountry === companyCountry;
  const companyCity = input.companyCity?.trim() || null;
  const sameCity = companyCity ? citiesMatch(destCity, companyCity) : false;

  if (!sameCountry) {
    if (!scopes.has("international")) {
      return `Esta tienda no hace envíos internacionales. Solo opera en ${countryDisplayName(companyCountry)}.`;
    }
    return null;
  }

  // Mismo país
  if (sameCity) {
    if (scopes.has("local") || scopes.has("national")) {
      return null;
    }
    return `No hay cobertura de envío configurada para ${companyCity ?? destCity}.`;
  }

  // Misma país, otra ciudad → necesita nacional
  if (scopes.has("national")) {
    return null;
  }

  if (scopes.has("local")) {
    return companyCity
      ? `Esta tienda solo hace envíos locales en ${companyCity}. No enviamos a ${destCity}.`
      : `Esta tienda solo hace envíos locales en su ciudad. No enviamos a ${destCity}.`;
  }

  return "El destino indicado no está dentro de la cobertura de envío de la tienda.";
}
