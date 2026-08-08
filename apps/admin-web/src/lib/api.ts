import type { ApiResponse } from "@commerce-ai/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const NO_REFRESH_PATHS = [
  "/auth/login",
  "/auth/register",
  "/auth/forgot-password",
  "/auth/reset-password",
  "/auth/refresh",
  "/auth/logout",
];

let refreshPromise: Promise<boolean> | null = null;

function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => {
        if (res.ok) {
          window.dispatchEvent(new Event("auth:refreshed"));
          return true;
        }
        if (res.status === 401) {
          redirectToLogin();
        }
        return false;
      })
      .catch(() => false)
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

function redirectToLogin(): void {
  if (typeof window === "undefined" || window.location.pathname === "/login") {
    return;
  }
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.assign(`/login?next=${encodeURIComponent(next)}`);
}

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
  // Solo se omite el refresh en endpoints de auth que ya gestionan la sesión.
  // Antes se usaba una lista de páginas públicas con `startsWith("/")`, que
  // marcaba TODAS las rutas como públicas y desactivaba el refresh por completo.
  const shouldRefresh = !NO_REFRESH_PATHS.some((noRefreshPath) => path.startsWith(noRefreshPath));

  const doFetch = async (): Promise<Response> => {
    const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
    const headers = new Headers(init?.headers);
    if (!isFormData && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    return fetch(`${API_URL}/api/v1${path}`, {
      ...init,
      headers,
      credentials: "include",
    });
  };

  let res = await doFetch();

  if (res.status === 401 && shouldRefresh && (await refreshSession())) {
    res = await doFetch();
  }

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
