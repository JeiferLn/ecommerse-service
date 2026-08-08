"use client";

import {
  PRODUCT_STATUS_LABELS,
  type CompanyDashboardStats,
  type ProductStatus,
} from "@commerce-ai/types";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Boxes, ClipboardList, FolderTree, Package, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { SessionRoleBadge } from "@/components/role-badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: typeof Package;
}) {
  return (
    <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <CardDescription className="text-sm font-medium">{label}</CardDescription>
        <Icon className="size-4 text-muted-foreground" aria-hidden />
      </CardHeader>
      <CardContent>
        <p className="font-heading text-3xl font-bold tracking-tight">{value}</p>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function CompanyDashboard() {
  const router = useRouter();
  const { user } = useSession();

  useEffect(() => {
    if (user?.role === "admin") {
      router.replace("/admin");
    }
  }, [user?.role, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["company-stats", user?.companyId],
    queryFn: () => apiFetch<CompanyDashboardStats>("/company/stats"),
    enabled: Boolean(user?.companyId) && user?.role !== "admin",
  });

  if (user?.role === "admin") {
    return <p className="text-sm text-muted-foreground">Redirigiendo al panel de plataforma…</p>;
  }

  if (!user?.companyId) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecciona o crea una empresa para ver el resumen del negocio.
      </p>
    );
  }

  const statusData =
    data?.productsByStatus.map((item) => ({
      name: PRODUCT_STATUS_LABELS[item.status as ProductStatus],
      value: item.count,
      status: item.status,
    })) ?? [];

  const stockData =
    data?.topProductsByStock.map((item) => ({
      name: item.name.length > 18 ? `${item.name.slice(0, 18)}…` : item.name,
      stock: item.totalStock,
    })) ?? [];

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Dashboard</h1>
          <p className="text-muted-foreground">Resumen del estado de tu negocio.</p>
        </div>
        <SessionRoleBadge />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando métricas…</p>}
      {isError && (
        <p className="text-sm text-destructive">No se pudieron cargar las métricas del dashboard.</p>
      )}

      {data && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Productos" value={data.productsTotal} icon={Package} />
            <KpiCard
              label="Stock total"
              value={data.totalStock}
              hint={`${data.variantsTotal} variantes`}
              icon={Boxes}
            />
            <KpiCard label="Categorías" value={data.categoriesTotal} icon={FolderTree} />
            <KpiCard label="Miembros" value={data.membersTotal} icon={Users} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Pedidos"
              value={data.ordersTotal}
              hint={`${data.ordersOpen} abiertos`}
              icon={ClipboardList}
            />
            <KpiCard
              label="Esperando pago"
              value={data.ordersAwaitingPayment}
              hint="Sin pasarela aún (Fase 9)"
              icon={ClipboardList}
            />
            <Card className="border-border/70 bg-card/50 opacity-80 shadow-brand-sm backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardDescription>Ventas / Clientes</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-3xl font-bold tracking-tight">—</p>
                <p className="mt-1 text-xs text-muted-foreground">Próximamente</p>
              </CardContent>
            </Card>
            <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
              <CardHeader className="pb-2">
                <CardDescription>Conversaciones</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="font-heading text-3xl font-bold tracking-tight">WhatsApp</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Inbox y simulación en{" "}
                  <Link href="/dashboard/whatsapp" className="underline underline-offset-4">
                    /dashboard/whatsapp
                  </Link>
                </p>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Productos por estado</CardTitle>
                <CardDescription>Distribución del catálogo.</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                {statusData.every((item) => item.value === 0) ? (
                  <p className="text-sm text-muted-foreground">Aún no hay productos.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={55}
                        outerRadius={90}
                        paddingAngle={3}
                      >
                        {statusData.map((entry, index) => (
                          <Cell key={entry.status} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
              <CardHeader>
                <CardTitle className="font-heading text-lg">Top productos por stock</CardTitle>
                <CardDescription>Unidades disponibles por producto.</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                {stockData.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin datos de stock.</p>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={stockData} margin={{ left: 0, right: 8, top: 8, bottom: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={50} />
                      <YAxis allowDecimals={false} width={36} />
                      <Tooltip />
                      <Bar dataKey="stock" fill="var(--chart-1)" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="font-heading flex items-center gap-2 text-lg">
                <AlertTriangle className="size-4 text-destructive" aria-hidden />
                Stock bajo
              </CardTitle>
              <CardDescription>
                Productos con {data.lowStockThreshold} unidades o menos (suma de variantes).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.lowStockProducts.length === 0 ? (
                <p className="text-sm text-muted-foreground">No hay alertas de stock bajo.</p>
              ) : (
                <ul className="divide-y divide-border/70">
                  {data.lowStockProducts.map((product) => (
                    <li
                      key={product.id}
                      className="flex items-center justify-between gap-3 py-3 text-sm first:pt-0 last:pb-0"
                    >
                      <Link
                        href={`/dashboard/products/${product.id}`}
                        className="font-medium hover:underline"
                      >
                        {product.name}
                      </Link>
                      <span className="text-muted-foreground">{product.totalStock} uds.</span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
