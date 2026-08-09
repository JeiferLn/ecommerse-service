import type { Metadata } from "next";

import { InStoreSaleForm } from "@/components/in-store-sale-form";

export const metadata: Metadata = {
  title: "Ventas tienda | Commerce AI SaaS",
};

export default function SalesPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Ventas de tienda
        </h1>
        <p className="text-muted-foreground">
          Registra ventas físicas para llevar inventario e ingresos junto a los pedidos de WhatsApp.
        </p>
      </div>
      <InStoreSaleForm />
    </div>
  );
}
