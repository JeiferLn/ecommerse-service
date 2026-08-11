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

  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd && !sub.featuresLocked) {
    const until = new Date(sub.currentPeriodEnd).toLocaleDateString("es-CO");
    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
        <p className="inline-flex items-center gap-2">
          <Clock className="size-4 text-amber-700 dark:text-amber-300" aria-hidden />
          Renovación cancelada. Mantienes acceso hasta el {until}.
        </p>
        <Button asChild size="sm" variant="outline">
          <Link href="/billing">Ver facturación</Link>
        </Button>
      </div>
    );
  }

  if (sub.featuresLocked) {
    const lockedMessage =
      sub.status === "past_due"
        ? "Tu periodo de plan venció. Renueva en Facturación para reactivar WhatsApp, IA y nuevas altas."
        : "Tu plan no está activo. Elige un plan para reactivar WhatsApp, IA y nuevas altas.";

    return (
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm">
        <p className="inline-flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" aria-hidden />
          {lockedMessage}
        </p>
        <Button asChild size="sm">
          <Link href="/billing">Elegir plan</Link>
        </Button>
      </div>
    );
  }

  return null;
}
