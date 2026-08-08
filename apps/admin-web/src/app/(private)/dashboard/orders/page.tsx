import type { Metadata } from "next";

import { OrdersSection } from "@/components/orders-section";

export const metadata: Metadata = {
  title: "Pedidos | Commerce AI SaaS",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">Pedidos</h1>
        <p className="text-muted-foreground">
          Carrito y pedidos tomados por WhatsApp. El cobro por pasarela llega en la Fase 9; aquí
          gestionas estados e historial.
        </p>
      </div>
      <OrdersSection initialConversationId={params.conversationId ?? null} />
    </div>
  );
}
