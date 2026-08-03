import type { Metadata } from "next";

import { WhatsAppConnectionSection } from "@/components/whatsapp-connection-section";

export const metadata: Metadata = {
  title: "WhatsApp | Commerce AI SaaS",
};

export default function WhatsAppPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">WhatsApp</h1>
        <p className="text-muted-foreground">
          Conecta el número de tu empresa y prueba el flujo con simulación mientras Meta no entrega
          credenciales.
        </p>
      </div>
      <WhatsAppConnectionSection />
    </div>
  );
}
