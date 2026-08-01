export const SESSION_COOKIE = "access_token";

export type UserRole = "owner" | "admin" | "member";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}
