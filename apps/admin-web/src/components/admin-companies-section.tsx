"use client";

import { COMPANY_TYPE_LABELS, type PlatformDashboardStats } from "@commerce-ai/types";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

export function AdminCompaniesSection() {
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();

  useEffect(() => {
    if (!sessionLoading && user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, sessionLoading, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => apiFetch<PlatformDashboardStats>("/admin/stats"),
    enabled: user?.role === "admin",
  });

  if (sessionLoading || (user && user.role !== "admin")) {
    return <p className="text-sm text-muted-foreground">Cargando…</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Empresas</h1>
        <p className="text-muted-foreground">
          Listado reciente de tenants. La gestión avanzada queda fuera de Fase 4.
        </p>
      </div>

      <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-heading text-lg">Registradas recientemente</CardTitle>
          <CardDescription>
            {data ? `${data.companiesTotal} empresas en total` : "Cargando…"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading && <p className="text-sm text-muted-foreground">Cargando empresas…</p>}
          {isError && (
            <p className="text-sm text-destructive">No se pudo cargar el listado de empresas.</p>
          )}
          {data && data.recentCompanies.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no hay empresas.</p>
          )}
          {data && data.recentCompanies.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border/70">
                    <th className="pb-2 pr-3 font-medium">Empresa</th>
                    <th className="pb-2 pr-3 font-medium">Tipo</th>
                    <th className="pb-2 pr-3 font-medium">Owner</th>
                    <th className="pb-2 pr-3 font-medium">Miembros</th>
                    <th className="pb-2 pr-3 font-medium">Productos</th>
                    <th className="pb-2 font-medium">Alta</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentCompanies.map((company) => (
                    <tr key={company.id} className="border-b border-border/50 last:border-0">
                      <td className="py-3 pr-3 font-medium">{company.name}</td>
                      <td className="py-3 pr-3 text-muted-foreground">
                        {COMPANY_TYPE_LABELS[company.type]}
                      </td>
                      <td className="py-3 pr-3">
                        <div className="flex flex-col">
                          <span>{company.ownerName}</span>
                          <span className="text-xs text-muted-foreground">{company.ownerEmail}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-3">{company.membersCount}</td>
                      <td className="py-3 pr-3">{company.productsCount}</td>
                      <td className="py-3 text-muted-foreground">
                        {new Date(company.createdAt).toLocaleDateString("es")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
