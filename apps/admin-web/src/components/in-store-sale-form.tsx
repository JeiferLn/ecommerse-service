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
import { CheckCircle2, Minus, Plus, Search, ShoppingBag, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Segmented } from "@/components/ui/segmented";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkeletonRows } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, ApiClientError } from "@/lib/api";
import { formatMoney } from "@/lib/orders";
import { useCountUp } from "@/lib/use-count-up";
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
  const animatedTotal = useCountUp(subtotal, { duration: 400 });

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
          line.variantId === variant.id
            ? { ...line, quantity: nextQty, stock: variant.stock }
            : line,
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

  if (!user) {
    return <SkeletonRows rows={3} columns={4} />;
  }

  if (!canOperate) {
    return (
      <p className="text-sm text-muted-foreground">
        No tienes permiso para registrar ventas de tienda.
      </p>
    );
  }

  const products = productsQuery.data?.items ?? [];
  const variants = productDetailsQuery.data?.variants ?? [];
  const itemsCount = lines.reduce((sum, line) => sum + line.quantity, 0);

  const changeQuantity = (variantId: string, delta: number) =>
    setLines((prev) =>
      prev.map((item) =>
        item.variantId === variantId
          ? { ...item, quantity: Math.min(item.stock, Math.max(1, item.quantity + delta)) }
          : item,
      ),
    );

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-6">
        {successOrder ? (
          <div
            role="status"
            className="slide-up-in flex flex-wrap items-center gap-3 rounded-md bg-accent px-4 py-3 text-sm text-accent-foreground"
          >
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            <span className="flex-1">
              Venta <span className="font-data">{successOrder.number}</span> registrada por{" "}
              {formatMoney(successOrder.total, successOrder.currency)}.
            </span>
            <Link href="/orders" className="font-medium underline-offset-4 hover:underline">
              Ver pedidos
            </Link>
            <button
              type="button"
              className="rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100"
              aria-label="Cerrar aviso"
              onClick={() => setSuccessOrder(null)}
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>
        ) : null}

        <section className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-sm font-medium">Agregar productos</h2>
            <div className="relative w-full sm:w-64">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                value={productQuery}
                onChange={(event) => setProductQuery(event.target.value)}
                placeholder="Filtrar catálogo"
                aria-label="Filtrar productos"
                className="h-9 pl-9"
              />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_5rem_auto] sm:items-end">
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="sale-product">Producto</Label>
              <Select
                value={selectedProductId || undefined}
                onValueChange={(value) => {
                  setSelectedProductId(value);
                  setSelectedVariantId("");
                }}
              >
                <SelectTrigger id="sale-product" className="w-full">
                  <SelectValue placeholder="Selecciona…">
                    <span className="truncate">
                      {productDetailsQuery.data?.name ??
                        products.find((product) => product.id === selectedProductId)?.name}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {products.length === 0 ? (
                    <p className="px-2 py-3 text-sm text-muted-foreground">
                      {productsQuery.isLoading ? "Cargando…" : "Sin productos activos"}
                    </p>
                  ) : (
                    products.map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                        <span className="text-muted-foreground"> · {product.totalStock} uds.</span>
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
            <div className="flex min-w-0 flex-col gap-1.5">
              <Label htmlFor="sale-variant">Variante</Label>
              <Select
                value={selectedVariantId || undefined}
                onValueChange={setSelectedVariantId}
                disabled={!selectedProductId || productDetailsQuery.isLoading}
              >
                <SelectTrigger id="sale-variant" className="w-full">
                  <SelectValue
                    placeholder={productDetailsQuery.isLoading ? "Cargando…" : "Selecciona…"}
                  >
                    <span className="truncate">{selectedVariant?.name}</span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {variants.map((variant) => (
                    <SelectItem key={variant.id} value={variant.id} disabled={variant.stock < 1}>
                      {variant.name}
                      <span className="text-muted-foreground">
                        {" "}
                        · {formatMoney(variant.price)} · {variant.stock} uds.
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="sale-qty">Cantidad</Label>
              <Input
                id="sale-qty"
                type="number"
                min={1}
                max={selectedVariant?.stock ?? 1}
                value={quantity}
                onChange={(event) => setQuantity(Number(event.target.value) || 1)}
                className="text-right"
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
        </section>

        {lines.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="La venta está vacía"
            description="Elige un producto y su variante para agregarlo."
            className="rounded-lg border border-dashed border-border"
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Producto</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Precio</TableHead>
                <TableHead className="text-center">Cantidad</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((line) => (
                <TableRow key={line.variantId} className="slide-up-in">
                  <TableCell>
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{line.productName}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {line.variantName} · <span className="font-data">{line.sku}</span>
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="hidden text-right whitespace-nowrap sm:table-cell">
                    {formatMoney(line.unitPrice)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-center gap-1">
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Quitar una unidad de ${line.productName}`}
                        disabled={line.quantity <= 1}
                        onClick={() => changeQuantity(line.variantId, -1)}
                      >
                        <Minus aria-hidden />
                      </Button>
                      <span className="w-6 text-center tabular-nums">{line.quantity}</span>
                      <Button
                        type="button"
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Agregar una unidad de ${line.productName}`}
                        disabled={line.quantity >= line.stock}
                        onClick={() => changeQuantity(line.variantId, 1)}
                      >
                        <Plus aria-hidden />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatMoney(line.unitPrice * line.quantity)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={`Quitar ${line.productName}`}
                      onClick={() =>
                        setLines((prev) => prev.filter((item) => item.variantId !== line.variantId))
                      }
                    >
                      <Trash2 aria-hidden />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>

      <aside className="flex flex-col gap-5 border-t border-border pt-6 lg:sticky lg:top-20 lg:self-start lg:border-t-0 lg:border-l lg:pt-0 lg:pl-6">
        <div className="flex flex-col gap-1">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatMoney(animatedTotal === subtotal ? subtotal : Math.round(animatedTotal))}
          </span>
          <span className="text-xs text-muted-foreground">
            {itemsCount === 1 ? "1 unidad" : `${itemsCount} unidades`}
          </span>
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Método de pago</span>
          <Segmented
            label="Método de pago"
            size="sm"
            className="w-full"
            value={paymentMethod}
            onChange={setPaymentMethod}
            options={IN_STORE_PAYMENT_METHODS.map((method) => ({
              value: method,
              label: IN_STORE_PAYMENT_METHOD_LABELS[method],
            }))}
          />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-customer-name">Cliente</Label>
            <Input
              id="sale-customer-name"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Nombre (opcional)"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sale-customer-phone">Teléfono</Label>
            <Input
              id="sale-customer-phone"
              type="tel"
              value={customerPhone}
              onChange={(event) => setCustomerPhone(event.target.value)}
              placeholder="Celular (opcional)"
            />
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
        </div>

        <Button
          type="button"
          size="lg"
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
        <p className="text-xs text-muted-foreground">
          Se registra como entregada, descuenta stock y suma al resumen.
        </p>

        {saleMutation.isError && (
          <p className="text-sm text-destructive">
            {saleMutation.error instanceof ApiClientError
              ? saleMutation.error.message
              : "No se pudo registrar la venta"}
          </p>
        )}
      </aside>
    </div>
  );
}
