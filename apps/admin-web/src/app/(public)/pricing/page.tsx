"use client";

import type { PlanView } from "@commerce-ai/types";
import { useQuery } from "@tanstack/react-query";
import { Check, Sparkles } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

function formatUsd(cents: number): string {
  if (cents <= 0) {
    return "Gratis";
  }
  return `$${(cents / 100).toFixed(0)} USD/mes`;
}

function planBullets(plan: PlanView): string[] {
  return [
    `${plan.maxMembers} miembros`,
    `${plan.maxProducts} productos / ${plan.maxVariants} variantes`,
    `${plan.maxWaMessagesMonth.toLocaleString("es-CO")} msgs WhatsApp/mes`,
    `${plan.maxAiRepliesMonth.toLocaleString("es-CO")} respuestas IA/mes`,
    `${plan.maxKnowledgeDocs} docs de conocimiento`,
    "Ventas tienda + pedidos WhatsApp",
  ];
}

export default function PricingPage() {
  const { data: plans, isLoading, isError } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () => apiFetch<PlanView[]>("/billing/plans"),
  });

  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div aria-hidden className="surface-mesh pointer-events-none absolute inset-0 opacity-70" />

      <header className="relative z-20 flex items-center justify-between px-6 py-5 sm:px-10">
        <BrandMark size="md" />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/login">Iniciar sesión</Link>
          </Button>
          <Button asChild>
            <Link href="/register?plan=free">Probar 15 días</Link>
          </Button>
        </nav>
      </header>

      <section className="relative z-10 mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 pb-20 pt-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="font-heading text-4xl font-extrabold tracking-tight text-primary sm:text-5xl">
            Planes
          </p>
          <h1 className="mt-3 text-balance text-2xl font-semibold tracking-tight sm:text-3xl">
            Empieza con 15 días de prueba
          </h1>
          <p className="mt-3 text-muted-foreground">
            Sin tarjeta para el trial. Precios en USD (o equivalente local al pagar). Después eliges
            Pro o Business para seguir vendiendo.
          </p>
        </div>

        {isLoading && <p className="text-center text-sm text-muted-foreground">Cargando planes…</p>}
        {isError && (
          <p className="text-center text-sm text-destructive">No se pudieron cargar los planes.</p>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          {(plans ?? []).map((plan) => {
            const isFree = plan.code === "free";
            return (
              <Card
                key={plan.code}
                className={cn(
                  "border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm",
                  plan.highlighted && "border-primary/60 ring-1 ring-primary/30",
                )}
              >
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <CardTitle className="font-heading text-xl">{plan.name}</CardTitle>
                    {plan.highlighted ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        <Sparkles className="size-3" aria-hidden />
                        Popular
                      </span>
                    ) : null}
                  </div>
                  <CardDescription className="text-2xl font-bold text-foreground">
                    {isFree ? "15 días gratis" : formatUsd(plan.priceUsdCents)}
                  </CardDescription>
                  {isFree ? (
                    <p className="text-xs text-muted-foreground">Luego debes pasar a un plan de pago</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Facturación mensual</p>
                  )}
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <ul className="flex flex-col gap-2 text-sm">
                    {planBullets(plan).map((bullet) => (
                      <li key={bullet} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                  <Button asChild className="w-full" variant={plan.highlighted ? "default" : "outline"}>
                    <Link href={`/register?plan=${plan.code}`}>
                      {isFree ? "Empezar prueba" : `Elegir ${plan.name}`}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>
    </main>
  );
}
