export interface ApiResponse<T> {
  status: "success" | "error";
  data: T;
  message?: string;
}

export type UserRole = "admin" | "owner" | "manager" | "user";

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Administrador",
  owner: "Dueño",
  manager: "Manager",
  user: "Usuario",
};

export type CompanyType = "retail" | "health_beauty" | "technology" | "education";

export const COMPANY_TYPE_LABELS: Record<CompanyType, string> = {
  retail: "Retail / Comercio",
  health_beauty: "Salud y Estética",
  technology: "Tecnología",
  education: "Educación",
};

export const COMPANY_TYPES: CompanyType[] = Object.keys(COMPANY_TYPE_LABELS) as CompanyType[];

export interface CompanySummary {
  id: string;
  name: string;
  type: CompanyType;
  role: UserRole;
}

export interface CompanyMember {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface InviteResult {
  status: "joined" | "pending" | "cancelled";
  message: string;
}

export interface RemoveMemberResult {
  message: string;
}

export interface CompanyInvitation {
  id: string;
  email: string;
  createdAt: string;
}

export interface InvitationInfo {
  email: string;
  companyName: string;
  hasAccount: boolean;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  companyId: string | null;
  companies: CompanySummary[];
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
