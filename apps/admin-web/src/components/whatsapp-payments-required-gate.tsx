"use client";

import { canEditCompany } from "@commerce-ai/types";
import { CreditCard } from "lucide-react";

import { RequirementGate } from "@/components/requirement-gate";
import { useSession } from "@/providers/session-provider";

export function WhatsAppPaymentsRequiredGate() {
  const { user } = useSession();
  const isOwner = Boolean(user && canEditCompany(user.role));

  return (
    <RequirementGate
      icon={CreditCard}
      title="Conecta Mercado Pago"
      description={
        isOwner
          ? "Los pedidos se cobran en la cuenta Mercado Pago de tu empresa. Conéctala antes de activar el asistente."
          : "Solo el dueño puede conectar Mercado Pago. Hasta entonces el asistente no atiende en WhatsApp."
      }
      href={isOwner ? "/settings/payments" : undefined}
      actionLabel="Ir a Pagos"
      fallback="Pide al dueño que conecte Mercado Pago."
    />
  );
}
