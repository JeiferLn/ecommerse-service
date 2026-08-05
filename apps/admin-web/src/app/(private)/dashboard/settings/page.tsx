import type { Metadata } from "next";

import { CompanyCommerceSettingsForm } from "@/components/company-commerce-settings-form";
import { CompanyKnowledgeSettingsForm } from "@/components/company-knowledge-settings-form";
import { CompanySettingsForm } from "@/components/company-settings-form";

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
          Administra el perfil de tu empresa, envíos y los PDFs que alimentan al bot. El pago irá por
          pasarela.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <CompanySettingsForm />
        <CompanyCommerceSettingsForm />
        <div className="xl:col-span-2">
          <CompanyKnowledgeSettingsForm />
        </div>
      </div>
    </div>
  );
}
