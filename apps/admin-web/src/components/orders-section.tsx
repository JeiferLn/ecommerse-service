"use client";

import {
  canManageOrders,
  canOperateOrders,
  ORDER_STATUS_LABELS,
  ORDER_STATUSES,
  type OrderDetails,
  type OrderStatus,
  type OrderSummary,
  type PaginatedResponse,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardList, MessageCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiClientError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

function formatMoney(amount: number, currency: string): string {
  return `$${amount.toFixed(2)} ${currency}`;
}

export function OrdersSection({
  initialConversationId,
}: {
  initialConversationId?: string | null;
}) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canOperate = Boolean(user && canOperateOrders(user.role));
  const canManage = Boolean(user && canManageOrders(user.role));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "">("");
  const [q, setQ] = useState("");
  const [conversationFilter, setConversationFilter] = useState(initialConversationId ?? "");

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: "1", perPage: "40" });
    if (statusFilter) {
      params.set("status", statusFilter);
    }
    if (q.trim()) {
      params.set("q", q.trim());
    }
    if (conversationFilter.trim()) {
      params.set("conversationId", conversationFilter.trim());
    }
    return params.toString();
  }, [statusFilter, q, conversationFilter]);

  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["orders", user?.companyId, queryString],
    queryFn: () => apiFetch<PaginatedResponse<OrderSummary>>(`/orders?${queryString}`),
    enabled: Boolean(user?.companyId) && canOperate,
  });

  const { data: selected, isLoading: detailLoading } = useQuery({
    queryKey: ["order", selectedId],
    queryFn: () => apiFetch<OrderDetails>(`/orders/${selectedId}`),
    enabled: Boolean(selectedId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["orders"] });
    void queryClient.invalidateQueries({ queryKey: ["order", selectedId] });
    void queryClient.invalidateQueries({ queryKey: ["company-stats"] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: OrderStatus) =>
      apiFetch<OrderDetails>(`/orders/${selectedId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: invalidate,
  });

  const cancelMutation = useMutation({
    mutationFn: () =>
      apiFetch<OrderDetails>(`/orders/${selectedId}/cancel`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: invalidate,
  });

  if (!canOperate) {
    return (
      <p className="text-sm text-muted-foreground">
        No tienes permiso para ver pedidos de la empresa.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
        <CardHeader className="gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="font-heading text-xl">Pedidos</CardTitle>
              <CardDescription>
                {data ? `${data.total} en total` : "Historial de compras desde WhatsApp"}
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("size-4", isFetching && "animate-spin")} aria-hidden />
              Actualizar
            </Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order-q">Buscar</Label>
              <Input
                id="order-q"
                value={q}
                onChange={(event) => setQ(event.target.value)}
                placeholder="Número, WhatsApp, ciudad…"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="order-status">Estado</Label>
              <select
                id="order-status"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as OrderStatus | "")}
              >
                <option value="">Todos</option>
                {ORDER_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {ORDER_STATUS_LABELS[status]}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {conversationFilter ? (
            <p className="text-xs text-muted-foreground">
              Filtrado por conversación{" "}
              <button
                type="button"
                className="underline underline-offset-2"
                onClick={() => setConversationFilter("")}
              >
                (quitar filtro)
              </button>
            </p>
          ) : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {isLoading && <p className="text-sm text-muted-foreground">Cargando pedidos…</p>}
          {error && (
            <p className="text-sm text-destructive">
              {error instanceof ApiClientError ? error.message : "No se pudieron cargar los pedidos"}
            </p>
          )}
          {!isLoading && data?.items.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
              <ClipboardList className="size-8 opacity-50" aria-hidden />
              Aún no hay pedidos. Prueba el flujo con Simular en WhatsApp.
            </div>
          )}
          {data?.items.map((order) => (
            <button
              key={order.id}
              type="button"
              onClick={() => setSelectedId(order.id)}
              className={cn(
                "rounded-xl border px-3 py-3 text-left transition-colors",
                selectedId === order.id
                  ? "border-primary bg-primary/5"
                  : "border-border/70 hover:bg-accent/40",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{order.number}</p>
                  <p className="text-xs text-muted-foreground">{order.customerWaId}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium">{formatMoney(order.total, order.currency)}</p>
                  <p className="text-xs text-muted-foreground">
                    {ORDER_STATUS_LABELS[order.status]}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Detalle</CardTitle>
          <CardDescription>
            {selected
              ? `${selected.number} · ${ORDER_STATUS_LABELS[selected.status]}`
              : "Selecciona un pedido"}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!selectedId && (
            <p className="text-sm text-muted-foreground">Elige un pedido de la lista.</p>
          )}
          {selectedId && detailLoading && (
            <p className="text-sm text-muted-foreground">Cargando detalle…</p>
          )}
          {selected && (
            <>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="text-muted-foreground">Cliente: </span>
                  {selected.customerWaId}
                </p>
                <p>
                  <span className="text-muted-foreground">Total: </span>
                  {formatMoney(selected.total, selected.currency)}
                </p>
                <p>
                  <span className="text-muted-foreground">Nombre: </span>
                  {selected.shippingName || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">País: </span>
                  {selected.shippingCountry || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Departamento: </span>
                  {selected.shippingRegion || "—"}
                </p>
                <p>
                  <span className="text-muted-foreground">Ciudad: </span>
                  {selected.shippingCity || "—"}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-muted-foreground">Dirección: </span>
                  {selected.shippingAddress || "—"}
                </p>
              </div>

              <ul className="flex flex-col gap-2 rounded-xl border border-border/70 p-3 text-sm">
                {selected.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>
                      {item.productName} ({item.variantName}) ×{item.quantity}
                      <span className="block text-xs text-muted-foreground">{item.sku}</span>
                    </span>
                    <span>{formatMoney(item.lineTotal, selected.currency)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap gap-2">
                {selected.conversationId ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/dashboard/whatsapp/inbox`}>
                      <MessageCircle className="size-4" aria-hidden />
                      Inbox WhatsApp
                    </Link>
                  </Button>
                ) : null}
                {canManage && selected.status !== "cancelled" && selected.status !== "delivered" ? (
                  <Button
                    type="button"
                    variant="destructive"
                    size="sm"
                    disabled={cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate()}
                  >
                    Cancelar pedido
                  </Button>
                ) : null}
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="order-next-status">Cambiar estado</Label>
                <select
                  id="order-next-status"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selected.status}
                  disabled={statusMutation.isPending || selected.status === "cancelled"}
                  onChange={(event) =>
                    statusMutation.mutate(event.target.value as OrderStatus)
                  }
                >
                  {ORDER_STATUSES.map((status) => (
                    <option key={status} value={status}>
                      {ORDER_STATUS_LABELS[status]}
                    </option>
                  ))}
                </select>
                {(statusMutation.isError || cancelMutation.isError) && (
                  <p className="text-sm text-destructive">
                    {(statusMutation.error || cancelMutation.error) instanceof ApiClientError
                      ? (statusMutation.error || cancelMutation.error)?.message
                      : "No se pudo actualizar el pedido"}
                  </p>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
