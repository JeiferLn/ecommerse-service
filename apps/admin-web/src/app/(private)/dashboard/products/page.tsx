"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore, useTransition } from "react";
import {
  LayoutGrid,
  List,
  Package,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/routes";
import type { Category, Product } from "@/lib/products";

type ViewMode = "list" | "grid";

const VIEW_KEY = "commerce-ai-products-view";

function subscribeView(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getViewSnapshot() {
  return window.localStorage.getItem(VIEW_KEY);
}

function getServerViewSnapshot() {
  return null;
}

function productThumb(product: Product) {
  return (
    product.images.find((image) => image.isPrimary)?.url ??
    product.images[0]?.url
  );
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const storedView = useSyncExternalStore(
    subscribeView,
    getViewSnapshot,
    getServerViewSnapshot,
  );
  const [view, setView] = useState<ViewMode>(
    storedView === "list" || storedView === "grid" ? storedView : "list",
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function changeView(next: ViewMode) {
    setView(next);
    window.localStorage.setItem(VIEW_KEY, next);
  }

  function load(nextSearch = search, nextCategoryId = categoryId) {
    startTransition(async () => {
      const params = new URLSearchParams();
      if (nextSearch.trim()) params.set("search", nextSearch.trim());
      if (nextCategoryId) params.set("categoryId", nextCategoryId);
      const qs = params.toString();

      const [productsRes, categoriesRes] = await Promise.all([
        fetch(`/api/products${qs ? `?${qs}` : ""}`),
        fetch("/api/categories"),
      ]);

      const productsData = await productsRes.json().catch(() => null);
      if (!productsRes.ok) {
        setError(
          (productsData as { message?: string })?.message ??
            "No se pudieron cargar los productos",
        );
        return;
      }

      if (categoriesRes.ok) {
        setCategories((await categoriesRes.json()) as Category[]);
      }

      setError(null);
      setProducts(productsData as Product[]);
    });
  }

  useEffect(() => {
    load("", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDelete(id: string) {
    if (!confirm("¿Eliminar este producto?")) return;
    startTransition(async () => {
      const res = await fetch(`/api/products/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(
          (data as { message?: string })?.message ??
            "No se pudo eliminar el producto",
        );
        return;
      }
      load();
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">
            Productos
          </h1>
          <p className="mt-1 text-sm text-muted">
            Catálogo e inventario de tu empresa.
          </p>
        </div>
        <Link
          href={ROUTES.productsNew}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover"
        >
          <Plus className="size-4" />
          Nuevo producto
        </Link>
      </div>

      <div className="flex flex-col gap-3">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            load(search, categoryId);
          }}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar por título, descripción o categoría"
            className="flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-border-strong focus:ring-2 focus:ring-ring/20"
          />
          <select
            value={categoryId}
            onChange={(event) => {
              const next = event.target.value;
              setCategoryId(next);
              load(search, next);
            }}
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus:border-border-strong focus:ring-2 focus:ring-ring/20 sm:w-52"
          >
            <option value="">Todas las categorías</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground transition hover:bg-background"
          >
            Buscar
          </button>
        </form>

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">
            {isPending
              ? "Cargando..."
              : `${products.length} producto${products.length === 1 ? "" : "s"}`}
          </p>
          <div className="inline-flex rounded-md border border-border bg-surface p-0.5">
            <button
              type="button"
              onClick={() => changeView("list")}
              aria-label="Vista lista"
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition ${
                view === "list"
                  ? "bg-foreground text-primary-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <List className="size-3.5" />
              Lista
            </button>
            <button
              type="button"
              onClick={() => changeView("grid")}
              aria-label="Vista grilla"
              className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs transition ${
                view === "grid"
                  ? "bg-foreground text-primary-foreground"
                  : "text-muted hover:text-foreground"
              }`}
            >
              <LayoutGrid className="size-3.5" />
              Grilla
            </button>
          </div>
        </div>
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {products.length === 0 && !isPending ? (
        <div className="rounded-lg border border-border bg-surface px-4 py-10 text-center text-muted">
          <Package className="mx-auto mb-2 size-6 opacity-40" />
          No hay productos con estos filtros
        </div>
      ) : view === "list" ? (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Producto</th>
                <th className="px-4 py-3 font-medium">Categoría</th>
                <th className="px-4 py-3 font-medium">Precio</th>
                <th className="px-4 py-3 font-medium">Stock</th>
                <th className="px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const thumb = productThumb(product);
                return (
                  <tr
                    key={product.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        {thumb ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={thumb}
                            alt={product.title}
                            className="size-10 rounded-md border border-border object-cover"
                          />
                        ) : (
                          <div className="size-10 rounded-md border border-border bg-background" />
                        )}
                        <div>
                          <p className="font-medium text-foreground">
                            {product.title}
                          </p>
                          <p className="line-clamp-1 text-xs text-muted">
                            {product.description}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted">
                      {product.category?.name ?? "Sin categoría"}
                    </td>
                    <td className="px-4 py-3 text-foreground">
                      ${product.price}
                    </td>
                    <td className="px-4 py-3 text-muted">{product.quantity}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-medium ${
                          product.isActive ? "text-foreground" : "text-muted"
                        }`}
                      >
                        {product.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(`${ROUTES.products}/${product.id}/edit`)
                          }
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted transition hover:text-foreground"
                        >
                          <Pencil className="size-3.5" />
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(product.id)}
                          disabled={isPending}
                          className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted transition hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
          {products.map((product) => {
            const thumb = productThumb(product);
            return (
              <article
                key={product.id}
                className="flex flex-col overflow-hidden rounded-md border border-border bg-surface"
              >
                <div className="aspect-square bg-background">
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumb}
                      alt={product.title}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center text-muted">
                      <Package className="size-5 opacity-30" />
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-2.5">
                  <div>
                    <p className="line-clamp-1 text-sm font-medium text-foreground">
                      {product.title}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[11px] text-muted">
                      {product.category?.name ?? "Sin categoría"}
                    </p>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        ${product.price}
                      </p>
                      <p className="text-[11px] text-muted">
                        Stock {product.quantity}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`${ROUTES.products}/${product.id}/edit`)
                        }
                        className="rounded border border-border p-1 text-muted transition hover:text-foreground"
                        aria-label="Editar"
                      >
                        <Pencil className="size-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(product.id)}
                        disabled={isPending}
                        className="rounded border border-border p-1 text-muted transition hover:text-danger"
                        aria-label="Eliminar"
                      >
                        <Trash2 className="size-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
