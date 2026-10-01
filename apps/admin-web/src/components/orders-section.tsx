"use client";

import {
  canManageOrders,
  canOperateOrders,
  IN_STORE_PAYMENT_METHOD_LABELS,
  ORDER_CHANNEL_LABELS,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type OrderChannel,
  type OrderDetails,
  type OrderStatus,
  type OrderSummary,
  type PaginatedResponse,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ClipboardList,
  ExternalLink,
  MessageCircle,
  RefreshCw,
  Search,
  Store,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { SkeletonRows, SkeletonText } from "@/components/ui/skeleton";
import { StatusPill } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, ApiClientError } from "@/lib/api";
import { formatMoney, formatOrderDate, ORDER_STATUS_TONE, orderCustomer } from "@/lib/orders";
import { useStaggerOnce } from "@/lib/use-stagger-once";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

type ChannelFilter = "all" | OrderChannel;
type StatusFilter = "all" | OrderStatus;

const DESKTOP_QUERY = "(min-width: 1024px)";

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(DESKTOP_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => true,
  );
}

function isOrderStatus(value: string | null | undefined): value is OrderStatus {
  return Boolean(value && (ORDER_STATUSES as string[]).includes(value));
}

function ChannelLabel({ channel }: { channel: OrderChannel }) {
  const Icon = channel === "in_store" ? Store : MessageCircle;
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
      <Icon className="size-3.5" aria-hidden />
      {ORDER_CHANNEL_LABELS[channel]}
    </span>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4">
      <h3 className="text-xs text-muted-foreground">{title}</h3>
      {children}
    </section>
  );
}

function Field({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={cn("min-w-0 text-right wrap-break-word", mono && "font-data text-[13px]")}>
        {value || "—"}
      </dd>
    </div>
  );
}

function OrderDetail({
  order,
  canManage,
  onChanged,
}: {
  order: OrderDetails;
  canManage: boolean;
  onChanged: () => void;
}) {
  const isStore = order.channel === "in_store";

  const statusMutation = useMutation({
    mutationFn: (status: OrderStatus) =>
      apiFetch<OrderDetails>(`/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: onChanged,
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiFetch<OrderDetails>(`/orders/${order.id}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: onChanged,
  });

  const canCancel =
    canManage && order.status !== "cancelled" && (isStore || order.status !== "delivered");
  const mutationError = statusMutation.error ?? cancelMutation.error;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-data text-base font-semibold">{order.number}</span>
          <StatusPill tone={ORDER_STATUS_TONE[order.status]}>
            {ORDER_STATUS_LABELS[order.status]}
          </StatusPill>
        </div>
        <p className="text-sm text-muted-foreground">
          <ChannelLabel channel={order.channel} />
          {isStore && order.inStorePaymentMethod
            ? ` · ${IN_STORE_PAYMENT_METHOD_LABELS[order.inStorePaymentMethod]}`
            : ""}
        </p>
        <p className="text-xs text-muted-foreground tabular-nums">
          {new Date(order.createdAt).toLocaleString("es-CO", {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>

      <DetailSection title="Cliente">
        <dl className="flex flex-col gap-1.5">
          <Field label="Nombre" value={order.shippingName || (isStore ? "Mostrador" : null)} />
          {isStore ? (
            <Field label="Teléfono" value={order.shippingPhone} mono />
          ) : (
            <Field
              label="WhatsApp"
              value={order.customerWaId ? `+${order.customerWaId.replace(/^\+/, "")}` : null}
              mono
            />
          )}
        </dl>
      </DetailSection>

      {!isStore ? (
        <DetailSection title="Envío">
          <dl className="flex flex-col gap-1.5">
            <Field label="Dirección" value={order.shippingAddress} />
            <Field
              label="Ciudad"
              value={[order.shippingCity, order.shippingRegion, order.shippingCountry]
                .filter(Boolean)
                .join(", ")}
            />
            {order.shippingPhone ? (
              <Field label="Teléfono" value={order.shippingPhone} mono />
            ) : null}
          </dl>
        </DetailSection>
      ) : null}

      <DetailSection title="Productos">
        <ul className="flex flex-col gap-2.5">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
              <span className="min-w-0">
                <span className="text-muted-foreground tabular-nums">{item.quantity} × </span>
                {item.productName}
                <span className="block text-xs text-muted-foreground">
                  {item.variantName} · <span className="font-data">{item.sku}</span>
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{formatMoney(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
      </DetailSection>

      <DetailSection title="Total">
        <dl className="flex flex-col gap-1.5 tabular-nums">
          <Field label="Subtotal" value={formatMoney(order.subtotal)} />
          {!isStore ? <Field label="Envío" value={formatMoney(order.shippingCost)} /> : null}
          <div className="flex items-baseline justify-between gap-4 pt-1">
            <dt className="text-sm font-medium">Total</dt>
            <dd className="text-lg font-semibold">{formatMoney(order.total, order.currency)}</dd>
          </div>
        </dl>
      </DetailSection>

      {order.notes ? (
        <DetailSection title="Notas">
          <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
        </DetailSection>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        {!isStore ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted-foreground">Cambiar estado</span>
            <Select
              value={order.status}
              disabled={statusMutation.isPending || order.status === "cancelled"}
              onValueChange={(value) => statusMutation.mutate(value as OrderStatus)}
            >
              <SelectTrigger aria-label="Cambiar estado del pedido" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ORDER_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {ORDER_STATUS_LABELS[status]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {order.conversationId ? (
            <Button asChild variant="outline" size="sm">
              <Link href={`/whatsapp/inbox?id=${order.conversationId}`}>
                <MessageCircle className="size-4" aria-hidden />
                Ver chat
              </Link>
            </Button>
          ) : null}
          {order.checkoutUrl && order.status === "awaiting_payment" ? (
            <Button asChild variant="outline" size="sm">
              <a href={order.checkoutUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="size-4" aria-hidden />
                Link de pago
              </a>
            </Button>
          ) : null}
          {canCancel ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={cancelMutation.isPending}
              onClick={() => cancelMutation.mutate()}
            >
              {cancelMutation.isPending
                ? "Cancelando…"
                : `Cancelar ${isStore ? "venta" : "pedido"}`}
            </Button>
          ) : null}
        </div>
        {mutationError ? (
          <p className="text-sm text-destructive">
            {mutationError instanceof ApiClientError
              ? mutationError.message
              : "No se pudo actualizar el pedido"}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function OrdersSection({
  initialConversationId,
  initialOrderId,
  initialStatus,
}: {
  initialConversationId?: string | null;
  initialOrderId?: string | null;
  initialStatus?: string | null;
}) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const isDesktop = useIsDesktop();
  const canOperate = Boolean(user && canOperateOrders(user.role));
  const canManage = Boolean(user && canManageOrders(user.role));
  const [selectedId, setSelectedId] = useState<string | null>(initialOrderId ?? null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(
    isOrderStatus(initialStatus) ? initialStatus : "all",
  );
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("all");
  const [q, setQ] = useState("");
  const [conversationFilter, setConversationFilter] = useState(initialConversationId ?? "");

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: "1", perPage: "40" });
    if (statusFilter !== "all") {
      params.set("status", statusFilter);
    }
    if (channelFilter !== "all") {
      params.set("channel", channelFilter);
    }
    if (q.trim()) {
      params.set("q", q.trim());
    }
    if (conversationFilter.trim()) {
      params.set("conversationId", conversationFilter.trim());
    }
    return params.toString();
  }, [statusFilter, channelFilter, q, conversationFilter]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["orders", user?.companyId, queryString],
    queryFn: () => apiFetch<PaginatedResponse<OrderSummary>>(`/orders?${queryString}`),
    enabled: Boolean(user?.companyId) && canOperate,
  });

  const { data: selected, isLoading: detailLoading } = useQuery({
    queryKey: ["order", selectedId],
    queryFn: () => apiFetch<OrderDetails>(`/orders/${selectedId}`),
    enabled: Boolean(selectedId) && canOperate,
  });

  const rowsStagger = useStaggerOnce(Boolean(data?.items.length));

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    void queryClient.invalidateQueries({ queryKey: ["order", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["company-stats"] });
  };

  if (!user) {
    return <SkeletonRows rows={6} columns={5} />;
  }

  if (!canOperate) {
    return (
      <p className="text-sm text-muted-foreground">
        No tienes permiso para ver pedidos de la empresa.
      </p>
    );
  }

  const panelOpen = Boolean(selectedId && isDesktop);
  const hasFilters =
    statusFilter !== "all" || channelFilter !== "all" || q.trim() !== "" || conversationFilter !== "";

  const detail = selectedId ? (
    detailLoading || !selected ? (
      <SkeletonText lines={6} />
    ) : (
      <div key={selected.id} className="fade-swap">
        <OrderDetail order={selected} canManage={canManage} onChanged={invalidate} />
      </div>
    )
  ) : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Número, cliente o ciudad"
            aria-label="Buscar pedidos"
            className="h-9 pl-9"
          />
        </div>
        <Segmented
          label="Filtrar por canal"
          size="sm"
          value={channelFilter}
          onChange={setChannelFilter}
          options={[
            { value: "all", label: "Todos" },
            { value: "whatsapp", label: ORDER_CHANNEL_LABELS.whatsapp },
            { value: "in_store", label: ORDER_CHANNEL_LABELS.in_store },
          ]}
        />
        <div className="flex items-center gap-2 lg:ml-auto">
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as StatusFilter)}
          >
            <SelectTrigger aria-label="Filtrar por estado" className="h-9 w-full lg:w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              {ORDER_STATUSES.map((status) => (
                <SelectItem key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => void refetch()}
            disabled={isFetching}
            aria-label="Actualizar pedidos"
          >
            <RefreshCw className={cn("size-4", isFetching && "animate-spin")} aria-hidden />
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {data && data.total > 0 ? (
          <span className="tabular-nums">
            {data.total} {data.total === 1 ? "pedido" : "pedidos"}
          </span>
        ) : null}
        {conversationFilter ? (
          <button
            type="button"
            onClick={() => setConversationFilter("")}
            className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs transition-colors hover:text-foreground"
          >
            De una conversación
            <X className="size-3" aria-label="Quitar filtro" />
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          "grid items-start gap-6",
          panelOpen && "grid-cols-[minmax(0,1fr)_360px]",
        )}
      >
        <div className="min-w-0">
          {isLoading ? <SkeletonRows rows={6} columns={5} /> : null}
          {error && (
            <p className="py-6 text-sm text-destructive">
              {error instanceof ApiClientError ? error.message : "No se pudieron cargar los pedidos"}
            </p>
          )}
          {!isLoading && !error && data?.items.length === 0 ? (
            <EmptyState
              icon={ClipboardList}
              title={hasFilters ? "Sin resultados" : "Aún no hay pedidos"}
              description={
                hasFilters
                  ? "Ningún pedido coincide con estos filtros."
                  : "Aparecerán aquí cuando un cliente compre por WhatsApp o registres una venta."
              }
              action={
                !hasFilters && canOperate ? (
                  <Button asChild size="sm">
                    <Link href="/sales">Nueva venta</Link>
                  </Button>
                ) : null
              }
              className="rounded-lg border border-dashed border-border"
            />
          ) : null}
          {data && data.items.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Pedido</TableHead>
                  <TableHead className="hidden sm:table-cell">Cliente</TableHead>
                  <TableHead className={cn("hidden md:table-cell", panelOpen && "md:hidden")}>Canal</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className={cn("hidden text-right sm:table-cell", panelOpen && "sm:hidden")}>
                    Fecha
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className={rowsStagger}>
                {data.items.map((order) => {
                  const active = order.id === selectedId;
                  return (
                    <TableRow
                      key={order.id}
                      data-state={active ? "selected" : undefined}
                      onClick={() => setSelectedId(order.id)}
                      className="cursor-pointer"
                    >
                      <TableCell>
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedId(order.id);
                          }}
                          aria-pressed={active}
                          className="font-data text-[13px] font-medium whitespace-nowrap underline-offset-4 outline-none hover:underline focus-visible:underline"
                        >
                          {order.number}
                        </button>
                      </TableCell>
                      <TableCell className="hidden max-w-44 sm:table-cell">
                        <span className="block truncate">{orderCustomer(order)}</span>
                        {order.shippingCity ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {order.shippingCity}
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell
                        className={cn("hidden whitespace-nowrap md:table-cell", panelOpen && "md:hidden")}
                      >
                        <ChannelLabel channel={order.channel} />
                      </TableCell>
                      <TableCell>
                        <StatusPill tone={ORDER_STATUS_TONE[order.status]}>
                          {ORDER_STATUS_LABELS[order.status]}
                        </StatusPill>
                      </TableCell>
                      <TableCell className="text-right font-medium whitespace-nowrap">
                        {formatMoney(order.total)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "hidden text-right whitespace-nowrap text-muted-foreground sm:table-cell",
                          panelOpen && "sm:hidden",
                        )}
                      >
                        {formatOrderDate(order.createdAt)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          ) : null}
        </div>

        {panelOpen ? (
          <aside
            aria-label="Detalle del pedido"
            className="sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-lg border border-border bg-card p-5"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="float-right -mt-1 -mr-1"
              onClick={() => setSelectedId(null)}
              aria-label="Cerrar detalle"
            >
              <X className="size-4" aria-hidden />
            </Button>
            {detail}
          </aside>
        ) : null}
      </div>

      {!isDesktop ? (
        <Sheet open={Boolean(selectedId)} onOpenChange={(open) => !open && setSelectedId(null)}>
          <SheetContent className="gap-0 p-5">
            <SheetTitle className="sr-only">Detalle del pedido</SheetTitle>
            <SheetDescription className="sr-only">
              Cliente, envío, productos y acciones del pedido.
            </SheetDescription>
            {detail}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}
