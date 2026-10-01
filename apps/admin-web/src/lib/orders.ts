import type { OrderDetails, OrderStatus, OrderSummary } from "@commerce-ai/types";

import type { StatusTone } from "@/components/ui/status-pill";

export function formatMoney(amount: number, currency?: string): string {
  const value = amount.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  return currency ? `$${value} ${currency}` : `$${value}`;
}

export const ORDER_STATUS_TONE: Record<OrderStatus, StatusTone> = {
  draft: "neutral",
  confirmed: "neutral",
  awaiting_payment: "attention",
  paid: "positive",
  preparing: "attention",
  shipped: "positive",
  delivered: "positive",
  cancelled: "negative",
};

export function orderCustomer(order: OrderSummary | OrderDetails): string {
  if ("shippingName" in order && order.shippingName) {
    return order.shippingName;
  }
  if (order.channel === "in_store") {
    return "Mostrador";
  }
  return order.customerWaId ? `+${order.customerWaId.replace(/^\+/, "")}` : "—";
}

export function formatOrderDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short" });
}
