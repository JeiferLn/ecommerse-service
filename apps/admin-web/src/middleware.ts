import { NextResponse, type NextRequest } from "next/server";

import { homePathForRole } from "@/lib/home-path";
import { SESSION_COOKIE } from "@/lib/session";
import { verifyAccessToken } from "@/lib/verify-access-token";

const PRIVATE_ROUTES = ["/dashboard", "/admin"];
const AUTH_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password"];

function matches(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const claims = token ? await verifyAccessToken(token) : null;
  const hasValidSession = Boolean(claims);

  if (matches(pathname, PRIVATE_ROUTES) && !hasValidSession) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    const response = NextResponse.redirect(url);
    if (token) {
      response.cookies.set(SESSION_COOKIE, "", { maxAge: 0, path: "/" });
    }
    return response;
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
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    if (matches(pathname, ["/dashboard"]) && claims.role === "admin") {
      return NextResponse.redirect(new URL("/admin", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/admin",
    "/admin/:path*",
    "/login",
    "/register",
    "/register/:path*",
    "/forgot-password",
    "/reset-password",
  ],
};
