"use client";

import type { BillingInterval, PlanView } from "@commerce-ai/types";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarCheck, Check, CreditCard, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState, type CSSProperties } from "react";

import { Backdrop } from "@/components/site/backdrop";
import { Reveal } from "@/components/site/reveal";
import { SiteFaq, type FaqItem } from "@/components/site/site-faq";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Words, accentWords } from "@/components/site/words";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

function planBlurb(code: string): string {
  if (code === "free") return "Para conocer el asistente con tu catálogo";
  if (code === "pro") return "Para tiendas que venden todos los días";
  if (code === "business") return "Para operaciones con más volumen y equipo";
  return "Elige el plan de tu tienda";
}

function planCta(plan: PlanView): string {
  if (plan.code === "free") return "Empezar prueba gratis";
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
    `${plan.maxMembers} miembros`,
    "Ventas tienda + pedidos WhatsApp",
  ];

  if (plan.code === "business") {
    return [
      "Todo lo del plan Pro, más:",
      "Handoff a agente humano",
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

const COMPARISON: { label: string; value: (plan: PlanView) => string }[] = [
  {
    label: "Periodo",
    value: (plan) => (plan.code === "free" ? "15 días" : "Mensual o anual"),
  },
  { label: "Miembros del equipo", value: (plan) => plan.maxMembers.toLocaleString("es-CO") },
  { label: "Productos", value: (plan) => plan.maxProducts.toLocaleString("es-CO") },
  { label: "Variantes", value: (plan) => plan.maxVariants.toLocaleString("es-CO") },
  {
    label: "Mensajes de WhatsApp al mes",
    value: (plan) => plan.maxWaMessagesMonth.toLocaleString("es-CO"),
  },
  {
    label: "Respuestas de IA al mes",
    value: (plan) => plan.maxAiRepliesMonth.toLocaleString("es-CO"),
  },
];

const ASSURANCES = [
  { icon: CreditCard, title: "Free sin tarjeta", text: "15 días con el asistente activo." },
  { icon: ShieldCheck, title: "Cobro con Mercado Pago", text: "Suscripción segura, en USD." },
  { icon: CalendarCheck, title: "Cancelas cuando quieras", text: "Conservas el acceso pagado." },
];

const FAQ: FaqItem[] = [
  {
    question: "¿Puedo cancelar cuando quiera?",
    answer:
      "Sí. Cancelas la renovación desde Facturación y conservas el acceso hasta el final del periodo que ya pagaste.",
  },
  {
    question: "¿Cómo funciona el plan anual?",
    answer: "Pagas 10 meses y usas 12. Se cobra una vez al año con Mercado Pago.",
  },
  {
    question: "¿Qué pasa cuando terminan los 15 días de Free?",
    answer:
      "Tu cuenta y tu catálogo se conservan. WhatsApp, la IA y las nuevas altas se pausan hasta que eliges Pro o Business.",
  },
  {
    question: "¿Cómo se cobra?",
    answer:
      "Con una suscripción recurrente de Mercado Pago, mensual o anual. Los precios están en dólares (USD).",
  },
];

const eyebrow = "font-data text-xs tracking-wider text-muted-foreground uppercase";

function IntervalToggle({
  value,
  onChange,
}: {
  value: BillingInterval;
  onChange: (value: BillingInterval) => void;
}) {
  const options: { value: BillingInterval; label: string; hint: string }[] = [
    { value: "month", label: "Mensual", hint: "Mes a mes" },
    { value: "year", label: "Anual", hint: "2 meses gratis" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="Ciclo de facturación"
      className="relative inline-grid grid-cols-2 gap-1 rounded-xl border border-border bg-card/60 p-1 backdrop-blur"
    >
      <span
        aria-hidden
        className={cn(
          "absolute inset-y-1 left-1 w-[calc(50%-0.375rem)] rounded-lg bg-secondary ring-1 ring-border transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          value === "year" && "translate-x-[calc(100%+0.25rem)]",
        )}
      />
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              "relative flex min-w-36 flex-col items-start rounded-lg px-4 py-2.5 text-left transition-colors focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <span className="text-sm font-medium">{option.label}</span>
            <span
              className={cn(
                "font-data text-[11px]",
                option.value === "year" ? "text-primary" : "text-muted-foreground",
              )}
            >
              {option.hint}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function PlanCard({ plan, interval }: { plan: PlanView; interval: BillingInterval }) {
  const isFree = plan.code === "free";
  const highlighted = Boolean(plan.highlighted);
  const { amount, suffix, note } = priceParts(plan, interval);
  const href = isFree
    ? `/register?plan=${plan.code}`
    : `/register?plan=${plan.code}&interval=${interval}`;

  return (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card p-8 shadow-[0_24px_60px_-30px_oklch(0.2_0.012_60/0.35)] transition-transform duration-500 hover:-translate-y-1 motion-reduce:transition-none lg:p-10",
        highlighted && "site-ink ring-1 ring-primary/40",
      )}
    >
      {highlighted ? (
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary/20 blur-3xl"
        />
      ) : null}

      <div className="relative flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold tracking-tight">{isFree ? "Free" : plan.name}</h2>
        {highlighted ? (
          <span className="font-data rounded-md bg-primary px-2 py-1 text-[11px] tracking-wider text-primary-foreground uppercase">
            Recomendado
          </span>
        ) : null}
      </div>
      <p className="relative mt-2 text-sm text-muted-foreground">{planBlurb(plan.code)}</p>

      <p className="relative mt-10 flex items-baseline gap-2">
        <span
          key={`${amount}-${interval}`}
          className="price-swap tracking-display text-6xl font-semibold"
        >
          {amount}
        </span>
        <span className="font-data text-sm text-muted-foreground">{suffix}</span>
      </p>
      <p className="font-data relative mt-3 min-h-4 text-xs text-muted-foreground">
        {isFree ? "Sin tarjeta · luego eliges un plan" : (note ?? "")}
      </p>

      <Button
        asChild
        size="lg"
        variant={highlighted ? "default" : "outline"}
        className={cn("relative mt-8 h-12 w-full text-base", highlighted && "btn-shine")}
      >
        <Link href={href}>
          {planCta(plan)}
          <ArrowRight aria-hidden />
        </Link>
      </Button>

      <ul className="relative mt-10 flex flex-col gap-3 border-t border-border pt-8">
        {planBullets(plan).map((bullet) => {
          const lead = bullet.startsWith("Todo lo del");
          return (
            <li key={bullet} className="flex items-start gap-3 text-sm">
              {lead ? null : <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />}
              <span className={lead ? "font-medium" : undefined}>{bullet}</span>
            </li>
          );
        })}
      </ul>
    </article>
  );
}

function PlansSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando planes" className="grid gap-5 lg:grid-cols-3">
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-8 lg:p-10"
        >
          <div className="h-6 w-24 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
          <div className="h-4 w-48 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
          <div className="mt-6 h-14 w-32 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
          <div className="mt-6 h-12 w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
          <div className="mt-6 flex flex-col gap-3">
            {[0, 1, 2, 3].map((line) => (
              <div
                key={line}
                className="h-4 w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none"
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PricingPage() {
  const [interval, setInterval] = useState<BillingInterval>("month");
  const {
    data: plans,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["billing-plans"],
    queryFn: () => apiFetch<PlanView[]>("/billing/plans"),
  });

  const sorted = [...(plans ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="site min-h-screen">
      <SiteHeader current="pricing" tone="ink" />

      <main>
        <section className="site-ink relative overflow-hidden pt-36 pb-44 lg:pt-48 lg:pb-56">
          <Backdrop />
          <div className="relative mx-auto grid max-w-7xl gap-10 px-5 lg:grid-cols-12 lg:items-end lg:px-10">
            <div className="lg:col-span-8">
              <p
                className="word-rise font-data text-xs tracking-wider text-muted-foreground uppercase"
                style={{ "--d": "0ms" } as CSSProperties}
              >
                Planes y precios
              </p>
              <h1 className="tracking-display mt-6 text-5xl leading-none font-semibold sm:text-7xl lg:text-[5.5rem]">
                <Words text="Cuesta menos que" start={100} />
                <br />
                <Words text="una venta perdida." start={380} className={accentWords} />
              </h1>
              <p
                className="word-rise mt-8 max-w-lg text-lg leading-relaxed text-muted-foreground"
                style={{ "--d": "650ms" } as CSSProperties}
              >
                Empieza con 15 días gratis. Cuando el asistente ya esté vendiendo, eliges Pro o
                Business y cancelas cuando quieras.
              </p>
            </div>
            <div
              className="word-rise lg:col-span-4 lg:flex lg:justify-end"
              style={{ "--d": "800ms" } as CSSProperties}
            >
              <IntervalToggle value={interval} onChange={setInterval} />
            </div>
          </div>
        </section>

        <section className="relative -mt-28 pb-20 lg:-mt-36 lg:pb-24">
          <div className="mx-auto max-w-7xl px-5 lg:px-10">
            {isLoading ? <PlansSkeleton /> : null}

            {isError ? (
              <div className="flex flex-col items-start gap-4 rounded-2xl border border-border bg-card p-8 shadow-lg sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">No pudimos cargar los planes.</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Revisa tu conexión e inténtalo de nuevo.
                  </p>
                </div>
                <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                  {isFetching ? "Reintentando…" : "Reintentar"}
                </Button>
              </div>
            ) : null}

            {sorted.length > 0 ? (
              <ul className="grid gap-5 lg:grid-cols-3">
                {sorted.map((plan, index) => (
                  <li key={plan.code}>
                    <Reveal delay={index * 120} className="h-full">
                      <PlanCard plan={plan} interval={interval} />
                    </Reveal>
                  </li>
                ))}
              </ul>
            ) : null}

            <ul className="mt-14 grid gap-6 border-t border-border pt-10 sm:grid-cols-3">
              {ASSURANCES.map((item, index) => (
                <li key={item.title}>
                  <Reveal delay={index * 100} className="flex items-start gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card">
                      <item.icon className="size-4 text-primary" aria-hidden />
                    </span>
                    <span>
                      <span className="block text-sm font-medium">{item.title}</span>
                      <span className="mt-0.5 block text-sm text-muted-foreground">
                        {item.text}
                      </span>
                    </span>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {sorted.length > 0 ? (
          <section className="border-t border-border py-24 lg:py-32">
            <div className="mx-auto max-w-7xl px-5 lg:px-10">
              <Reveal>
                <p className={eyebrow}>Comparación</p>
                <h2 className="tracking-display mt-4 max-w-2xl text-4xl font-semibold lg:text-5xl">
                  Los límites de cada plan,{" "}
                  <span className={accentWords}>uno al lado del otro.</span>
                </h2>
              </Reveal>

              <Reveal delay={150}>
                <table className="mt-14 hidden w-full table-fixed text-left text-sm md:table">
                  <thead>
                    <tr className="border-b border-foreground">
                      <th scope="col" className="w-2/5 py-4 font-normal text-muted-foreground">
                        <span className="sr-only">Límite</span>
                      </th>
                      {sorted.map((plan) => (
                        <th
                          key={plan.code}
                          scope="col"
                          className={cn(
                            "w-1/5 px-4 py-4 text-base font-semibold",
                            plan.highlighted && "rounded-t-lg bg-primary/8 text-primary",
                          )}
                        >
                          {plan.code === "free" ? "Free" : plan.name}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARISON.map((row) => (
                      <tr
                        key={row.label}
                        className="border-b border-border transition-colors hover:bg-muted/50"
                      >
                        <th scope="row" className="py-4 font-normal text-muted-foreground">
                          {row.label}
                        </th>
                        {sorted.map((plan) => (
                          <td
                            key={plan.code}
                            className={cn(
                              "font-data px-4 py-4",
                              plan.highlighted && "bg-primary/8",
                            )}
                          >
                            {row.value(plan)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Reveal>

              <div className="mt-12 flex flex-col gap-10 md:hidden">
                {sorted.map((plan) => (
                  <Reveal key={plan.code}>
                    <p className="border-b border-foreground pb-3 text-lg font-semibold">
                      {plan.code === "free" ? "Free" : plan.name}
                    </p>
                    <dl>
                      {COMPARISON.map((row) => (
                        <div
                          key={row.label}
                          className="flex items-baseline justify-between gap-4 border-b border-border py-3 text-sm"
                        >
                          <dt className="text-muted-foreground">{row.label}</dt>
                          <dd className="font-data">{row.value(plan)}</dd>
                        </div>
                      ))}
                    </dl>
                  </Reveal>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section className="border-t border-border py-24 lg:py-32">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-12 lg:gap-10 lg:px-10">
            <Reveal className="lg:col-span-4">
              <p className={eyebrow}>Facturación</p>
              <h2 className="tracking-display mt-4 text-4xl font-semibold lg:text-5xl">
                Lo que conviene saber <span className={accentWords}>antes de pagar.</span>
              </h2>
            </Reveal>
            <Reveal delay={120} className="lg:col-span-7 lg:col-start-6">
              <SiteFaq items={FAQ} />
            </Reveal>
          </div>
        </section>

        <section className="site-ink relative overflow-hidden py-28 lg:py-40">
          <Backdrop />
          <Reveal className="relative mx-auto flex max-w-7xl flex-col items-start gap-10 px-5 lg:flex-row lg:items-end lg:justify-between lg:px-10">
            <h2 className="tracking-display max-w-3xl text-5xl leading-none font-semibold sm:text-6xl lg:text-7xl">
              Prueba 15 días. <span className={accentWords}>Decide con ventas reales.</span>
            </h2>
            <div className="flex flex-col items-start gap-4">
              <Button asChild size="lg" className="btn-shine h-12 px-6 text-base">
                <Link href="/register?plan=free">
                  Empieza tus 15 días gratis
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <p className="font-data text-xs text-muted-foreground">
                Sin tarjeta · Listo en minutos
              </p>
            </div>
          </Reveal>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
