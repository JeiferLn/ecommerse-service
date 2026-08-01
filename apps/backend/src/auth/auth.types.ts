import type { UserRole } from "@commerce-ai/types";

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  type: "access";
}

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}
