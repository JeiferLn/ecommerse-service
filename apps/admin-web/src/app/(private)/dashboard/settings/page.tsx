import type { Metadata } from "next";
import { Suspense } from "react";

import { CompanyCommerceSettingsForm } from "@/components/company-commerce-settings-form";
import { CompanyKnowledgeSettingsForm } from "@/components/company-knowledge-settings-form";
import { CompanySettingsForm } from "@/components/company-settings-form";
import { MercadoPagoConnectionSection } from "@/components/mercadopago-connection-section";

export const metadata: Metadata = {
  title: "Configuración | Commerce AI SaaS",
};

export default function SettingsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
          Configuración
        </h1>
        <p className="text-muted-foreground">
          Administra el perfil de tu empresa, Mercado Pago, envíos y los PDFs que alimentan al bot.
          Conecta pagos antes de activar WhatsApp.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CompanySettingsForm />
        <Suspense fallback={<p className="text-sm text-muted-foreground">Cargando pagos…</p>}>
          <MercadoPagoConnectionSection />
        </Suspense>
        <CompanyCommerceSettingsForm />
        <div className="xl:col-span-2">
          <CompanyKnowledgeSettingsForm />
        </div>
      </div>
    </div>
  );
}
