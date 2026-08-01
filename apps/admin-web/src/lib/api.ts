import type { ApiResponse } from "@commerce-ai/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    credentials: "include",
  });

  const body = (await res.json().catch(() => null)) as ApiResponse<T> | null;

  if (!res.ok) {
    throw new ApiClientError(
      res.status,
      body?.message ?? `Request failed with status ${res.status}`,
    );
  }

  if (!body) {
    throw new ApiClientError(res.status, "Respuesta vacía del servidor");
  }

  return body.data;
}
