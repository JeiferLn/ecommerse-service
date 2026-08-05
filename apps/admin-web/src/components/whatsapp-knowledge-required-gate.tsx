"use client";

import { canManageKnowledge, type KnowledgeDocumentType } from "@commerce-ai/types";
import { BookOpen } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/providers/session-provider";

export function WhatsAppKnowledgeRequiredGate({
  missingTypes,
}: {
  missingTypes: KnowledgeDocumentType[];
}) {
  const { user } = useSession();
  const canManage = Boolean(user && canManageKnowledge(user.role));

  return (
    <Card className="border-amber-500/40 bg-amber-500/10">
      <CardHeader>
        <CardTitle className="font-heading flex items-center gap-2 text-xl font-bold">
          <BookOpen className="size-5" aria-hidden />
          Sube los PDFs de conocimiento
        </CardTitle>
        <CardDescription className="text-amber-950/80 dark:text-amber-50/80">
          {canManage
            ? `WhatsApp requiere los 4 PDFs obligatorios (guía, FAQ, garantías y políticas). Faltan: ${missingTypes.join(", ")}.`
            : "Solo el dueño o un manager pueden subir los PDFs en Configuración. Hasta entonces WhatsApp permanece bloqueado."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {canManage ? (
          <Button asChild>
            <Link href="/dashboard/settings#conocimiento">Ir a Configuración</Link>
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Pide al dueño o manager que complete la sección Conocimiento.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
