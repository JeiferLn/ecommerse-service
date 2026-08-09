import type { Metadata } from "next";

import { NewProductGate } from "@/components/new-product-gate";

export const metadata: Metadata = {
  title: "Nuevo producto | Commerce AI SaaS",
};

export default function NewProductPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Nuevo producto
        </h1>
        <p className="text-muted-foreground">Crea un producto con variantes e inventario.</p>
      </div>
      <NewProductGate />
    </div>
  );
}
