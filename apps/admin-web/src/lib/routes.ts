export const AUTH_COOKIE = "token";
export const ROLE_COOKIE = "role";

export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  dashboard: "/dashboard",
  team: "/dashboard/team",
  settings: "/dashboard/settings",
  products: "/dashboard/products",
  productsNew: "/dashboard/products/new",
  admin: "/admin",
  invite: "/invite",
} as const;

export const AUTH_ROUTES = [ROUTES.login, ROUTES.register] as const;

export const PRIVATE_PREFIXES = [ROUTES.dashboard, ROUTES.admin] as const;

export type AppRole = "ADMIN" | "OWNER" | "MEMBER";

export function homePathByRole(role: string | undefined | null) {
  return role === "ADMIN" ? ROUTES.admin : ROUTES.dashboard;
}

export const COMPANY_TYPES = [
  { value: "RETAIL", label: "Retail / Comercio" },
  { value: "WHOLESALE", label: "Mayorista" },
  { value: "SERVICES", label: "Servicios" },
  { value: "FOOD_BEVERAGE", label: "Alimentos y bebidas" },
  { value: "HEALTH_BEAUTY", label: "Salud y belleza" },
  { value: "TECHNOLOGY", label: "Tecnología" },
  { value: "OTHER", label: "Otro" },
] as const;
