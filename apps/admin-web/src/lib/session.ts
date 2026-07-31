import { jwtVerify } from "jose";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, ROLE_COOKIE, type AppRole } from "@/lib/routes";

export const REFRESH_COOKIE = "refresh_token";

export const ACCESS_COOKIE_MAX_AGE = 60 * 15;
export const REFRESH_COOKIE_MAX_AGE = 60 * 60 * 24 * 7;

export const AUTH_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
} as const;

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const JWT_SECRET = process.env.JWT_ACCESS_SECRET
  ? new TextEncoder().encode(process.env.JWT_ACCESS_SECRET)
  : null;

export type SessionPayload = {
  sub: string;
  email: string;
  role: AppRole;
  companyId: string | null;
};

export async function verifyAccessToken(
  token: string,
): Promise<SessionPayload | null> {
  if (!JWT_SECRET) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.role !== "string"
    ) {
      return null;
    }

    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role as AppRole,
      companyId:
        typeof payload.companyId === "string" ? payload.companyId : null,
    };
  } catch {
    return null;
  }
}

export type RefreshResult = {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

export async function applyAuthCookies(
  response: NextResponse,
  tokens: RefreshResult,
): Promise<NextResponse> {
  const payload = await verifyAccessToken(tokens.accessToken);
  const role = payload?.role ?? "MEMBER";

  response.cookies.set(AUTH_COOKIE, tokens.accessToken, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });
  response.cookies.set(REFRESH_COOKIE, tokens.refreshToken, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
  response.cookies.set(ROLE_COOKIE, role, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });

  return response;
}

const refreshCache = new Map<string, Promise<RefreshResult | null>>();

export function requestTokenRefresh(
  refreshToken: string,
): Promise<RefreshResult | null> {
  const cached = refreshCache.get(refreshToken);
  if (cached) {
    return cached;
  }

  const promise = (async () => {
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });

      if (!res.ok) {
        return null;
      }

      const data = (await res.json()) as Partial<RefreshResult>;
      if (!data.accessToken || !data.refreshToken) {
        return null;
      }

      return data as RefreshResult;
    } catch {
      return null;
    } finally {
      refreshCache.delete(refreshToken);
    }
  })();

  refreshCache.set(refreshToken, promise);
  return promise;
}
