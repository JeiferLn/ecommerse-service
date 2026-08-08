"use client";

import { Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

function SessionRefreshInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;

    const next = searchParams.get("next") || "/dashboard";
    const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

    void fetch(`${API_URL}/api/v1/auth/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then((res) => {
        if (res.ok) {
          window.dispatchEvent(new Event("auth:refreshed"));
          router.replace(safeNext);
          return;
        }
        router.replace(`/login?next=${encodeURIComponent(safeNext)}`);
      })
      .catch(() => {
        router.replace(`/login?next=${encodeURIComponent(safeNext)}`);
      });
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
      <p className="text-sm">Restaurando sesión…</p>
    </div>
  );
}

export default function SessionRefreshPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" aria-hidden />
        </div>
      }
    >
      <SessionRefreshInner />
    </Suspense>
  );
}
