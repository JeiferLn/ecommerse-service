import type { Metadata } from "next";

import { PageHeader } from "@/components/page-header";
import { WhatsAppConnectionSection } from "@/components/whatsapp-connection-section";

export const metadata: Metadata = {
  title: "Canal WhatsApp",
};

export default function WhatsAppPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Canal WhatsApp"
        description="El número donde tu asistente atiende a tus clientes."
        className="mb-6"
      />
      <WhatsAppConnectionSection />
    </div>
  );
}
