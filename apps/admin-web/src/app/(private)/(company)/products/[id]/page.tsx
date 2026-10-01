import type { Metadata } from "next";

import { ProductEditor } from "@/components/product-editor";

export const metadata: Metadata = {
  title: "Producto",
};

export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return <ProductEditor productId={id} />;
}
