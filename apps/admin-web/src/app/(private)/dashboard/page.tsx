import type { Metadata } from "next";

import { MembersSection } from "@/components/members-section";
import { SessionRoleBadge } from "@/components/role-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Dashboard | Commerce AI SaaS",
};

export default function DashboardPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">Resumen del estado de tu negocio.</p>
        </div>
        <SessionRoleBadge />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {["Ventas", "Pedidos", "Clientes", "Conversaciones"].map((kpi) => (
          <Card key={kpi}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-muted-foreground">{kpi}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">—</p>
              <CardDescription>Disponible en Fase 4</CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
      <MembersSection />
    </div>
  );
}
