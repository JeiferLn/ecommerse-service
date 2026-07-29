export const AUTH_COOKIE = "token";

export const ROUTES = {
  home: "/",
  login: "/login",
  register: "/register",
  dashboard: "/dashboard",
} as const;

export const AUTH_ROUTES = [ROUTES.login, ROUTES.register] as const;

export const PRIVATE_PREFIXES = ["/dashboard"] as const;
