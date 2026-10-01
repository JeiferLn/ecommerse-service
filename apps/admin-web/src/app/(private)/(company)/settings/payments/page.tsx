import type { Metadata } from "next";
import { Suspense } from "react";

import { MercadoPagoConnectionSection } from "@/components/mercadopago-connection-section";
import { SkeletonText } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Pagos",
};

export default function PaymentsSettingsPage() {
  return (
    <Suspense fallback={<SkeletonText lines={4} className="max-w-md" />}>
      <MercadoPagoConnectionSection />
    </Suspense>
  );
}
