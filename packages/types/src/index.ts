export interface ApiResponse<T> {
  status: "success" | "error";
  data: T;
  message?: string;
}

export type UserRole = "admin" | "owner" | "user";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface PaginationParams {
  page: number;
  perPage: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}
