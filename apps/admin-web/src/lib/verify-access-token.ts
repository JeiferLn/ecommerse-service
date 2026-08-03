import { jwtVerify } from "jose";
import type { UserRole } from "@commerce-ai/types";

export interface AccessTokenClaims {
  sub: string;
  role: UserRole;
  companyId: string | null;
  type: "access";
}

export async function verifyAccessToken(
  token: string,
): Promise<AccessTokenClaims | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret));
    if (payload.type !== "access" || typeof payload.sub !== "string") {
      return null;
    }
    const role = payload.role;
    if (
      role !== "admin" &&
      role !== "owner" &&
      role !== "manager" &&
      role !== "user"
    ) {
      return null;
    }
    return {
      sub: payload.sub,
      role,
      companyId: typeof payload.companyId === "string" ? payload.companyId : null,
      type: "access",
    };
  } catch {
    return null;
  }
}
