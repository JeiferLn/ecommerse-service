import type { Metadata } from "next";

import { SessionRoleBadge } from "@/components/role-badge";

export const metadata: Metadata = {
  title: "Dashboard | Commerce AI SaaS",
};

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Dashboard</h1>
          <p className="text-muted-foreground">Resumen del estado de tu negocio.</p>
        </div>
        <SessionRoleBadge />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {["Ventas", "Pedidos", "Clientes", "Conversaciones"].map((kpi) => (
          <div
            key={kpi}
            className="rounded-2xl border border-border/70 bg-card/70 p-5 shadow-brand-sm backdrop-blur-sm"
          >
            <p className="text-sm font-medium text-muted-foreground">{kpi}</p>
            <p className="font-heading mt-3 text-3xl font-bold tracking-tight">—</p>
            <p className="mt-1 text-xs text-muted-foreground">Disponible en Fase 4</p>
          </div>
        ))}
      </div>
    </div>
  );
}
