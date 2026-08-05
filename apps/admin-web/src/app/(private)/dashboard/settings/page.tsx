import type { Metadata } from "next";

import { CompanyCommerceSettingsForm } from "@/components/company-commerce-settings-form";
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
          Administra el perfil de tu empresa y cómo envía el bot. El pago irá por pasarela.
        </p>
      </div>
      <CompanySettingsForm />
      <CompanyCommerceSettingsForm />
    </div>
  );
}
