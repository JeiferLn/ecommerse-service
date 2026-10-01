import type { ReactNode } from "react";

import { PageHeader } from "@/components/page-header";
import { SettingsTabs } from "@/components/settings-tabs";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex max-w-4xl flex-col">
      <PageHeader
        title="Configuración"
        description="Los datos de tu tienda, cómo cobras y a dónde envías."
        className="mb-6"
      />
      <SettingsTabs />
      {children}
    </div>
  );
}
