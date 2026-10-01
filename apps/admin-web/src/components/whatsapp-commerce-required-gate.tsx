"use client";

import { canEditCompany } from "@commerce-ai/types";
import { Truck } from "lucide-react";

import { RequirementGate } from "@/components/requirement-gate";
import { useSession } from "@/providers/session-provider";

export function WhatsAppCommerceRequiredGate() {
  const { user } = useSession();
  const isOwner = Boolean(user && canEditCompany(user.role));

  return (
    <RequirementGate
      icon={Truck}
      title="Configura tus envíos"
      description={
        isOwner
          ? "Antes de que el asistente atienda chats, define desde dónde despachas, a qué zonas llegas y con qué transportadoras."
          : "Solo el dueño de la empresa puede completar los envíos. Hasta entonces el asistente no atiende en WhatsApp."
      }
      href={isOwner ? "/settings/shipping" : undefined}
      actionLabel="Ir a Envíos"
      fallback="Pide al dueño que complete la sección Envíos."
    />
  );
}
