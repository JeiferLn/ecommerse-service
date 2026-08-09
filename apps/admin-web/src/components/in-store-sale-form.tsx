"use client";

import {
  canOperateOrders,
  IN_STORE_PAYMENT_METHOD_LABELS,
  IN_STORE_PAYMENT_METHODS,
  type CreateInStoreSalePayload,
  type InStorePaymentMethod,
  type OrderDetails,
  type PaginatedResponse,
  type ProductDetails,
  type ProductSummary,
} from "@commerce-ai/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Minus, Plus, Store, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

interface SaleLine {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  unitPrice: number;
  stock: number;
  quantity: number;
}

function formatMoney(amount: number): string {
  return `$${amount.toLocaleString("es-CO", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function InStoreSaleForm() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const canOperate = Boolean(user && canOperateOrders(user.role));

  const [productQuery, setProductQuery] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [selectedVariantId, setSelectedVariantId] = useState<string>("");
  const [quantity, setQuantity] = useState(1);
  const [lines, setLines] = useState<SaleLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<InStorePaymentMethod>("cash");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [successOrder, setSuccessOrder] = useState<OrderDetails | null>(null);

  const productsQuery = useQuery({
    queryKey: ["products-sale", user?.companyId, productQuery],
    queryFn: () => {
      const params = new URLSearchParams({
        page: "1",
        perPage: "30",
        status: "active",
      });
      if (productQuery.trim()) {
        params.set("q", productQuery.trim());
      }
      return apiFetch<PaginatedResponse<ProductSummary>>(`/products?${params}`);
    },
    enabled: Boolean(user?.companyId) && canOperate,
  });

  const productDetailsQuery = useQuery({
    queryKey: ["product-sale", selectedProductId],
    queryFn: () => apiFetch<ProductDetails>(`/products/${selectedProductId}`),
    enabled: Boolean(selectedProductId),
  });

  const selectedVariant = useMemo(
    () => productDetailsQuery.data?.variants.find((v) => v.id === selectedVariantId) ?? null,
    [productDetailsQuery.data, selectedVariantId],
  );

  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);

  const addLine = () => {
    const product = productDetailsQuery.data;
    const variant = selectedVariant;
    if (!product || !variant) {
      return;
    }
    if (variant.stock < 1) {
      return;
    }
    const qty = Math.min(Math.max(1, quantity), variant.stock);
    setLines((prev) => {
      const existing = prev.find((line) => line.variantId === variant.id);
      if (existing) {
        const nextQty = Math.min(existing.quantity + qty, variant.stock);
        return prev.map((line) =>
          line.variantId === variant.id ? { ...line, quantity: nextQty, stock: variant.stock } : line,
        );
      }
      return [
        ...prev,
        {
          variantId: variant.id,
          productId: product.id,
          productName: product.name,
          variantName: variant.name,
          sku: variant.sku,
          unitPrice: variant.price,
          stock: variant.stock,
          quantity: qty,
        },
      ];
    });
    setQuantity(1);
  };

  const saleMutation = useMutation({
    mutationFn: (payload: CreateInStoreSalePayload) =>
      apiFetch<OrderDetails>("/orders/in-store", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: (order) => {
      setSuccessOrder(order);
      setLines([]);
      setCustomerName("");
      setCustomerPhone("");
      setNotes("");
      setPaymentMethod("cash");
      void queryClient.invalidateQueries({ queryKey: ["orders"] });
      void queryClient.invalidateQueries({ queryKey: ["company-stats"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
      void queryClient.invalidateQueries({ queryKey: ["products-sale"] });
    },
  });

  if (!canOperate) {
    return (
      <p className="text-sm text-muted-foreground">
        No tienes permiso para registrar ventas de tienda.
      </p>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.9fr)]">
      <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl">Agregar productos</CardTitle>
          <CardDescription>
            Busca en el catálogo activo y agrega variantes con stock disponible.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-product-q">Buscar producto</Label>
            <Input
              id="sale-product-q"
              value={productQuery}
              onChange={(event) => setProductQuery(event.target.value)}
              placeholder="Nombre del producto…"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sale-product">Producto</Label>
              <select
                id="sale-product"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedProductId}
                onChange={(event) => {
                  setSelectedProductId(event.target.value);
                  setSelectedVariantId("");
                }}
              >
                <option value="">Selecciona…</option>
                {(productsQuery.data?.items ?? []).map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name} ({product.totalStock} uds.)
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sale-variant">Variante</Label>
              <select
                id="sale-variant"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={selectedVariantId}
                disabled={!selectedProductId || productDetailsQuery.isLoading}
                onChange={(event) => setSelectedVariantId(event.target.value)}
              >
                <option value="">Selecciona…</option>
                {(productDetailsQuery.data?.variants ?? []).map((variant) => (
                  <option key={variant.id} value={variant.id} disabled={variant.stock < 1}>
                    {variant.name} · {formatMoney(variant.price)} · stock {variant.stock}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sale-qty">Cantidad</Label>
              <Input
                id="sale-qty"
                type="number"
                min={1}
                max={selectedVariant?.stock ?? 1}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value) || 1)}
                className="w-28"
              />
            </div>
            <Button
              type="button"
              onClick={addLine}
              disabled={!selectedVariant || selectedVariant.stock < 1}
            >
              <Plus className="size-4" aria-hidden />
              Agregar
            </Button>
          </div>

          <ul className="flex flex-col gap-2">
            {lines.length === 0 ? (
              <li className="rounded-xl border border-dashed border-border/70 px-4 py-8 text-center text-sm text-muted-foreground">
                Aún no hay líneas en la venta.
              </li>
            ) : (
              lines.map((line) => (
                <li
                  key={line.variantId}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {line.productName}{" "}
                      <span className="text-muted-foreground">({line.variantName})</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {line.sku} · {formatMoney(line.unitPrice)} c/u · máx. {line.stock}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      onClick={() =>
                        setLines((prev) =>
                          prev.map((item) =>
                            item.variantId === line.variantId
                              ? { ...item, quantity: Math.max(1, item.quantity - 1) }
                              : item,
                          ),
                        )
                      }
                    >
                      <Minus className="size-4" aria-hidden />
                    </Button>
                    <span className="w-8 text-center text-sm font-medium">{line.quantity}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="outline"
                      disabled={line.quantity >= line.stock}
                      onClick={() =>
                        setLines((prev) =>
                          prev.map((item) =>
                            item.variantId === line.variantId
                              ? {
                                  ...item,
                                  quantity: Math.min(item.stock, item.quantity + 1),
                                }
                              : item,
                          ),
                        )
                      }
                    >
                      <Plus className="size-4" aria-hidden />
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      onClick={() =>
                        setLines((prev) => prev.filter((item) => item.variantId !== line.variantId))
                      }
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </li>
              ))
            )}
          </ul>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-heading flex items-center gap-2 text-xl">
            <Store className="size-5" aria-hidden />
            Cobrar venta
          </CardTitle>
          <CardDescription>
            Se registra como entregada, descuenta stock y suma al dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-payment">Método de pago</Label>
            <select
              id="sale-payment"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={paymentMethod}
              onChange={(event) => setPaymentMethod(event.target.value as InStorePaymentMethod)}
            >
              {IN_STORE_PAYMENT_METHODS.map((method) => (
                <option key={method} value={method}>
                  {IN_STORE_PAYMENT_METHOD_LABELS[method]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sale-customer-name">Cliente (opcional)</Label>
              <Input
                id="sale-customer-name"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                placeholder="Nombre"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sale-customer-phone">Teléfono (opcional)</Label>
              <Input
                id="sale-customer-phone"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                placeholder="Celular"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-notes">Notas</Label>
            <Input
              id="sale-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Opcional"
            />
          </div>

          <div className="rounded-xl border border-border/70 bg-muted/30 px-4 py-3">
            <p className="text-sm text-muted-foreground">Total</p>
            <p className="font-heading text-3xl font-bold tracking-tight">{formatMoney(subtotal)}</p>
            <p className="text-xs text-muted-foreground">{lines.length} línea(s)</p>
          </div>

          <Button
            type="button"
            disabled={lines.length === 0 || saleMutation.isPending}
            onClick={() =>
              saleMutation.mutate({
                items: lines.map((line) => ({
                  variantId: line.variantId,
                  quantity: line.quantity,
                })),
                paymentMethod,
                customerName: customerName.trim() || undefined,
                customerPhone: customerPhone.trim() || undefined,
                notes: notes.trim() || undefined,
              })
            }
          >
            {saleMutation.isPending ? "Registrando…" : "Confirmar venta"}
          </Button>

          {saleMutation.isError && (
            <p className="text-sm text-destructive">
              {saleMutation.error instanceof ApiClientError
                ? saleMutation.error.message
                : "No se pudo registrar la venta"}
            </p>
          )}

          {successOrder && (
            <p className="rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
              Venta {successOrder.number} registrada · {formatMoney(successOrder.total)}{" "}
              {successOrder.currency}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
