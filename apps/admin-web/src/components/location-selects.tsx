"use client";

import { COMPANY_COUNTRIES } from "@commerce-ai/types";
import { City, State } from "country-state-city";
import { useMemo } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type LocationValue = {
  countryCode: string;
  /** Nombre del estado/departamento (se guarda en DB). */
  region: string;
  /** ISO del estado (para cargar ciudades); opcional al hidratar desde DB. */
  regionCode?: string;
  city: string;
};

type LocationSelectsProps = {
  idPrefix: string;
  value: LocationValue;
  onChange: (next: LocationValue) => void;
  disabled?: boolean;
  required?: boolean;
  variant?: "company" | "customer";
  /** Si true, el país no se puede cambiar (ya fijado en el registro). */
  lockCountry?: boolean;
  /** Los tres campos en una fila desde `sm`. */
  inline?: boolean;
};

function resolveRegionCode(countryCode: string, regionName: string, regionCode?: string): string {
  if (regionCode) {
    return regionCode;
  }
  if (!countryCode || !regionName) {
    return "";
  }
  const match = State.getStatesOfCountry(countryCode).find(
    (state) => state.name.toLowerCase() === regionName.toLowerCase(),
  );
  return match?.isoCode ?? "";
}

export function LocationSelects({
  idPrefix,
  value,
  onChange,
  disabled = false,
  required = false,
  variant = "customer",
  lockCountry = false,
  inline = false,
}: LocationSelectsProps) {
  const states = useMemo(
    () =>
      value.countryCode
        ? [...State.getStatesOfCountry(value.countryCode)].sort((a, b) =>
            a.name.localeCompare(b.name, "es"),
          )
        : [],
    [value.countryCode],
  );

  const regionCode = resolveRegionCode(value.countryCode, value.region, value.regionCode);

  const cities = useMemo(() => {
    if (!value.countryCode || !regionCode) {
      return [];
    }
    return [...City.getCitiesOfState(value.countryCode, regionCode)].sort((a, b) =>
      a.name.localeCompare(b.name, "es"),
    );
  }, [value.countryCode, regionCode]);

  const countryLabel = variant === "company" && !inline ? "País de la tienda" : "País";
  const regionLabel = inline
    ? "Departamento"
    : variant === "company"
      ? "Departamento / estado de la tienda"
      : "Departamento / estado";
  const cityLabel = inline
    ? "Municipio"
    : variant === "company"
      ? "Municipio / ciudad de la tienda"
      : "Municipio / ciudad";
  const lockHint = lockCountry ? (
    <p className="text-xs text-muted-foreground">
      El país se definió al registrarte. Aquí solo configuras departamento y municipio.
    </p>
  ) : null;

  const regionSelectValue =
    states.find((state) => state.name === value.region)?.isoCode ||
    states.find((state) => state.isoCode === regionCode)?.isoCode ||
    undefined;

  const hasStates = states.length > 0;
  const hasCities = cities.length > 0;

  return (
    <div className="flex flex-col gap-2">
      <div className={inline ? "grid gap-4 sm:grid-cols-3" : "flex flex-col gap-4"}>
        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${idPrefix}-country`}>{countryLabel}</Label>
          <Select
            value={value.countryCode || undefined}
            onValueChange={(countryCode) =>
              onChange({ countryCode, region: "", regionCode: "", city: "" })
            }
            disabled={disabled || lockCountry}
            required={required}
          >
            <SelectTrigger
              id={`${idPrefix}-country`}
              aria-label={countryLabel}
              className={inline ? "w-full" : undefined}
            >
              <SelectValue placeholder="Selecciona el país" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {COMPANY_COUNTRIES.map((country) => (
                <SelectItem key={country.code} value={country.code}>
                  {country.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {inline ? null : lockHint}
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${idPrefix}-region`}>{regionLabel}</Label>
          <Select
            value={regionSelectValue}
            onValueChange={(isoCode) => {
              const state = states.find((item) => item.isoCode === isoCode);
              onChange({
                ...value,
                region: state?.name ?? isoCode,
                regionCode: isoCode,
                city: "",
              });
            }}
            disabled={disabled || !value.countryCode || !hasStates}
            required={required}
          >
            <SelectTrigger
              id={`${idPrefix}-region`}
              aria-label={regionLabel}
              className={inline ? "w-full" : undefined}
            >
              <SelectValue
                placeholder={
                  !value.countryCode
                    ? "Elige país primero"
                    : hasStates
                      ? inline
                        ? "Selecciona"
                        : "Selecciona departamento / estado"
                      : "Sin divisiones disponibles"
                }
              />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {states.map((state) => (
                <SelectItem key={state.isoCode} value={state.isoCode}>
                  {state.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-w-0 flex-col gap-2">
          <Label htmlFor={`${idPrefix}-city`}>{cityLabel}</Label>
          {hasCities ? (
            <Select
              value={value.city || undefined}
              onValueChange={(city) => onChange({ ...value, city })}
              disabled={disabled || !regionCode}
              required={required}
            >
              <SelectTrigger
                id={`${idPrefix}-city`}
                aria-label={cityLabel}
                className={inline ? "w-full" : undefined}
              >
                <SelectValue
                  placeholder={inline ? "Selecciona" : "Selecciona municipio / ciudad"}
                />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {cities.map((city) => (
                  <SelectItem key={`${city.name}-${city.latitude}`} value={city.name}>
                    {city.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              id={`${idPrefix}-city`}
              value={value.city}
              disabled={disabled || !value.region}
              required={required}
              placeholder={
                value.region
                  ? inline
                    ? "Escribe el municipio"
                    : "Escribe el municipio / ciudad"
                  : inline
                    ? "Primero el departamento"
                    : "Elige departamento primero"
              }
              onChange={(event) => onChange({ ...value, city: event.target.value })}
            />
          )}
        </div>
      </div>
      {inline ? lockHint : null}
    </div>
  );
}
