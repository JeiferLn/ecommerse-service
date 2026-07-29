import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE,
  AUTH_ROUTES,
  PRIVATE_PREFIXES,
  ROLE_COOKIE,
  ROUTES,
  homePathByRole,
} from "@/lib/routes";

function isAuthRoute(pathname: string) {
  return AUTH_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function isPrivateRoute(pathname: string) {
  return PRIVATE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const role = request.cookies.get(ROLE_COOKIE)?.value;
  const isAuthenticated = Boolean(token);

  if (isPrivateRoute(pathname) && !isAuthenticated) {
    const loginUrl = new URL(ROUTES.login, request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated) {
    const home = homePathByRole(role);

    if (isAuthRoute(pathname)) {
      return NextResponse.redirect(new URL(home, request.url));
    }

    if (pathname.startsWith(ROUTES.admin) && role !== "ADMIN") {
      return NextResponse.redirect(new URL(ROUTES.dashboard, request.url));
    }

    if (
      pathname.startsWith(ROUTES.dashboard) &&
      role === "ADMIN"
    ) {
      return NextResponse.redirect(new URL(ROUTES.admin, request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
