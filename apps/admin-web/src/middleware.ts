import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/session";

const PRIVATE_ROUTES = ["/dashboard"];
const AUTH_ROUTES = ["/login", "/register", "/forgot-password"];

function matches(pathname: string, routes: string[]): boolean {
  return routes.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasToken = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (matches(pathname, PRIVATE_ROUTES) && !hasToken) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (matches(pathname, AUTH_ROUTES) && hasToken) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/login", "/register/:path*", "/forgot-password"],
};
