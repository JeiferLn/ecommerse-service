"use client";

import {
  PRODUCT_STATUS_LABELS,
  PRODUCT_STATUSES,
  canManageCatalog,
  type Category,
  type ProductDetails,
  type ProductImage,
  type ProductStatus,
  type ProductVariant,
} from "@commerce-ai/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Upload, Wand2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ProductImagesSortable,
  type GalleryImageItem,
} from "@/components/product-images-sortable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

function parseOptionValues(raw: string): string[] {
  return raw
    .split(/[,;\n]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function slugPart(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

function cartesianOptions(
  groups: Array<{ name: string; values: string[] }>,
): Array<Record<string, string>> {
  return groups.reduce<Array<Record<string, string>>>(
    (acc, group) =>
      acc.flatMap((combo) => group.values.map((value) => ({ ...combo, [group.name]: value }))),
    [{}],
  );
}

const variantSchema = z.object({
  id: z.string().optional(),
  sku: z.string().min(1, "SKU obligatorio").max(64),
  name: z.string().min(1, "Nombre obligatorio").max(120),
  price: z.preprocess((value) => Number(value), z.number().min(0, "Precio inválido")),
  compareAtPrice: z.preprocess((value) => {
    if (value === "" || value == null) {
      return "";
    }
    return Number(value);
  }, z.union([z.number().min(0), z.literal("")])),
  stock: z.preprocess((value) => Number(value), z.number().int().min(0)),
});

const productSchema = z.object({
  name: z.string().min(2, "Mínimo 2 caracteres").max(200),
  description: z.string().max(5000).optional(),
  categoryId: z.string().optional(),
  status: z.enum(PRODUCT_STATUSES as [ProductStatus, ...ProductStatus[]]),
  variants: z.array(variantSchema).min(1, "Agrega al menos una variante"),
});

type ProductFormValues = {
  name: string;
  description?: string;
  categoryId?: string;
  status: ProductStatus;
  variants: Array<{
    id?: string;
    sku: string;
    name: string;
    price: number;
    compareAtPrice?: number | "";
    stock: number;
  }>;
};

interface ProductEditorProps {
  productId?: string;
}

export function ProductEditor({ productId }: ProductEditorProps) {
  const isNew = !productId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const canManage = Boolean(user && canManageCatalog(user.role));
  const [message, setMessage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pendingImages, setPendingImages] = useState<
    Array<{ id: string; file: File; previewUrl: string }>
  >([]);
  const pendingImagesRef = useRef(pendingImages);
  pendingImagesRef.current = pendingImages;
  const [orderedImages, setOrderedImages] = useState<ProductImage[]>([]);
  const [reordering, setReordering] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => apiFetch<Category[]>("/categories"),
    enabled: Boolean(user?.companyId),
  });

  const { data: product, isLoading } = useQuery({
    queryKey: ["product", productId],
    queryFn: () => apiFetch<ProductDetails>(`/products/${productId}`),
    enabled: Boolean(user?.companyId) && Boolean(productId),
  });

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema) as never,
    defaultValues: {
      name: "",
      description: "",
      categoryId: "",
      status: "draft",
      variants: [{ sku: "DEFAULT", name: "Default", price: 0, stock: 0, compareAtPrice: "" }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: "variants" });
  const status = watch("status");
  const categoryId = watch("categoryId");
  const [optionGroups, setOptionGroups] = useState([
    { name: "", values: "" },
    { name: "", values: "" },
  ]);
  const [matrixPrice, setMatrixPrice] = useState("0");
  const [matrixStock, setMatrixStock] = useState("0");
  const [matrixDialogOpen, setMatrixDialogOpen] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);

  useEffect(() => {
    if (!product) {
      return;
    }
    reset({
      name: product.name,
      description: product.description ?? "",
      categoryId: product.categoryId ?? "",
      status: product.status,
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        name: variant.name,
        price: variant.price,
        compareAtPrice: variant.compareAtPrice ?? "",
        stock: variant.stock,
      })),
    });
    setOrderedImages(product.images);
  }, [product, reset]);

  useEffect(() => {
    return () => {
      for (const image of pendingImages) {
        URL.revokeObjectURL(image.previewUrl);
      }
    };
    // Solo al desmontar: revocar previews pendientes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveMutation = useMutation({
    mutationFn: async (values: ProductFormValues) => {
      const payload = {
        name: values.name,
        description: values.description || null,
        categoryId: values.categoryId || null,
        status: values.status,
      };

      if (isNew) {
        const created = await apiFetch<ProductDetails>("/products", {
          method: "POST",
          body: JSON.stringify({
            ...payload,
            variants: values.variants.map((variant) => ({
              sku: variant.sku,
              name: variant.name,
              price: variant.price,
              compareAtPrice:
                variant.compareAtPrice === "" || variant.compareAtPrice == null
                  ? null
                  : Number(variant.compareAtPrice),
              stock: variant.stock,
            })),
          }),
        });

        for (const pending of pendingImagesRef.current) {
          try {
            const formData = new FormData();
            formData.append("file", pending.file);
            await apiFetch(`/products/${created.id}/images`, {
              method: "POST",
              body: formData,
            });
          } catch {
            // El producto ya existe; no bloquear la salida de /new por un fallo de imagen
          }
        }

        return created;
      }

      await apiFetch<ProductDetails>(`/products/${productId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const existingIds = new Set(product?.variants.map((variant) => variant.id) ?? []);
      const keptIds = new Set(
        values.variants.map((variant) => variant.id).filter(Boolean) as string[],
      );

      for (const variant of product?.variants ?? []) {
        if (!keptIds.has(variant.id)) {
          await apiFetch<null>(`/products/${productId}/variants/${variant.id}`, {
            method: "DELETE",
          });
        }
      }

      for (const variant of values.variants) {
        const body = {
          sku: variant.sku,
          name: variant.name,
          price: variant.price,
          compareAtPrice:
            variant.compareAtPrice === "" || variant.compareAtPrice == null
              ? null
              : Number(variant.compareAtPrice),
          stock: variant.stock,
        };
        if (variant.id && existingIds.has(variant.id)) {
          await apiFetch<ProductVariant>(`/products/${productId}/variants/${variant.id}`, {
            method: "PATCH",
            body: JSON.stringify(body),
          });
        } else {
          await apiFetch<ProductVariant>(`/products/${productId}/variants`, {
            method: "POST",
            body: JSON.stringify(body),
          });
        }
      }

      return apiFetch<ProductDetails>(`/products/${productId}`);
    },
    onSuccess: async (saved) => {
      for (const image of pendingImages) {
        URL.revokeObjectURL(image.previewUrl);
      }
      setPendingImages([]);
      setMessage("Producto guardado");
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      await queryClient.invalidateQueries({ queryKey: ["product", saved.id] });
      if (isNew) {
        router.replace("/dashboard/products");
        router.refresh();
        return;
      }
      reset({
        name: saved.name,
        description: saved.description ?? "",
        categoryId: saved.categoryId ?? "",
        status: saved.status,
        variants: saved.variants.map((variant) => ({
          id: variant.id,
          sku: variant.sku,
          name: variant.name,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice ?? "",
          stock: variant.stock,
        })),
      });
    },
    onError: (error: unknown) => {
      setMessage(error instanceof ApiClientError ? error.message : "No se pudo guardar");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () =>
      apiFetch<null>(`/products/${productId}`, {
        method: "DELETE",
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      router.push("/dashboard/products");
    },
    onError: (error: unknown) => {
      setMessage(error instanceof ApiClientError ? error.message : "No se pudo eliminar");
    },
  });

  async function handleUpload(fileList: FileList | null) {
    if (!fileList?.[0]) {
      return;
    }

    if (isNew) {
      const accepted: Array<{ id: string; file: File; previewUrl: string }> = [];
      for (const file of Array.from(fileList)) {
        if (!["image/jpeg", "image/png", "image/webp", "image/gif"].includes(file.type)) {
          setMessage("Solo se permiten JPEG, PNG, WebP o GIF");
          continue;
        }
        if (file.size > 5 * 1024 * 1024) {
          setMessage("Alguna imagen supera 5 MB");
          continue;
        }
        accepted.push({
          id: crypto.randomUUID(),
          file,
          previewUrl: URL.createObjectURL(file),
        });
      }
      if (accepted.length > 0) {
        setPendingImages((prev) => [...prev, ...accepted]);
        setMessage(null);
      }
      return;
    }

    if (!productId) {
      return;
    }
    setUploading(true);
    setMessage(null);
    try {
      for (const file of Array.from(fileList)) {
        const formData = new FormData();
        formData.append("file", file);
        await apiFetch(`/products/${productId}/images`, {
          method: "POST",
          body: formData,
        });
      }
      await queryClient.invalidateQueries({ queryKey: ["product", productId] });
      setMessage("Imagen subida");
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "No se pudo subir la imagen");
    } finally {
      setUploading(false);
    }
  }

  function removePendingImage(id: string) {
    setPendingImages((prev) => {
      const target = prev.find((image) => image.id === id);
      if (target) {
        URL.revokeObjectURL(target.previewUrl);
      }
      return prev.filter((image) => image.id !== id);
    });
  }

  async function handleDeleteImage(imageId: string) {
    if (!productId) {
      return;
    }
    setMessage(null);
    try {
      await apiFetch(`/products/${productId}/images/${imageId}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["product", productId] });
      setMessage("Imagen eliminada");
    } catch (error) {
      setMessage(error instanceof ApiClientError ? error.message : "No se pudo eliminar la imagen");
    }
  }

  async function persistImageOrder(next: ProductImage[]) {
    if (!productId) {
      return;
    }
    setReordering(true);
    setMessage(null);
    try {
      const saved = await apiFetch<ProductImage[]>(`/products/${productId}/images/reorder`, {
        method: "PATCH",
        body: JSON.stringify({ imageIds: next.map((image) => image.id) }),
      });
      setOrderedImages(saved);
      await queryClient.invalidateQueries({ queryKey: ["product", productId] });
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      setMessage("Orden de imágenes actualizado. La primera es la portada.");
    } catch (error) {
      setOrderedImages(product?.images ?? []);
      setMessage(error instanceof ApiClientError ? error.message : "No se pudo reordenar");
    } finally {
      setReordering(false);
    }
  }

  function handlePendingReorder(next: GalleryImageItem[]) {
    const byId = new Map(pendingImages.map((image) => [image.id, image]));
    setPendingImages(
      next
        .map((item) => byId.get(item.id))
        .filter((image): image is (typeof pendingImages)[number] => Boolean(image)),
    );
  }

  function handleSavedReorder(next: GalleryImageItem[]) {
    const byId = new Map(orderedImages.map((image) => [image.id, image]));
    const reordered = next
      .map((item) => byId.get(item.id))
      .filter((image): image is ProductImage => Boolean(image));
    setOrderedImages(reordered);
    void persistImageOrder(reordered);
  }

  function applyOptionMatrix() {
    setMatrixError(null);
    const groups = optionGroups
      .map((group) => ({
        name: group.name.trim(),
        values: parseOptionValues(group.values),
      }))
      .filter((group) => group.name.length > 0 && group.values.length > 0);

    if (groups.length === 0) {
      setMatrixError("Define al menos un atributo con valores separados por coma.");
      return;
    }

    const combos = cartesianOptions(groups);
    if (combos.length > 100) {
      setMatrixError("Demasiadas combinaciones (máximo 100). Reduce valores o atributos.");
      return;
    }

    const price = Number(matrixPrice) || 0;
    const stock = Math.max(0, Math.floor(Number(matrixStock) || 0));
    const usedSkus = new Set<string>();
    const next = combos.map((attrs) => {
      const parts = Object.values(attrs);
      let sku = parts.map(slugPart).filter(Boolean).join("-") || "SKU";
      sku = sku.slice(0, 64);
      let unique = sku;
      let n = 2;
      while (usedSkus.has(unique.toLowerCase())) {
        unique = `${sku.slice(0, 60)}-${n++}`.slice(0, 64);
      }
      usedSkus.add(unique.toLowerCase());
      return {
        sku: unique,
        name: parts.join(" / "),
        price,
        stock,
        compareAtPrice: "" as const,
      };
    });

    replace(next);
    setMatrixDialogOpen(false);
    setMessage(`Se generaron ${next.length} variantes. Revisa precio/stock y guarda.`);
  }

  if (!user?.companyId) {
    return <p className="text-sm text-muted-foreground">Selecciona una empresa para continuar.</p>;
  }

  if (!isNew && isLoading) {
    return <p className="text-sm text-muted-foreground">Cargando producto…</p>;
  }

  const readOnly = !canManage;

  return (
    <form
      onSubmit={handleSubmit((values) => {
        setMessage(null);
        saveMutation.mutate(values);
      })}
      className="flex flex-col gap-6"
    >
      <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl font-bold">
            {isNew ? "Nuevo producto" : "Editar producto"}
          </CardTitle>
          <CardDescription>
            {readOnly ? "Solo lectura para tu rol." : "Datos generales del producto."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="product-name">Nombre</Label>
            <Input id="product-name" disabled={readOnly} {...register("name")} />
            {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <Label htmlFor="product-description">Descripción</Label>
            <Textarea id="product-description" disabled={readOnly} {...register("description")} />
          </div>
          <div className="flex flex-col gap-2">
            <Label>Categoría</Label>
            <Select
              value={categoryId || "none"}
              onValueChange={(value) =>
                setValue("categoryId", value === "none" ? "" : value, { shouldDirty: true })
              }
              disabled={readOnly}
            >
              <SelectTrigger aria-label="Categoría">
                <SelectValue placeholder="Sin categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Sin categoría</SelectItem>
                {categories?.map((category) => (
                  <SelectItem key={category.id} value={category.id}>
                    {category.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label>Estado</Label>
            <Select
              value={status}
              onValueChange={(value) =>
                setValue("status", value as ProductStatus, { shouldDirty: true })
              }
              disabled={readOnly}
            >
              <SelectTrigger aria-label="Estado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_STATUSES.map((item) => (
                  <SelectItem key={item} value={item}>
                    {PRODUCT_STATUS_LABELS[item]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="font-heading text-xl font-bold">Variantes e inventario</CardTitle>
            <CardDescription>
              Cada combinación vendible es una variante con su SKU, precio y stock. Si el producto no
              tiene opciones, deja una sola variante.
            </CardDescription>
          </div>
          {canManage && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMatrixError(null);
                  setMatrixDialogOpen(true);
                }}
              >
                <Wand2 className="size-4" aria-hidden />
                Generar desde opciones
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    sku: `SKU-${fields.length + 1}`,
                    name: `Variante ${fields.length + 1}`,
                    price: 0,
                    stock: 0,
                    compareAtPrice: "",
                  })
                }
              >
                Añadir variante
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {fields.map((field, index) => (
            <div key={field.id} className="grid gap-3 rounded-xl border p-3 md:grid-cols-5">
              <input type="hidden" {...register(`variants.${index}.id`)} />
              <div className="flex flex-col gap-1">
                <Label>SKU</Label>
                <Input disabled={readOnly} {...register(`variants.${index}.sku`)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Nombre</Label>
                <Input disabled={readOnly} {...register(`variants.${index}.name`)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Precio</Label>
                <Input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  {...register(`variants.${index}.price`)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Comparado</Label>
                <Input
                  type="number"
                  step="0.01"
                  disabled={readOnly}
                  {...register(`variants.${index}.compareAtPrice`)}
                />
              </div>
              <div className="flex items-end gap-2">
                <div className="flex flex-1 flex-col gap-1">
                  <Label>Stock</Label>
                  <Input
                    type="number"
                    step="1"
                    disabled={readOnly}
                    {...register(`variants.${index}.stock`)}
                  />
                </div>
                {canManage && fields.length > 1 && (
                  <Button type="button" variant="destructive" size="icon" onClick={() => remove(index)}>
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </div>
            </div>
          ))}
          {errors.variants && (
            <p className="text-sm text-destructive">
              {errors.variants.message ?? "Revisa las variantes"}
            </p>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="font-heading text-xl font-bold">Imágenes</CardTitle>
          <CardDescription>
            Opcional. Máx. 5 MB (JPEG, PNG, WebP, GIF).
            {isNew
              ? " Se subirán al guardar. Arrastra para ordenar; la primera será la portada."
              : " Arrastra para reordenar; la primera es la portada."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {canManage && (
            <Label className="inline-flex w-fit cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-sm">
              <Upload className="size-4" aria-hidden />
              {uploading ? "Subiendo…" : isNew ? "Añadir imagen" : "Subir imagen"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                multiple
                className="hidden"
                disabled={uploading || saveMutation.isPending || reordering}
                onChange={(event) => {
                  void handleUpload(event.target.files);
                  event.target.value = "";
                }}
              />
            </Label>
          )}
          {isNew ? (
            <ProductImagesSortable
              images={pendingImages.map((image) => ({
                id: image.id,
                src: image.previewUrl,
                alt: image.file.name,
              }))}
              canManage={canManage}
              disabled={saveMutation.isPending}
              onReorder={handlePendingReorder}
              onRemove={removePendingImage}
            />
          ) : (
            <ProductImagesSortable
              images={orderedImages.map((image) => ({
                id: image.id,
                src: image.url,
                alt: image.alt ?? product?.name ?? "Producto",
              }))}
              canManage={canManage}
              disabled={reordering || uploading}
              onReorder={handleSavedReorder}
              onRemove={(id) => {
                void handleDeleteImage(id);
              }}
            />
          )}
          {isNew && pendingImages.length === 0 && (
            <p className="text-sm text-muted-foreground">Sin imágenes (opcional).</p>
          )}
          {!isNew && orderedImages.length === 0 && (
            <p className="text-sm text-muted-foreground">Aún no hay imágenes.</p>
          )}
        </CardContent>
      </Card>

      {message && <p className="text-sm text-muted-foreground">{message}</p>}

      {canManage && (
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saveMutation.isPending || (!isNew && !isDirty)}>
            {saveMutation.isPending ? "Guardando…" : "Guardar producto"}
          </Button>
          {!isNew && (
            <Button
              type="button"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm("¿Eliminar este producto y sus variantes?")) {
                  deleteMutation.mutate();
                }
              }}
            >
              Eliminar producto
            </Button>
          )}
          <Button type="button" variant="outline" onClick={() => router.push("/dashboard/products")}>
            Volver
          </Button>
        </div>
      )}

      <Dialog
        open={matrixDialogOpen}
        onOpenChange={(open) => {
          setMatrixDialogOpen(open);
          if (!open) {
            setMatrixError(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Generar variantes</DialogTitle>
            <DialogDescription>
              Define atributos libres y valores separados por coma. Se crearán todas las
              combinaciones (reemplazan las variantes actuales del formulario).
            </DialogDescription>
          </DialogHeader>

          <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto py-1">
            {optionGroups.map((group, index) => (
              <div key={index} className="grid gap-2 sm:grid-cols-[140px_1fr_auto]">
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`option-name-${index}`}>Atributo</Label>
                  <Input
                    id={`option-name-${index}`}
                    placeholder="ej. talla"
                    value={group.name}
                    onChange={(event) => {
                      const next = [...optionGroups];
                      next[index] = { ...next[index], name: event.target.value };
                      setOptionGroups(next);
                    }}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label htmlFor={`option-values-${index}`}>Valores</Label>
                  <Input
                    id={`option-values-${index}`}
                    placeholder="valor1, valor2, valor3"
                    value={group.values}
                    onChange={(event) => {
                      const next = [...optionGroups];
                      next[index] = { ...next[index], values: event.target.value };
                      setOptionGroups(next);
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="mt-6 self-start"
                  disabled={optionGroups.length <= 1}
                  onClick={() => setOptionGroups(optionGroups.filter((_, i) => i !== index))}
                >
                  <Trash2 aria-hidden />
                </Button>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              onClick={() => setOptionGroups([...optionGroups, { name: "", values: "" }])}
            >
              Añadir atributo
            </Button>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="matrix-price">Precio inicial</Label>
                <Input
                  id="matrix-price"
                  type="number"
                  step="0.01"
                  value={matrixPrice}
                  onChange={(event) => setMatrixPrice(event.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label htmlFor="matrix-stock">Stock inicial</Label>
                <Input
                  id="matrix-stock"
                  type="number"
                  step="1"
                  value={matrixStock}
                  onChange={(event) => setMatrixStock(event.target.value)}
                />
              </div>
            </div>

            {matrixError && <p className="text-sm text-destructive">{matrixError}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setMatrixDialogOpen(false)}>
              Cancelar
            </Button>
            <Button type="button" onClick={applyOptionMatrix}>
              Generar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
