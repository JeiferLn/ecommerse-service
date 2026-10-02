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
        description="Documentos opcionales que mejoran las respuestas del asistente: guía, preguntas frecuentes, garantías y políticas."
        className="mb-6"
      />
      <CompanyKnowledgeSettingsForm />
    </div>
  );
}
