"use client";

import {
  canManageKnowledge,
  KNOWLEDGE_DOCUMENT_TYPE_LABELS,
  type KnowledgeDocumentType,
} from "@commerce-ai/types";
import { BookOpen } from "lucide-react";

import { RequirementGate } from "@/components/requirement-gate";
import { useSession } from "@/providers/session-provider";

export function WhatsAppKnowledgeRequiredGate({
  missingTypes,
}: {
  missingTypes: KnowledgeDocumentType[];
}) {
  const { user } = useSession();
  const canManage = Boolean(user && canManageKnowledge(user.role));

  return (
    <RequirementGate
      icon={BookOpen}
      title="Sube tus documentos"
      description={
        canManage
          ? `El asistente responde con 4 PDFs: guía, preguntas frecuentes, garantías y políticas. Faltan: ${missingTypes.map((type) => KNOWLEDGE_DOCUMENT_TYPE_LABELS[type]).join(", ")}.`
          : "Solo el dueño o un manager pueden subir los documentos. Hasta entonces el asistente no atiende en WhatsApp."
      }
      href={canManage ? "/knowledge" : undefined}
      actionLabel="Ir a Conocimiento"
      fallback="Pide al dueño o manager que complete la sección Conocimiento."
    />
  );
}
