"use client";

import { canEditCompany } from "@commerce-ai/types";
import { CreditCard } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/providers/session-provider";

export function WhatsAppPaymentsRequiredGate() {
  const { user } = useSession();
  const isOwner = Boolean(user && canEditCompany(user.role));

  return (
    <Card className="border-amber-500/40 bg-amber-500/10">
      <CardHeader>
        <CardTitle className="font-heading flex items-center gap-2 text-xl font-bold">
          <CreditCard className="size-5" aria-hidden />
          Conecta Mercado Pago para usar WhatsApp
        </CardTitle>
        <CardDescription className="text-amber-950/80 dark:text-amber-50/80">
          {isOwner
            ? "Los pedidos se cobran en la cuenta Mercado Pago de tu empresa. Conéctala en Configuración antes de activar WhatsApp."
            : "Solo el dueño puede conectar Mercado Pago en Configuración. Hasta entonces WhatsApp permanece bloqueado."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isOwner ? (
          <Button asChild>
            <Link href="/dashboard/settings#pagos-mercadopago">Ir a Pagos</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Pide al dueño que conecte Mercado Pago.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
