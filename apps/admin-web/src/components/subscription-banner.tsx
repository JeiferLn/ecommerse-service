"use client";

import type { SubscriptionSummary } from "@commerce-ai/types";
import { AlertTriangle, ArrowRight, Clock, type LucideIcon } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

type Tone = "neutral" | "attention" | "negative";

const TONE: Record<Tone, { strip: string; icon: string }> = {
  neutral: { strip: "bg-muted/60", icon: "text-muted-foreground" },
  attention: { strip: "bg-warning-soft", icon: "text-warning" },
  negative: { strip: "bg-destructive/10", icon: "text-destructive" },
};

function Strip({
  tone,
  icon: Icon,
  message,
  cta,
}: {
  tone: Tone;
  icon: LucideIcon;
  message: string;
  cta: string;
}) {
  const t = TONE[tone];
  return (
    <div
      role="status"
      className={cn(
        "flex min-h-10 items-center justify-between gap-3 border-b border-border px-4 py-2 text-sm sm:px-8",
        t.strip,
      )}
    >
      <p className="inline-flex min-w-0 items-center gap-2">
        <Icon className={cn("size-4 shrink-0", t.icon)} aria-hidden />
        <span className="truncate">{message}</span>
      </p>
      <Link
        href="/billing"
        className="inline-flex shrink-0 items-center gap-1 font-medium underline-offset-4 hover:underline"
      >
        {cta}
        <ArrowRight className="size-3.5" aria-hidden />
      </Link>
    </div>
  );
}

export function SubscriptionBanner() {
  const { user } = useSession();
  const sub = user?.subscription as SubscriptionSummary | null | undefined;
  if (!sub || user?.role === "admin") {
    return null;
  }

  if (sub.status === "trialing" && sub.trialDaysLeft != null) {
    return (
      <Strip
        tone="neutral"
        icon={Clock}
        message={`Prueba gratuita: ${sub.trialDaysLeft} día(s) restante(s)${
          sub.checkoutRequired ? " · Tienes un plan de pago pendiente" : ""
        }`}
        cta="Ver facturación"
      />
    );
  }

  if (sub.cancelAtPeriodEnd && sub.currentPeriodEnd && !sub.featuresLocked) {
    const until = new Date(sub.currentPeriodEnd).toLocaleDateString("es-CO");
    return (
      <Strip
        tone="attention"
        icon={Clock}
        message={`Renovación cancelada. Mantienes acceso hasta el ${until}.`}
        cta="Ver facturación"
      />
    );
  }

  if (sub.featuresLocked) {
    const lockedMessage =
      sub.status === "past_due"
        ? "Tu periodo de plan venció. Renueva en Facturación para reactivar WhatsApp, IA y nuevas altas."
        : "Tu plan no está activo. Elige un plan para reactivar WhatsApp, IA y nuevas altas.";

    return <Strip tone="negative" icon={AlertTriangle} message={lockedMessage} cta="Elegir plan" />;
  }

  return null;
}
