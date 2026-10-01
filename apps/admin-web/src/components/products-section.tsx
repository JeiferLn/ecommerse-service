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
import { ImageOff, Package, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PageHeader } from "@/components/page-header";
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
import { SkeletonRows } from "@/components/ui/skeleton";
import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch } from "@/lib/api";
import { formatMoney } from "@/lib/orders";
import { useStaggerOnce } from "@/lib/use-stagger-once";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

const LOW_STOCK = 5;

export const PRODUCT_STATUS_TONE: Record<ProductStatus, StatusTone> = {
  active: "positive",
  draft: "neutral",
  archived: "negative",
};

export function ProductsSection() {
  const router = useRouter();
  const { user } = useSession();
  const canManage = Boolean(user && canManageCatalog(user.role));
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<ProductStatus | "all">("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [page, setPage] = useState(1);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("perPage", "20");
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
  const rowsStagger = useStaggerOnce(Boolean(data?.items.length));

  const header = (
    <PageHeader
      title="Productos"
      description="Tu catálogo: lo que el asistente puede ofrecer y vender."
      className="mb-6"
      actions={
        canManage ? (
          <Button asChild>
            <Link href="/products/new">
              <Plus aria-hidden />
              Nuevo producto
            </Link>
          </Button>
        ) : null
      }
    />
  );

  if (!user) {
    return (
      <>
        {header}
        <SkeletonRows rows={6} columns={5} />
      </>
    );
  }

  if (!user.companyId) {
    return (
      <>
        {header}
        <p className="text-sm text-muted-foreground">Selecciona una empresa para continuar.</p>
      </>
    );
  }

  const hasFilters = q.trim() !== "" || status !== "all" || categoryId !== "all";

  return (
    <div className="flex flex-col">
      {header}

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            className="h-9 pl-9"
            placeholder="Nombre o SKU"
            aria-label="Buscar productos"
            value={q}
            onChange={(event) => {
              setPage(1);
              setQ(event.target.value);
            }}
          />
        </div>
        <Segmented
          label="Filtrar por estado"
          size="sm"
          value={status}
          onChange={(value) => {
            setPage(1);
            setStatus(value);
          }}
          options={[
            { value: "all" as const, label: "Todos" },
            ...PRODUCT_STATUSES.map((item) => ({
              value: item,
              label: PRODUCT_STATUS_LABELS[item],
            })),
          ]}
        />
        <Select
          value={categoryId}
          onValueChange={(value) => {
            setPage(1);
            setCategoryId(value);
          }}
        >
          <SelectTrigger
            className="h-9 w-full lg:ml-auto lg:w-52"
            aria-label="Filtrar por categoría"
          >
            <SelectValue placeholder="Categoría" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las categorías</SelectItem>
            {categories?.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? <SkeletonRows rows={6} columns={5} /> : null}

      {!isLoading && data && data.items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={hasFilters ? "Sin resultados" : "Aún no hay productos"}
          description={
            hasFilters
              ? "Ningún producto coincide con estos filtros."
              : "Crea el primero para que el asistente pueda ofrecerlo."
          }
          action={
            !hasFilters && canManage ? (
              <Button asChild size="sm">
                <Link href="/products/new">Nuevo producto</Link>
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
              <TableHead>Producto</TableHead>
              <TableHead className="hidden md:table-cell">Categoría</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Variantes</TableHead>
              <TableHead className="text-right">Stock</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Desde</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={rowsStagger}>
            {data.items.map((product) => (
              <TableRow
                key={product.id}
                className="cursor-pointer"
                onClick={() => router.push(`/products/${product.id}`)}
              >
                <TableCell>
                  <div className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground">
                      {product.coverImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.coverImageUrl}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        <ImageOff className="size-4" aria-hidden />
                      )}
                    </span>
                    <Link
                      href={`/products/${product.id}`}
                      onClick={(event) => event.stopPropagation()}
                      className="min-w-0 truncate font-medium underline-offset-4 hover:underline"
                    >
                      {product.name}
                    </Link>
                  </div>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  {product.categoryName ?? "Sin categoría"}
                </TableCell>
                <TableCell className="hidden text-right sm:table-cell">
                  {product.variantsCount}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right",
                    product.totalStock <= LOW_STOCK && "font-medium text-destructive",
                  )}
                >
                  {product.totalStock}
                </TableCell>
                <TableCell className="hidden text-right whitespace-nowrap sm:table-cell">
                  {product.minPrice == null ? "—" : formatMoney(product.minPrice)}
                </TableCell>
                <TableCell>
                  <StatusPill tone={PRODUCT_STATUS_TONE[product.status]}>
                    {PRODUCT_STATUS_LABELS[product.status]}
                  </StatusPill>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : null}

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between gap-2 text-sm">
          <span className="text-muted-foreground tabular-nums">
            Página {data.page} de {data.totalPages} · {data.total} productos
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.totalPages}
              onClick={() => setPage((current) => current + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
