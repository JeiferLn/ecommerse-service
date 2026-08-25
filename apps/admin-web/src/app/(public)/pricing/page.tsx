"use client";

import type { BillingInterval, PlanView } from "@commerce-ai/types";
import { useQuery } from "@tanstack/react-query";
import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { PublicSiteHeader } from "@/components/public-site-header";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

function planBlurb(code: string): string {
  if (code === "free") return "Para conocer el poder de la IA";
  if (code === "pro") return "Para negocios en crecimiento";
  if (code === "business") return "Para operaciones a escala";
  return "Elige el plan de tu tienda";
}

function planCta(plan: PlanView): string {
  if (plan.code === "free") return "Iniciar prueba";
  if (plan.highlighted) return `Seleccionar ${plan.name}`;
  return `Elegir ${plan.name}`;
}

function planBullets(plan: PlanView): string[] {
  if (plan.code === "free") {
    return [
      "15 días de acceso total",
      "Integración básica WhatsApp",
      `Hasta ${plan.maxAiRepliesMonth.toLocaleString("es-CO")} respuestas IA`,
    ];
  }

  const bullets = [
    `${plan.maxWaMessagesMonth.toLocaleString("es-CO")} msgs WhatsApp/mes`,
    `${plan.maxProducts} productos / ${plan.maxVariants} variantes`,
    "Integración Mercado Pago",
    `${plan.maxAiRepliesMonth.toLocaleString("es-CO")} respuestas IA/mes`,
    `${plan.maxKnowledgeDocs} docs de conocimiento (RAG)`,
    `${plan.maxMembers} miembros`,
    "Ventas tienda + pedidos WhatsApp",
  ];

  if (plan.code === "business") {
    return [
      "Todo lo del plan Pro, más:",
      "Handoff a agente humano",
      `${plan.maxKnowledgeDocs} docs RAG (políticas, FAQs)`,
      `${plan.maxMembers} miembros · ${plan.maxProducts} productos`,
      `${plan.maxAiRepliesMonth.toLocaleString("es-CO")} respuestas IA/mes`,
    ];
  }

  return bullets;
}

function priceParts(
  plan: PlanView,
  interval: BillingInterval,
): { amount: string; suffix: string; note?: string } {
  if (plan.code === "free" || plan.priceUsdCents <= 0) {
    return { amount: "$0", suffix: "/ 15 días" };
  }
  if (interval === "year") {
    const perMonth = Math.round(plan.priceYearUsdCents / 12 / 100);
    return {
      amount: `$${perMonth}`,
      suffix: "/ mes",
      note: `Cobro anual $${Math.round(plan.priceYearUsdCents / 100)} USD · 2 meses gratis`,
    };
  }
  return {
    amount: `$${(plan.priceUsdCents / 100).toFixed(0)}`,
    suffix: "/ mes",
    note: "Facturación recurrente mensual",
  };
}

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const { data: plans, isLoading, isError } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () => apiFetch<PlanView[]>("/billing/plans"),
  });

  return (
    <div className="hero-bg-light relative min-h-screen overflow-hidden bg-background text-foreground antialiased">
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="animate-blob absolute right-[10%] top-[10%] size-[40vw] rounded-full bg-primary/20 blur-[100px] mix-blend-multiply dark:mix-blend-screen" />
        <div
          className="animate-blob absolute bottom-[-10%] left-[5%] size-[50vw] rounded-full bg-primary/10 blur-[120px] mix-blend-multiply dark:bg-[#59307f]/20 dark:mix-blend-screen"
          style={{ animationDelay: "2s" }}
        />
      </div>

      <PublicSiteHeader current="pricing" />

      <main className="relative z-10 mx-auto max-w-7xl px-5 pb-24 pt-[120px] sm:px-10">
        <div className="mb-12 text-center">
          <h1 className="font-heading mb-3 text-4xl font-extrabold leading-[1.1] tracking-tight text-foreground sm:text-5xl lg:text-[56px] lg:leading-[64px]">
            Inteligencia de precisión para tu comercio
          </h1>
          <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Elige el plan que mejor se adapte al crecimiento de tu marca. Transforma la experiencia
            de tus clientes con IA de primer nivel.
          </p>

          <div className="relative z-20 mb-2 inline-flex items-center gap-1 rounded-full border border-border/70 bg-muted/50 p-1 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#1d2028]/50">
            <button
              type="button"
              onClick={() => setInterval("month")}
              className={cn(
                "min-h-11 rounded-full px-5 py-2 text-sm font-semibold transition-all",
                interval === "month"
                  ? "bg-background text-primary shadow-sm ring-1 ring-border dark:bg-[#282a33] dark:ring-white/10"
                  : "text-muted-foreground hover:text-primary",
              )}
            >
              Mensual
            </button>
            <button
              type="button"
              onClick={() => setInterval("year")}
              className={cn(
                "inline-flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-full px-5 py-1.5 text-sm font-semibold leading-tight transition-all",
                interval === "year"
                  ? "bg-background text-primary shadow-sm ring-1 ring-border dark:bg-[#282a33] dark:ring-white/10"
                  : "text-muted-foreground hover:text-primary",
              )}
            >
              Anual
              <span className="text-[10px] font-bold tracking-wide text-primary whitespace-nowrap">
                2 meses gratis
              </span>
            </button>
          </div>
        </div>

        {isLoading && <p className="text-center text-sm text-muted-foreground">Cargando planes…</p>}
        {isError && (
          <p className="text-center text-sm text-destructive">No se pudieron cargar los planes.</p>
        )}

        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-3 md:items-stretch lg:gap-6">
          {(plans ?? []).map((plan) => {
            const isFree = plan.code === "free";
            const highlighted = Boolean(plan.highlighted);
            const { amount, suffix, note } = priceParts(plan, interval);
            const href = isFree
              ? `/register?plan=${plan.code}`
              : `/register?plan=${plan.code}&interval=${interval}`;

            return (
              <article
                key={plan.code}
                className={cn(
                  "glass-panel-pricing relative flex flex-col rounded-[24px] p-8 transition-shadow",
                  highlighted
                    ? "border-2 border-primary shadow-lg hover:shadow-xl md:-translate-y-4"
                    : "hover:shadow-md",
                )}
              >
                {highlighted && (
                  <div className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary px-4 py-1.5 text-[12px] font-bold uppercase tracking-wide text-primary-foreground shadow-md">
                    Más popular
                  </div>
                )}

                <div className={cn("mb-6", highlighted && "mt-2")}>
                  <h2 className="font-heading mb-1 text-2xl font-bold">
                    {isFree ? "Prueba Gratis" : plan.name}
                  </h2>
                  <p className="text-sm text-muted-foreground">{planBlurb(plan.code)}</p>
                </div>

                <div className="mb-2 flex items-baseline gap-2">
                  <span className="font-heading text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-[72px] lg:leading-[80px]">
                    {amount}
                  </span>
                  <span className="text-sm text-muted-foreground">{suffix}</span>
                </div>
                <p className="mb-6 text-xs text-muted-foreground">
                  {isFree ? "Luego pasas a un plan de pago para seguir" : (note ?? "")}
                </p>

                <ul className="mb-10 flex flex-grow flex-col gap-2">
                  {planBullets(plan).map((bullet) => (
                    <li key={bullet} className="flex items-start gap-2 text-sm">
                      <CircleCheck
                        className="mt-0.5 size-5 shrink-0 fill-primary text-primary-foreground"
                        aria-hidden
                      />
                      <span
                        className={bullet.startsWith("Todo lo del") ? "font-semibold" : undefined}
                      >
                        {bullet}
                      </span>
                    </li>
                  ))}
                </ul>

                <Link
                  href={href}
                  className={cn(
                    "mt-auto block w-full rounded-xl py-3 text-center text-base font-semibold",
                    highlighted ? "premium-btn-primary text-white" : "premium-btn-outline",
                  )}
                >
                  {planCta(plan)}
                </Link>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
