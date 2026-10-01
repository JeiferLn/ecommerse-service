"use client";

import {
  canOperateOrders,
  canViewWhatsapp,
  ORDER_CHANNEL_LABELS,
  ORDER_STATUS_LABELS,
  type CompanyDashboardStats,
  type OrderSummary,
  type PaginatedResponse,
} from "@commerce-ai/types";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ClipboardList, PackageCheck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { usePendingConversations } from "@/components/company-sidebar";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonRows } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { formatMoney, formatOrderDate, ORDER_STATUS_TONE, orderCustomer } from "@/lib/orders";
import { useCountUp } from "@/lib/use-count-up";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

function CountUp({ value, format }: { value: number; format?: (value: number) => string }) {
  const current = useCountUp(value);
  const rounded = Math.round(current);
  return <>{format ? format(rounded) : rounded}</>;
}

interface Metric {
  label: string;
  value: number;
  href: string;
  attention?: boolean;
}

function CatalogCount({ value, one, many }: { value: number; one: string; many: string }) {
  return (
    <>
      <span className="text-foreground tabular-nums">{value}</span> {value === 1 ? one : many}
    </>
  );
}

function SectionHeading({
  title,
  href,
  linkLabel,
}: {
  title: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {href && linkLabel ? (
        <Link
          href={href}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {linkLabel}
          <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      ) : null}
    </div>
  );
}

/** Ingresos destacados y conteos operativos en una sola banda tipográfica. */
function MetricBand({ stats, metrics }: { stats: CompanyDashboardStats; metrics: Metric[] }) {
  return (
    <section
      aria-label="Indicadores"
      className="grid grid-cols-2 border-y border-border lg:grid-flow-col lg:grid-cols-[minmax(0,1.6fr)] lg:auto-cols-fr"
    >
      <div className="col-span-2 border-b border-border py-5 lg:col-span-1 lg:border-b-0 lg:pr-6">
        <p className="text-sm text-muted-foreground">Ingresos cobrados</p>
        <p className="mt-1 text-4xl font-semibold tracking-display tabular-nums">
          <CountUp value={stats.revenueTotal} format={formatMoney} />
        </p>
      </div>
      {metrics.map((metric, index) => (
        <Link
          key={metric.label}
          href={metric.href}
          className={cn(
            "group flex flex-col justify-between gap-2 px-4 py-5 transition-colors hover:bg-muted/50",
            index % 2 === 1 && "border-l border-border",
            index >= 2 && "border-t border-border lg:border-t-0",
            "lg:border-l lg:border-border",
            index % 2 === 0 && "pl-0 lg:pl-4",
          )}
        >
          <span className="text-sm text-muted-foreground group-hover:text-foreground">
            {metric.label}
          </span>
          <span className="flex items-center gap-2 text-2xl font-semibold tracking-display tabular-nums">
            <CountUp value={metric.value} />
            {metric.attention && metric.value > 0 ? (
              <span aria-hidden className="size-2 rounded-full bg-warning" />
            ) : null}
          </span>
        </Link>
      ))}
    </section>
  );
}

function ChannelSplit({ stats }: { stats: CompanyDashboardStats }) {
  const total = stats.revenueWhatsapp + stats.revenueInStore;
  const waShare = total > 0 ? (stats.revenueWhatsapp / total) * 100 : 0;
  const rows = [
    {
      label: ORDER_CHANNEL_LABELS.whatsapp,
      amount: stats.revenueWhatsapp,
      orders: stats.ordersWhatsapp,
      swatch: "bg-primary",
    },
    {
      label: ORDER_CHANNEL_LABELS.in_store,
      amount: stats.revenueInStore,
      orders: stats.ordersInStore,
      swatch: "bg-foreground/25",
    },
  ];

  return (
    <section aria-labelledby="channel-split-title">
      <h2 id="channel-split-title" className="mb-3 text-sm font-medium">
        Ventas por canal
      </h2>
      <div
        className="flex h-2 overflow-hidden rounded-full bg-muted"
        role="img"
        aria-label={
          total > 0
            ? `WhatsApp ${Math.round(waShare)} %, tienda física ${100 - Math.round(waShare)} %`
            : "Aún no hay ventas cobradas"
        }
      >
        {total > 0 ? (
          <>
            <div className="h-full bg-primary" style={{ width: `${waShare}%` }} />
            <div className="h-full flex-1 bg-foreground/25" />
          </>
        ) : null}
      </div>
      <dl className="mt-3 grid gap-x-8 gap-y-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 text-sm">
            <dt className="inline-flex items-center gap-2 text-muted-foreground">
              <span aria-hidden className={cn("size-2 rounded-full", row.swatch)} />
              {row.label}
            </dt>
            <dd className="tabular-nums">
              <span className="font-medium">{formatMoney(row.amount)}</span>
              <span className="ml-2 text-muted-foreground">
                {row.orders} {row.orders === 1 ? "pedido" : "pedidos"}
              </span>
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RecentOrders({ enabled }: { enabled: boolean }) {
  const { user } = useSession();
  const { data, isLoading } = useQuery({
    queryKey: ["orders", user?.companyId, "recent"],
    queryFn: () => apiFetch<PaginatedResponse<OrderSummary>>("/orders?page=1&perPage=5"),
    enabled: enabled && Boolean(user?.companyId),
  });

  let body: ReactNode;
  if (isLoading) {
    body = <SkeletonRows rows={5} columns={4} />;
  } else if (!data || data.items.length === 0) {
    body = (
      <EmptyState
        icon={ClipboardList}
        title="Aún no hay pedidos"
        description="Aparecerán aquí cuando un cliente compre por WhatsApp o registres una venta."
        className="rounded-lg border border-dashed border-border py-10"
      />
    );
  } else {
    body = (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Pedido</TableHead>
            <TableHead className="hidden sm:table-cell">Cliente</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.items.map((order) => (
            <TableRow key={order.id} className="group">
              <TableCell>
                <Link
                  href={`/orders?id=${order.id}`}
                  className="font-data text-[13px] font-medium whitespace-nowrap underline-offset-4 group-hover:underline"
                >
                  {order.number}
                </Link>
                <span className="block text-xs text-muted-foreground">
                  {formatOrderDate(order.createdAt)}
                </span>
              </TableCell>
              <TableCell className="hidden max-w-40 truncate sm:table-cell">
                {orderCustomer(order)}
              </TableCell>
              <TableCell>
                <StatusPill tone={ORDER_STATUS_TONE[order.status]}>
                  {ORDER_STATUS_LABELS[order.status]}
                </StatusPill>
              </TableCell>
              <TableCell className="text-right font-medium whitespace-nowrap">
                {formatMoney(order.total)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  }

  return (
    <section className="min-w-0">
      <SectionHeading title="Últimos pedidos" href="/orders" linkLabel="Ver pedidos" />
      {body}
    </section>
  );
}

function LowStock({ stats }: { stats: CompanyDashboardStats }) {
  return (
    <section className="min-w-0">
      <SectionHeading title="Stock bajo" href="/products" linkLabel="Productos" />
      {stats.lowStockProducts.length === 0 ? (
        <EmptyState
          icon={PackageCheck}
          title="Sin alertas"
          description={`Ningún producto tiene ${stats.lowStockThreshold} unidades o menos.`}
          className="rounded-lg border border-dashed border-border py-10"
        />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Unidades</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stats.lowStockProducts.map((product) => (
              <TableRow key={product.id}>
                <TableCell className="max-w-48 truncate">
                  <Link
                    href={`/products/${product.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {product.name}
                  </Link>
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium",
                    product.totalStock === 0 && "text-destructive",
                  )}
                >
                  {product.totalStock}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

export function CompanyDashboard() {
  const router = useRouter();
  const { user } = useSession();
  const role = user?.role;
  const isCompanyUser = Boolean(role && role !== "admin");
  const canOrders = Boolean(isCompanyUser && role && canOperateOrders(role));
  const canChats = Boolean(isCompanyUser && role && canViewWhatsapp(role));
  const pendingChats = usePendingConversations(canChats);

  useEffect(() => {
    if (role === "admin") {
      router.replace("/admin");
    }
  }, [role, router]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ["company-stats", user?.companyId],
    queryFn: () => apiFetch<CompanyDashboardStats>("/company/stats"),
    enabled: Boolean(user?.companyId) && isCompanyUser,
  });

  if (role === "admin") {
    return <p className="text-sm text-muted-foreground">Redirigiendo al panel de plataforma…</p>;
  }

  if (!user?.companyId) {
    return (
      <p className="text-sm text-muted-foreground">
        Selecciona o crea una empresa para ver el resumen del negocio.
      </p>
    );
  }

  const company = user.companies?.find((item) => item.id === user.companyId);

  const metrics: Metric[] = data
    ? [
        { label: "Pedidos", value: data.ordersTotal, href: "/orders" },
        {
          label: "Esperando pago",
          value: data.ordersAwaitingPayment,
          href: "/orders?status=awaiting_payment",
        },
        {
          label: "Por preparar",
          value: data.ordersPaid,
          href: "/orders?status=paid",
          attention: true,
        },
        ...(canChats
          ? [
              {
                label: "Chats con asesor",
                value: pendingChats,
                href: "/whatsapp/inbox?handler=human",
                attention: true,
              },
            ]
          : []),
      ]
    : [];

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="Inicio"
        description={company ? `Así va ${company.name} hoy.` : "Así va tu tienda hoy."}
        className="mb-0"
      />

      <OnboardingChecklist />

      {isLoading ? (
        <div className="flex flex-col gap-8" role="status" aria-label="Cargando métricas">
          <div className="grid grid-cols-2 gap-6 border-y border-border py-5 lg:grid-cols-5">
            <Skeleton className="col-span-2 h-10 w-40 lg:col-span-1" />
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-10 w-16" />
            ))}
          </div>
          <Skeleton className="h-2 w-full rounded-full" />
        </div>
      ) : null}
      {isError && (
        <p className="text-sm text-destructive">No se pudieron cargar las métricas del negocio.</p>
      )}

      {data && (
        <>
          <div className="flex flex-col gap-8">
            <MetricBand stats={data} metrics={metrics} />
            <ChannelSplit stats={data} />
          </div>

          <div className="grid gap-10 xl:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
            {canOrders ? <RecentOrders enabled={canOrders} /> : null}
            <LowStock stats={data} />
          </div>

          <p className="border-t border-border pt-4 text-sm text-muted-foreground">
            <CatalogCount value={data.productsTotal} one="producto" many="productos" /> ·{" "}
            <CatalogCount value={data.totalStock} one="unidad" many="unidades" /> en{" "}
            <CatalogCount value={data.variantsTotal} one="variante" many="variantes" /> ·{" "}
            <CatalogCount value={data.categoriesTotal} one="categoría" many="categorías" /> ·{" "}
            <CatalogCount value={data.membersTotal} one="miembro" many="miembros" />
          </p>
        </>
      )}
    </div>
  );
}
