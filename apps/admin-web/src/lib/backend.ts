import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, ROLE_COOKIE } from "@/lib/routes";
import { setAuthCookies } from "@/lib/auth";
import {
  REFRESH_COOKIE,
  requestTokenRefresh,
  verifyAccessToken,
} from "@/lib/session";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

function buildHeaders(init: RequestInit, token: string) {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const isFormData =
    typeof FormData !== "undefined" && init.body instanceof FormData;
  if (init.body && !headers.has("Content-Type") && !isFormData) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function toResponse(upstream: Response): Promise<NextResponse> {
  const text = await upstream.text();
  return new NextResponse(text || null, {
    status: upstream.status,
    headers: {
      "Content-Type":
        upstream.headers.get("Content-Type") ?? "application/json",
    },
  });
}

function unauthorized(message: string): NextResponse {
  const res = NextResponse.json({ message }, { status: 401 });
  res.cookies.set(AUTH_COOKIE, "", { maxAge: 0, path: "/" });
  res.cookies.set(REFRESH_COOKIE, "", { maxAge: 0, path: "/" });
  res.cookies.set(ROLE_COOKIE, "", { maxAge: 0, path: "/" });
  return res;
}

async function tryRefresh(): Promise<string | null> {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!refreshToken) {
    return null;
  }

  const tokens = await requestTokenRefresh(refreshToken);
  if (!tokens) {
    return null;
  }

  const payload = await verifyAccessToken(tokens.accessToken);
  await setAuthCookies(
    tokens.accessToken,
    tokens.refreshToken,
    payload?.role ?? cookieStore.get(ROLE_COOKIE)?.value ?? "",
  );

  return tokens.accessToken;
}

export async function backendFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;

  if (!token) {
    return unauthorized("No autenticado");
  }

  const upstream = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: buildHeaders(init, token),
  });

  if (upstream.status === 401) {
    const newToken = await tryRefresh();
    if (newToken) {
      const retry = await fetch(`${API_URL}${path}`, {
        ...init,
        headers: buildHeaders(init, newToken),
      });
      return toResponse(retry);
    }

    return unauthorized("Sesión expirada");
  }

  return toResponse(upstream);
}
