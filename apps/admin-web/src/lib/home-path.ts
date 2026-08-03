import type { UserRole } from "@commerce-ai/types";

/** Home post-login según rol de plataforma vs empresa. */
export function homePathForRole(role: UserRole | undefined | null): string {
  return role === "admin" ? "/admin" : "/dashboard";
}
