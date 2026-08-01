export interface ApiResponse<T> {
  status: "success" | "error";
  data: T;
  message?: string;
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
