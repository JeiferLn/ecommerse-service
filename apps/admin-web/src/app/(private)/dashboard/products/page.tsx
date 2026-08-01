import type { Metadata } from "next";

import { ProductsSection } from "@/components/products-section";

export const metadata: Metadata = {
  title: "Productos | Commerce AI SaaS",
};

export default function ProductsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Productos</h1>
        <p className="text-muted-foreground">Administra el catálogo de tu empresa activa.</p>
      </div>
      <ProductsSection />
    </div>
  );
}
