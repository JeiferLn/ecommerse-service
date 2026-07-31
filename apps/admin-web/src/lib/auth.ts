import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, ROLE_COOKIE, type AppRole } from "@/lib/routes";
import {
  ACCESS_COOKIE_MAX_AGE,
  AUTH_COOKIE_OPTIONS,
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE,
} from "@/lib/session";

export { REFRESH_COOKIE };

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

type AuthResponse = {
  user: {
    id: string;
    email: string;
    name: string;
    role: AppRole;
    companyId?: string | null;
    createdAt: string;
    company?: {
      id: string;
      name: string;
      type: string;
    } | null;
  };
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
};

export async function setAuthCookies(
  accessToken: string,
  refreshToken: string,
  role: string,
) {
  const cookieStore = await cookies();

  cookieStore.set(AUTH_COOKIE, accessToken, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: ACCESS_COOKIE_MAX_AGE,
  });

  cookieStore.set(REFRESH_COOKIE, refreshToken, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });

  cookieStore.set(ROLE_COOKIE, role, {
    ...AUTH_COOKIE_OPTIONS,
    maxAge: REFRESH_COOKIE_MAX_AGE,
  });
}

export async function clearAuthCookies(response?: NextResponse) {
  const expire = { maxAge: 0, path: "/" };

  if (response) {
    response.cookies.set(AUTH_COOKIE, "", expire);
    response.cookies.set(REFRESH_COOKIE, "", expire);
    response.cookies.set(ROLE_COOKIE, "", expire);
    return response;
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, "", expire);
  cookieStore.set(REFRESH_COOKIE, "", expire);
  cookieStore.set(ROLE_COOKIE, "", expire);
}

export async function backendAuth(
  path: "/auth/login" | "/auth/register",
  body: Record<string, string>,
) {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => null)) as
    | AuthResponse
    | { message?: string | string[]; statusCode?: number }
    | null;

  return { res, data };
}

export function getErrorMessage(data: unknown, fallback: string) {
  if (!data || typeof data !== "object") return fallback;
  const message = (data as { message?: string | string[] }).message;
  if (Array.isArray(message)) return message.join(", ");
  if (typeof message === "string") return message;
  return fallback;
}
