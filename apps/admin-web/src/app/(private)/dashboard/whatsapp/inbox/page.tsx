import type { Metadata } from "next";

import { WhatsAppInboxSection } from "@/components/whatsapp-inbox-section";

export const metadata: Metadata = {
  title: "Inbox WhatsApp | Commerce AI SaaS",
};

export default function WhatsAppInboxPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Inbox WhatsApp
        </h1>
        <p className="text-muted-foreground">
          Conversaciones de la empresa activa. El auto-reply usa IA (OpenRouter) sobre el catálogo
          activo si está configurado en el backend; también puedes responder manualmente.
        </p>
      </div>
      <WhatsAppInboxSection />
    </div>
  );
}
