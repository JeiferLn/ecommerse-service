import { NextRequest, NextResponse } from "next/server";
import { clearAuthCookies } from "@/lib/auth";
import {
  AUTH_COOKIE,
  AUTH_ROUTES,
  PRIVATE_PREFIXES,
  ROUTES,
  homePathByRole,
} from "@/lib/routes";
import {
  REFRESH_COOKIE,
  applyAuthCookies,
  requestTokenRefresh,
  verifyAccessToken,
} from "@/lib/session";

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

function isApiRoute(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isApiRoute(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  const isPrivate = isPrivateRoute(pathname);
  const isAuth = isAuthRoute(pathname);

  let payload = token ? await verifyAccessToken(token) : null;
  let refreshedTokens = null;

  if (!payload && refreshToken && (isPrivate || isAuth)) {
    refreshedTokens = await requestTokenRefresh(refreshToken);
    if (refreshedTokens) {
      payload = await verifyAccessToken(refreshedTokens.accessToken);
    }
  }

  if (isPrivate) {
    if (!payload) {
      const loginUrl = new URL(ROUTES.login, request.url);
      loginUrl.searchParams.set("next", pathname);
      return clearAuthCookies(NextResponse.redirect(loginUrl));
    }

    const role = payload.role;
    let response: NextResponse;

    if (pathname.startsWith(ROUTES.admin) && role !== "ADMIN") {
      response = NextResponse.redirect(
        new URL(ROUTES.dashboard, request.url),
      );
    } else if (
      pathname.startsWith(ROUTES.dashboard) &&
      role === "ADMIN"
    ) {
      response = NextResponse.redirect(new URL(ROUTES.admin, request.url));
    } else {
      response = NextResponse.next();
    }

    return refreshedTokens
      ? applyAuthCookies(response, refreshedTokens)
      : response;
  }

  if (isAuth) {
    if (!payload) {
      return NextResponse.next();
    }

    const home = homePathByRole(payload.role);
    return refreshedTokens
      ? applyAuthCookies(NextResponse.redirect(new URL(home, request.url)), refreshedTokens)
      : NextResponse.redirect(new URL(home, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
