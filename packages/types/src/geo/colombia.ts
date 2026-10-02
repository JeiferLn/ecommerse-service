import colombia from "../data/colombia.json";

/** Catálogo de ubicación para Colombia (departamento → municipio). */
export const COLOMBIA_GEO: Readonly<Record<string, readonly string[]>> = colombia.municipalities;

export const COLOMBIA_DEPARTMENTS: readonly string[] = colombia.departments;

export function getColombiaMunicipalities(department: string): readonly string[] {
  return COLOMBIA_GEO[department] ?? [];
}

export function isValidColombiaLocation(department: string, municipality: string): boolean {
  const list = getColombiaMunicipalities(department);
  return list.some((item) => item.toLowerCase() === municipality.trim().toLowerCase());
}
