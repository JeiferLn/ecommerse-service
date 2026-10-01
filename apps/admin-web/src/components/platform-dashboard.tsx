"use client";

import {
  COMPANY_TYPE_LABELS,
  type AdminCompanyRow,
  type PlatformDashboardStats,
} from "@commerce-ai/types";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Building2, Package, Phone, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SessionRoleBadge } from "@/components/role-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

function formatDay(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

function KpiCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof Package;
}) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <CardDescription className="text-sm font-medium">{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <p className="font-heading text-3xl font-bold tracking-tight">{value}</p>
      </CardContent>
    </Card>
  );
}

export function PlatformDashboard() {
  const router = useRouter();
  const { user, isLoading: sessionLoading } = useSession();

  useEffect(() => {
    if (!sessionLoading && user && user.role !== "admin") {
      router.replace("/");
    }
  }, [user, sessionLoading, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: () => apiFetch<PlatformDashboardStats>("/admin/stats"),
    enabled: user?.role === "admin",
  });

  const { data: companies } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: () => apiFetch<AdminCompanyRow[]>("/admin/companies"),
    enabled: user?.role === "admin",
  });
  const awaitingNumber = companies?.filter((company) => company.awaitingNumber).length ?? 0;

  if (sessionLoading || (user && user.role !== "admin")) {
    return <p className="text-sm text-muted-foreground">Cargando panel de plataforma…</p>;
  }

  const companiesSeries =
    data?.companiesLast30Days.map((point) => ({
      ...point,
      label: formatDay(point.date),
    })) ?? [];
  const usersSeries =
    data?.usersLast30Days.map((point) => ({
      ...point,
      label: formatDay(point.date),
    })) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
            Resumen
          </h1>
          <p className="text-muted-foreground">Métricas globales de la plataforma.</p>
        </div>
        <SessionRoleBadge />
      </div>

      {awaitingNumber > 0 ? (
        <Link
          href="/admin/companies"
          className="flex items-center gap-4 rounded-xl border border-primary/30 bg-primary/5 p-4 transition-colors hover:bg-primary/10"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Phone className="size-4" aria-hidden />
          </span>
          <span className="flex-1">
            <span className="block font-medium">
              {awaitingNumber === 1
                ? "1 tienda está esperando su número de WhatsApp"
                : `${awaitingNumber} tiendas están esperando su número de WhatsApp`}
            </span>
            <span className="block text-sm text-muted-foreground">
              Ya completaron productos, envíos, documentos y pagos.
            </span>
          </span>
          <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
        </Link>
      ) : null}

      {isLoading && <p className="text-sm text-muted-foreground">Cargando métricas…</p>}
      {isError && (
        <p className="text-sm text-destructive">No se pudieron cargar las métricas de plataforma.</p>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Empresas" value={data.companiesTotal} icon={Building2} />
            <KpiCard label="Usuarios" value={data.usersTotal} icon={UserRound} />
            <KpiCard label="Productos" value={data.productsTotal} icon={Package} />
            <KpiCard label="Membresías" value={data.membershipsTotal} icon={Users} />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Altas de empresas</CardTitle>
                <CardDescription>Últimos 30 días.</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={companiesSeries}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis allowDecimals={false} width={28} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="var(--chart-1)"
                      fill="var(--chart-1)"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card className="border-border bg-card">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Altas de usuarios</CardTitle>
                <CardDescription>Últimos 30 días (sin staff admin).</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={usersSeries}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={24} />
                    <YAxis allowDecimals={false} width={28} />
                    <Tooltip />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="var(--chart-2)"
                      fill="var(--chart-2)"
                      fillOpacity={0.2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          <Card className="border-border bg-card">
            <CardHeader>
              <CardTitle className="font-heading text-lg">Empresas recientes</CardTitle>
              <CardDescription>Las últimas registradas en la plataforma.</CardDescription>
            </CardHeader>
            <CardContent>
              {data.recentCompanies.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aún no hay empresas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead className="text-muted-foreground">
                      <tr className="border-b border-border">
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
                              <span className="text-xs text-muted-foreground">
                                {company.ownerEmail}
                              </span>
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
        </>
      )}
    </div>
  );
}
