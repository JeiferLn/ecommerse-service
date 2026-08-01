import type { UserRole } from "@commerce-ai/types";

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
  companyId: string | null;
  type: "access";
}

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  companyId: string | null;
}
