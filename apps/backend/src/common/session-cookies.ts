import type { Response } from "express";

import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_COOKIE_PATH,
  REFRESH_TOKEN_COOKIE,
} from "../auth/auth.constants";

export interface SessionCookieOptions {
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
  secure: boolean;
}

export function setSessionCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  options: SessionCookieOptions,
): void {
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: options.secure,
    path: "/",
    maxAge: options.accessTtlSeconds * 1000,
  });

  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: options.secure,
    path: REFRESH_COOKIE_PATH,
    maxAge: options.refreshTtlSeconds * 1000,
  });
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(ACCESS_TOKEN_COOKIE, { path: "/" });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { path: REFRESH_COOKIE_PATH });
}
