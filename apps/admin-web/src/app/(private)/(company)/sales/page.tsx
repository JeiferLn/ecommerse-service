import type { Metadata } from "next";

import { InStoreSaleForm } from "@/components/in-store-sale-form";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Nueva venta",
};

export default function SalesPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Nueva venta"
        description="Registra ventas en tienda física para llevar el inventario y los ingresos junto a los pedidos de WhatsApp."
        className="mb-6"
      />
      <InStoreSaleForm />
    </div>
  );
}
