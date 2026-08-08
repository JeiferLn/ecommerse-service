"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";

import { apiFetch } from "@/lib/api";
import type { SessionUser } from "@/lib/session";

interface SessionContextValue {
  user: SessionUser | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  clear: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["session"],
    queryFn: () => apiFetch<SessionUser>("/auth/me").catch(() => null),
    staleTime: 60_000,
  });

  useEffect(() => {
    const onRefreshed = () => {
      void queryClient.invalidateQueries({ queryKey: ["session"] });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        void queryClient.invalidateQueries({ queryKey: ["session"] });
      }
    };
    window.addEventListener("auth:refreshed", onRefreshed);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("auth:refreshed", onRefreshed);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [queryClient]);

  const value = useMemo<SessionContextValue>(
    () => ({
      user: user ?? null,
      isLoading,
      refresh: () => queryClient.invalidateQueries({ queryKey: ["session"] }),
      clear: () => queryClient.setQueryData(["session"], null),
    }),
    [user, isLoading, queryClient],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession debe usarse dentro de <SessionProvider>");
  }
  return context;
}
