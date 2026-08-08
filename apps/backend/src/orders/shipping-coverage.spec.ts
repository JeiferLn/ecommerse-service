import {
  citiesMatch,
  describeShippingCoverage,
  resolveCountryCode,
  validateShippingCoverage,
} from "./shipping-coverage";

describe("shipping-coverage", () => {
  it("normaliza ciudades con tildes y alias", () => {
    expect(citiesMatch("Bogotá", "bogota")).toBe(true);
    expect(citiesMatch("Santiago de Cali", "Cali")).toBe(true);
    expect(citiesMatch("Bogotá", "Cali")).toBe(false);
  });

  it("resuelve país por código o nombre", () => {
    expect(resolveCountryCode("co")).toBe("CO");
    expect(resolveCountryCode("Colombia")).toBe("CO");
  });

  it("permite local solo en la misma ciudad", () => {
    expect(
      validateShippingCoverage({
        companyCountryCode: "CO",
        companyCity: "Bogotá",
        shippingScopes: ["local"],
        destinationCountry: "CO",
        destinationCity: "Bogotá",
      }),
    ).toBeNull();

    expect(
      validateShippingCoverage({
        companyCountryCode: "CO",
        companyCity: "Bogotá",
        shippingScopes: ["local"],
        destinationCountry: "Colombia",
        destinationCity: "Cali",
      }),
    ).toMatch(/solo hace envíos locales en Bogotá/i);
  });

  it("permite nacional a otra ciudad del mismo país", () => {
    expect(
      validateShippingCoverage({
        companyCountryCode: "CO",
        companyCity: "Bogotá",
        shippingScopes: ["local", "national"],
        destinationCountry: "CO",
        destinationCity: "Cali",
      }),
    ).toBeNull();
  });

  it("bloquea internacional sin alcance", () => {
    expect(
      validateShippingCoverage({
        companyCountryCode: "CO",
        companyCity: "Bogotá",
        shippingScopes: ["local", "national"],
        destinationCountry: "MX",
        destinationCity: "CDMX",
      }),
    ).toMatch(/no hace envíos internacionales/i);
  });

  it("describe cobertura local", () => {
    expect(
      describeShippingCoverage({
        countryCode: "CO",
        shippingRegion: "Bogotá, D.C.",
        shippingCity: "Bogotá",
        shippingScopes: ["local"],
      }),
    ).toMatch(/Solo envíos locales en Bogotá \(Bogotá, D\.C\.\)/);
  });
});
