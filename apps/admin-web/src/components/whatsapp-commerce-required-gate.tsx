"use client";

import { canEditCompany } from "@commerce-ai/types";
import { Truck } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/providers/session-provider";

export function WhatsAppCommerceRequiredGate() {
  const { user } = useSession();
  const isOwner = Boolean(user && canEditCompany(user.role));

  return (
    <Card className="border-amber-500/40 bg-amber-500/10">
      <CardHeader>
        <CardTitle className="font-heading flex items-center gap-2 text-xl font-bold">
          <Truck className="size-5" aria-hidden />
          Configura envíos para usar WhatsApp
        </CardTitle>
        <CardDescription className="text-amber-950/80 dark:text-amber-50/80">
          {isOwner
            ? "Antes de conectar Twilio o atender chats, debes definir país, alcances de envío y transportadoras."
            : "Solo el dueño de la empresa puede completar los envíos en Configuración. Hasta entonces WhatsApp permanece bloqueado."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isOwner ? (
          <Button asChild>
            <Link href="/settings#envios-y-pagos">Ir a Configuración</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Pide al dueño que complete la sección Envíos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
