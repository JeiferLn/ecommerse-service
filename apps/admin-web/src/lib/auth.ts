import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AUTH_COOKIE, ROLE_COOKIE, type AppRole } from "@/lib/routes";

export const REFRESH_COOKIE = "refresh_token";

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
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 15,
  });

  cookieStore.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  cookieStore.set(ROLE_COOKIE, role, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function clearAuthCookies(response?: NextResponse) {
  if (response) {
    response.cookies.set(AUTH_COOKIE, "", { maxAge: 0, path: "/" });
    response.cookies.set(REFRESH_COOKIE, "", { maxAge: 0, path: "/" });
    response.cookies.set(ROLE_COOKIE, "", { maxAge: 0, path: "/" });
    return response;
  }

  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE, "", { maxAge: 0, path: "/" });
  cookieStore.set(REFRESH_COOKIE, "", { maxAge: 0, path: "/" });
  cookieStore.set(ROLE_COOKIE, "", { maxAge: 0, path: "/" });
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
