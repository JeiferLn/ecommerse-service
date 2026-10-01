import type { Metadata } from "next";

import { OrdersSection } from "@/components/orders-section";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Pedidos",
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ conversationId?: string; id?: string; status?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Pedidos"
        description="Ventas de WhatsApp y de tienda física. Los cobros de Mercado Pago quedan como Pagado y las ventas de mostrador como Entregado."
        className="mb-6"
      />
      <OrdersSection
        initialConversationId={params.conversationId ?? null}
        initialOrderId={params.id ?? null}
        initialStatus={params.status ?? null}
      />
    </div>
  );
}
