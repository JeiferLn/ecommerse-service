"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Upload } from "lucide-react";
import { ROUTES } from "@/lib/routes";
import type { Category, Product } from "@/lib/products";

const fieldClassName =
  "rounded-md border border-border bg-surface px-3 py-2.5 text-foreground outline-none transition placeholder:text-muted/70 focus:border-border-strong focus:ring-2 focus:ring-ring/20";

type Props = {
  mode: "create" | "edit";
  productId?: string;
};

export function ProductForm({ mode, productId }: Props) {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const categoriesRes = await fetch("/api/categories");
      if (categoriesRes.ok) {
        setCategories((await categoriesRes.json()) as Category[]);
      }

      if (mode === "edit" && productId) {
        const productRes = await fetch(`/api/products/${productId}`);
        if (productRes.ok) {
          setProduct((await productRes.json()) as Product);
        } else {
          setError("No se pudo cargar el producto");
        }
      }
    })();
  }, [mode, productId]);

  useEffect(() => {
    const urls = files.map((file) => URL.createObjectURL(file));
    setPreviews(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);

  function onFilesChange(fileList: FileList | null) {
    if (!fileList) return;
    setFiles((current) => [...current, ...Array.from(fileList)].slice(0, 8));
  }

  function createCategory() {
    const name = newCategory.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          (data as { message?: string })?.message ??
            "No se pudo crear la categoría",
        );
        return;
      }
      setCategories((current) => [...current, data as Category]);
      setNewCategory("");
    });
  }

  function removeExistingImage(imageId: string) {
    if (!productId) return;
    startTransition(async () => {
      const res = await fetch(
        `/api/products/${productId}/images/${imageId}`,
        { method: "DELETE" },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          (data as { message?: string })?.message ??
            "No se pudo eliminar la imagen",
        );
        return;
      }
      setProduct(data as Product);
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const activeCheckbox = form.querySelector<HTMLInputElement>(
      'input[name="isActive"]',
    );
    formData.set("isActive", activeCheckbox?.checked ? "true" : "false");

    if (mode === "create" && files.length === 0) {
      setError("Debes subir al menos una imagen");
      return;
    }

    if (
      mode === "edit" &&
      (product?.images.length ?? 0) === 0 &&
      files.length === 0
    ) {
      setError("El producto debe tener al menos una imagen");
      return;
    }

    for (const file of files) {
      formData.append("images", file);
    }

    const categoryId = String(formData.get("categoryId") ?? "");
    if (!categoryId) {
      formData.delete("categoryId");
    }

    startTransition(async () => {
      const res = await fetch(
        mode === "create" ? "/api/products" : `/api/products/${productId}`,
        {
          method: mode === "create" ? "POST" : "PATCH",
          body: formData,
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          (data as { message?: string })?.message ??
            "No se pudo guardar el producto",
        );
        return;
      }
      router.replace(ROUTES.products);
      router.refresh();
    });
  }

  if (mode === "edit" && !product && !error) {
    return <p className="text-muted">Cargando producto...</p>;
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-2xl flex-col gap-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {mode === "create" ? "Nuevo producto" : "Editar producto"}
        </h1>
        <p className="mt-1 text-sm text-muted">
          Título, descripción, stock, precio e imágenes (mínimo 1).
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Título</span>
        <input
          name="title"
          required
          minLength={2}
          defaultValue={product?.title}
          className={fieldClassName}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm">
        <span className="font-medium">Descripción</span>
        <textarea
          name="description"
          required
          minLength={2}
          rows={4}
          defaultValue={product?.description}
          className={fieldClassName}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Precio</span>
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            required
            defaultValue={product?.price ?? "0"}
            className={fieldClassName}
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Cantidad</span>
          <input
            name="quantity"
            type="number"
            min="0"
            required
            defaultValue={product?.quantity ?? 0}
            className={fieldClassName}
          />
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Categoría</span>
          <select
            name="categoryId"
            defaultValue={product?.categoryId ?? ""}
            className={fieldClassName}
          >
            <option value="">Sin categoría</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <input
            value={newCategory}
            onChange={(event) => setNewCategory(event.target.value)}
            placeholder="Nueva categoría"
            className={`flex-1 ${fieldClassName}`}
          />
          <button
            type="button"
            onClick={createCategory}
            disabled={isPending}
            className="rounded-md border border-border px-3 py-2 text-sm text-foreground transition hover:bg-background"
          >
            Crear
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          value="true"
          defaultChecked={product?.isActive ?? true}
        />
        Producto activo
      </label>

      {product?.images?.length ? (
        <div>
          <p className="mb-2 text-sm font-medium">Imágenes actuales</p>
          <div className="flex flex-wrap gap-3">
            {product.images.map((image) => (
              <div key={image.id} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={image.url}
                  alt=""
                  className="size-24 rounded-md border border-border object-cover"
                />
                <button
                  type="button"
                  onClick={() => removeExistingImage(image.id)}
                  className="absolute right-1 top-1 rounded bg-surface/90 p-1 text-muted hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-sm font-medium">
          {mode === "create" ? "Imágenes" : "Agregar imágenes"}
        </p>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-background px-4 py-8 text-sm text-muted transition hover:border-border-strong hover:text-foreground">
          <Upload className="size-5" />
          <span>Selecciona una o más imágenes</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            multiple
            className="hidden"
            onChange={(event) => onFilesChange(event.target.files)}
          />
        </label>
        {previews.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-3">
            {previews.map((url) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={url}
                src={url}
                alt=""
                className="size-20 rounded-md border border-border object-cover"
              />
            ))}
          </div>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
        >
          {isPending ? "Guardando..." : "Guardar"}
        </button>
        <button
          type="button"
          onClick={() => router.push(ROUTES.products)}
          className="rounded-md border border-border px-4 py-2.5 text-sm text-foreground transition hover:bg-background"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
