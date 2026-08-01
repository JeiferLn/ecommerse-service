export interface ApiResponse<T> {
  status: "success" | "error";
  data: T;
  message?: string;
}

export type UserRole = "admin" | "owner" | "user";

export type CompanyType = "retail" | "health_beauty" | "technology" | "education";

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  retail: "Retail / Comercio",
  health_beauty: "Salud y Estética",
  technology: "Tecnología",
  education: "Educación",
};

export const COMPANY_TYPES: CompanyType[] = Object.keys(COMPANY_TYPE_LABELS) as CompanyType[];

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string | null;
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
