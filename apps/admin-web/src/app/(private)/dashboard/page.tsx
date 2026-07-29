"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ROUTES } from "@/lib/routes";

export default function DashboardPage() {
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
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Panel de empresa
          </h1>
          <p className="mt-2 text-muted">
            Gestiona tu equipo y la configuración de tu negocio.
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

      <div className="grid gap-3 sm:grid-cols-2">
        <Link
          href={ROUTES.team}
          className="rounded-xl border border-border bg-surface px-5 py-4 transition hover:border-border-strong"
        >
          <p className="font-medium text-foreground">Equipo</p>
          <p className="mt-1 text-sm text-muted">
            Miembros e invitaciones por correo
          </p>
        </Link>
        <Link
          href={ROUTES.settings}
          className="rounded-xl border border-border bg-surface px-5 py-4 transition hover:border-border-strong"
        >
          <p className="font-medium text-foreground">Empresa</p>
          <p className="mt-1 text-sm text-muted">
            Nombre, tipo y datos iniciales
          </p>
        </Link>
      </div>
    </div>
  );
}
