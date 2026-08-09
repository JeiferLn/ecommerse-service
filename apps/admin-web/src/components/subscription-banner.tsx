"use client";

import type { SubscriptionSummary } from "@commerce-ai/types";
import { AlertTriangle, Clock } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { useSession } from "@/providers/session-provider";

export function SubscriptionBanner() {
  const { user } = useSession();
  const sub = user?.subscription as SubscriptionSummary | null | undefined;
  if (!sub || user?.role === "admin") {
    return null;
  }

  if (sub.status === "trialing" && sub.trialDaysLeft != null) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm">
        <p className="inline-flex items-center gap-2">
          <Clock className="size-4 text-primary" aria-hidden />
          Prueba gratuita: {sub.trialDaysLeft} día(s) restante(s)
          {sub.checkoutRequired ? " · Tienes un plan de pago pendiente" : ""}
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href="/billing">Ver facturación</Link>
        </Button>
      </div>
    );
  }

  if (sub.featuresLocked) {
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        <p className="inline-flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" aria-hidden />
          Tu prueba terminó. Elige un plan para reactivar WhatsApp, IA y nuevas altas.
        </p>
        <Button asChild size="sm">
          <Link href="/billing">Elegir plan</Link>
        </Button>
      </div>
    );
  }

  return null;
}
