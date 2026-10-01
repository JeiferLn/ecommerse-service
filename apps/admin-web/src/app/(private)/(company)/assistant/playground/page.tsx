import type { Metadata } from "next";

import { AssistantPlaygroundSection } from "@/components/assistant-playground-section";
import { PageHeader } from "@/components/page-header";

export const metadata: Metadata = {
  title: "Prueba tu asistente",
};

export default function AssistantPlaygroundPage() {
  return (
    <div className="flex flex-col">
      <PageHeader
        title="Prueba tu asistente"
        description="Chatea con tu asistente como si fueras un cliente, antes de activarlo en WhatsApp."
        className="mb-6"
      />
      <AssistantPlaygroundSection />
    </div>
  );
}
