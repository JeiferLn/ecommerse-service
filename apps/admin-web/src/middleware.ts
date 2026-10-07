import { NextResponse, type NextRequest } from "next/server";

import { homePathForRole } from "@/lib/home-path";
import { SESSION_COOKIE } from "@/lib/session";
import { verifyAccessToken } from "@/lib/verify-access-token";

/** Rutas de la app de empresa (sin `/admin`). */
const COMPANY_ROUTES = [
  "/overview",
  "/products",
  "/categories",
  "/sales",
  "/orders",
  "/whatsapp",
  "/members",
  "/billing",
  "/settings",
  "/knowledge",
  "/assistant",
];

const PRIVATE_ROUTES = [...COMPANY_ROUTES, "/admin"];
const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];
const PUBLIC_ROUTES = ["/", "/pricing", "/terms", "/checkout", "/session-refresh"];

function matches(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;
  const hasValidSession = Boolean(claims);

  // URLs antiguas `/dashboard` → sin prefijo.
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    const stripped =
      pathname === "/dashboard" ? "/" : pathname.replace(/^\/dashboard/, "") || "/";
    const url = request.nextUrl.clone();
    url.pathname = stripped;
    return NextResponse.redirect(url);
  }

  // `/` = landing pública o overview (rewrite) según sesión.
  if (pathname === "/") {
    if (hasValidSession && claims) {
      if (claims.role === "admin") {
        return NextResponse.redirect(new URL("/admin", request.url));
      }
      return NextResponse.rewrite(new URL("/overview", request.url));
    }
    return NextResponse.next();
  }

  // Overview canónico es `/`; `/overview` exacto con sesión redirige ahí.
  if (pathname === "/overview" && hasValidSession) {
    if (claims?.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  // Access expirado/ausente: intentar refresh en el cliente antes de echar a login.
  if (matches(pathname, PRIVATE_ROUTES) && !hasValidSession) {
    const url = new URL("/session-refresh", request.url);
    const next = `${pathname}${request.nextUrl.search}`;
    url.searchParams.set("next", next);
    return NextResponse.redirect(url);
  }

  if (
    matches(pathname, AUTH_ROUTES) &&
    hasValidSession &&
    claims &&
    !pathname.startsWith("/register/invitation")
  ) {
    return NextResponse.redirect(new URL(homePathForRole(claims.role), request.url));
  }

  if (hasValidSession && claims) {
    if (matches(pathname, ["/admin"]) && claims.role !== "admin") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    if (matches(pathname, COMPANY_ROUTES) && claims.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  const isKnown =
    matches(pathname, PUBLIC_ROUTES) ||
    matches(pathname, PRIVATE_ROUTES) ||
    matches(pathname, AUTH_ROUTES) ||
    pathname === "/overview" ||
    pathname.startsWith("/overview/");

  if (!isKnown) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
