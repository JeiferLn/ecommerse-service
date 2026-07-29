"use client";

import { LogOut, Shield } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ROUTES } from "@/lib/routes";

export default function AdminPage() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace(ROUTES.login);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-primary">
            <Shield className="size-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Plataforma
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Panel de administrador
          </h1>
          <p className="mt-2 text-muted">
            Gestión de usuarios y empresas que usan Commerce AI.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:border-border-strong hover:bg-primary-soft/40 disabled:opacity-60"
        >
          <LogOut className="size-4" />
          {isPending ? "Saliendo..." : "Cerrar sesión"}
        </button>
      </div>
    </div>
  );
}
