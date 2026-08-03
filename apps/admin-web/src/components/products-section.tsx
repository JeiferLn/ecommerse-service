"use client";

import {
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUSES,
  canManageCatalog,
  type Category,
  type PaginatedResponse,
  type ProductStatus,
  type ProductSummary,
} from "@commerce-ai/types";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

function formatMoney(value: number | null): string {
  if (value == null) {
    return "—";
  }
  return new Intl.NumberFormat("es", { style: "currency", currency: "USD" }).format(value);
}

export function ProductsSection() {
  const { user } = useSession();
  const canManage = Boolean(user && canManageCatalog(user.role));
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ProductStatus | "all">("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [page, setPage] = useState(1);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("perPage", "12");
    if (q.trim()) {
      params.set("q", q.trim());
    }
    if (status !== "all") {
      params.set("status", status);
    }
    if (categoryId !== "all") {
      params.set("categoryId", categoryId);
    }
    return params.toString();
  }, [q, status, categoryId, page]);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Category[]>("/categories"),
    enabled: Boolean(user?.companyId),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["products", queryString],
    queryFn: () => apiFetch<PaginatedResponse<ProductSummary>>(`/products?${queryString}`),
    enabled: Boolean(user?.companyId),
  });

  if (!user?.companyId) {
    return <p className="text-sm text-muted-foreground">Selecciona una empresa para continuar.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Input
            className="w-56"
            placeholder="Buscar productos o SKU"
            value={q}
            onChange={(event) => {
              setPage(1);
              setQ(event.target.value);
            }}
          />
          <Select
            value={status}
            onValueChange={(value) => {
              setPage(1);
              setStatus(value as ProductStatus | "all");
            }}
          >
            <SelectTrigger className="w-40" aria-label="Filtrar por estado">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {PRODUCT_STATUSES.map((item) => (
                <SelectItem key={item} value={item}>
                  {PRODUCT_STATUS_LABELS[item]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={categoryId}
            onValueChange={(value) => {
              setPage(1);
              setCategoryId(value);
            }}
          >
            <SelectTrigger className="w-48" aria-label="Filtrar por categoría">
              <SelectValue placeholder="Categoría" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {categories?.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {canManage && (
          <Button asChild>
            <Link href="/dashboard/products/new">
              <Plus aria-hidden />
              Nuevo producto
            </Link>
          </Button>
        )}
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Cargando productos…</p>}

      {!isLoading && data && data.items.length === 0 && (
        <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="font-heading text-lg">Sin productos</CardTitle>
            <CardDescription>Crea el primero para empezar tu catálogo.</CardDescription>
          </CardHeader>
        </Card>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data?.items.map((product) => (
          <Link key={product.id} href={`/dashboard/products/${product.id}`} className="block">
            <Card className="h-full border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm transition-colors hover:border-primary/40">
              <CardHeader className="gap-3">
                {product.coverImageUrl ? (
                  <div className="aspect-square w-full overflow-hidden rounded-xl bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={product.coverImageUrl}
                      alt={product.name}
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex aspect-square items-center justify-center rounded-xl bg-muted text-sm text-muted-foreground">
                    Sin imagen
                  </div>
                )}
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="font-heading text-base">{product.name}</CardTitle>
                  <Badge variant="secondary">{PRODUCT_STATUS_LABELS[product.status]}</Badge>
                </div>
                <CardDescription>
                  {product.categoryName ?? "Sin categoría"} · {product.variantsCount} variantes
                </CardDescription>
              </CardHeader>
              <CardContent className="flex justify-between text-sm">
                <span>Desde {formatMoney(product.minPrice)}</span>
                <span className="text-muted-foreground">Stock {product.totalStock}</span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((current) => current - 1)}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {data.page} de {data.totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= data.totalPages}
            onClick={() => setPage((current) => current + 1)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}
