import type { Metadata } from "next";

import { ProductEditor } from "@/components/product-editor";

export const metadata: Metadata = {
  title: "Producto | Commerce AI SaaS",
};

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Producto</h1>
        <p className="text-muted-foreground">Detalle, variantes, stock e imágenes.</p>
      </div>
      <ProductEditor productId={id} />
    </div>
  );
}
