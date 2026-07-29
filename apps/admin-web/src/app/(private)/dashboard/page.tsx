import Link from "next/link";
import { Building2, Users } from "lucide-react";
import { ROUTES } from "@/lib/routes";

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Resumen
        </h1>
        <p className="mt-1 text-sm text-muted">
          Accesos rápidos a la gestión de tu empresa.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href={ROUTES.team}
          className="group flex gap-4 rounded-lg border border-border bg-surface p-5 transition hover:border-border-strong"
        >
          <div className="flex size-10 items-center justify-center rounded-md border border-border bg-background text-foreground">
            <Users className="size-4" />
          </div>
          <div>
            <p className="font-medium text-foreground group-hover:underline group-hover:underline-offset-4">
              Equipo
            </p>
            <p className="mt-1 text-sm text-muted">
              Miembros e invitaciones por correo
            </p>
          </div>
        </Link>

        <Link
          href={ROUTES.settings}
          className="group flex gap-4 rounded-lg border border-border bg-surface p-5 transition hover:border-border-strong"
        >
          <div className="flex size-10 items-center justify-center rounded-md border border-border bg-background text-foreground">
            <Building2 className="size-4" />
          </div>
          <div>
            <p className="font-medium text-foreground group-hover:underline group-hover:underline-offset-4">
              Empresa
            </p>
            <p className="mt-1 text-sm text-muted">
              Nombre, tipo y datos iniciales
            </p>
          </div>
        </Link>
      </div>
    </div>
  );
}
