import type { Metadata } from "next";
import { Suspense } from "react";

import { PageHeader } from "@/components/page-header";
import { WhatsAppInboxSection } from "@/components/whatsapp-inbox-section";

export const metadata: Metadata = {
  title: "Conversaciones",
};

export default function WhatsAppInboxPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        compact
        title="Conversaciones"
        description="El asistente responde solo; puedes tomar cualquier chat cuando quieras."
      />
      <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando…</p>}>
        <WhatsAppInboxSection />
      </Suspense>
    </div>
  );
}
