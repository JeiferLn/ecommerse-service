import type { Metadata } from "next";

import { CompanyKnowledgeSettingsForm } from "@/components/company-knowledge-settings-form";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Conocimiento",
};

export default function KnowledgePage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Conocimiento"
        description="Los documentos con los que el asistente responde sobre tu tienda: guía, preguntas frecuentes, garantías y políticas."
        className="mb-6"
      />
      <CompanyKnowledgeSettingsForm />
    </div>
  );
}
