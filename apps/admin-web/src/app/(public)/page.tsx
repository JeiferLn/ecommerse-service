import { ArrowRight, ArrowUpRight, TrendingUp } from "lucide-react";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";

import { CapabilityTicker } from "@/components/site/capability-ticker";
import { CountUp } from "@/components/site/count-up";
import { LostVsWon } from "@/components/site/lost-vs-won";
import { NightRevenue } from "@/components/site/night-revenue";
import { Reveal } from "@/components/site/reveal";
import { SaleDemo } from "@/components/site/sale-demo";
import { Backdrop } from "@/components/site/backdrop";
import { SaleJourney } from "@/components/site/sale-journey";
import { SiteFaq, type FaqItem } from "@/components/site/site-faq";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { Words } from "@/components/site/words";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Commerce AI — Tu tienda vende por WhatsApp mientras duermes",
  description:
    "Un asistente con IA responde con tu catálogo real, resuelve dudas con tus políticas y cobra con Mercado Pago dentro de WhatsApp. 15 días de prueba, sin tarjeta.",
};

const FACTS = [
  { value: 15, unit: "días", label: "de prueba, sin tarjeta" },
  { value: 7, unit: "países", label: "con cobro por Mercado Pago" },
  { value: 4, unit: "documentos", label: "de políticas que el asistente cita" },
];

const ORDERS = [
  { id: "#1048", customer: "Laura M.", channel: "WhatsApp", status: "Pagado", total: "$15.000" },
  { id: "#1047", customer: "Mostrador", channel: "Tienda", status: "Entregado", total: "$42.500" },
  { id: "#1046", customer: "Diego R.", channel: "WhatsApp", status: "Preparando", total: "$28.000" },
  {
    id: "#1045",
    customer: "Ana P.",
    channel: "WhatsApp",
    status: "Esperando pago",
    total: "$9.900",
  },
  { id: "#1044", customer: "Carlos V.", channel: "WhatsApp", status: "Enviado", total: "$61.200" },
];

const PANEL = [
  {
    term: "Inbox",
    detail:
      "Cuando alguien pide una persona, la conversación pasa a tu equipo con todo el historial.",
  },
  {
    term: "Pedidos",
    detail: "WhatsApp y mostrador en una sola lista, del carrito a entregado.",
  },
  {
    term: "Inventario único",
    detail: "Las ventas del chat y del local descuentan del mismo stock.",
  },
];

const PLANS = [
  { name: "Free", line: "15 días con el asistente activo. Sin tarjeta." },
  { name: "Pro", line: "Para tiendas que ya venden todos los días por WhatsApp." },
  { name: "Business", line: "Más volumen, más miembros y más documentos de conocimiento." },
];

const FAQ: FaqItem[] = [
  {
    question: "¿Necesito tarjeta para probar?",
    answer:
      "No. El plan Free dura 15 días y no pide tarjeta. Pro y Business se activan cuando pagas la suscripción con Mercado Pago.",
  },
  {
    question: "¿Qué pasa cuando termina la prueba?",
    answer:
      "Tu cuenta y tu catálogo se conservan. WhatsApp, la IA y las nuevas altas se pausan hasta que elijas un plan de pago.",
  },
  {
    question: "¿En qué países funciona?",
    answer:
      "Donde opera Mercado Pago: Argentina, Brasil, Chile, Colombia, México, Perú y Uruguay.",
  },
  {
    question: "¿El asistente puede inventar precios?",
    answer:
      "Responde con los productos activos de tu catálogo y con los documentos que subes. Si no sabe qué contestar, usa un mensaje de respaldo o pasa la conversación a tu equipo.",
  },
  {
    question: "¿Puedo responder yo?",
    answer:
      "Sí. Desde el inbox ves cada conversación, respondes a mano y vuelves a activar al asistente cuando quieras.",
  },
];

const eyebrow = "font-data text-xs tracking-wider text-muted-foreground uppercase";

function PrimaryCta({ className }: { className?: string }) {
  return (
    <Button asChild size="lg" className={cn("btn-shine h-12 px-6 text-base", className)}>
      <Link href="/register?plan=free">
        Empieza tus 15 días gratis
        <ArrowRight aria-hidden />
      </Link>
    </Button>
  );
}

function StatusDot({ status }: { status: string }) {
  const done = status === "Pagado" || status === "Entregado" || status === "Enviado";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={cn(
          "size-1.5 rounded-full",
          done ? "bg-primary" : status === "Esperando pago" ? "bg-muted-foreground" : "bg-foreground",
        )}
        aria-hidden
      />
      {status}
    </span>
  );
}

export default function HomePage() {
  return (
    <div className="site min-h-screen">
      <SiteHeader tone="ink" />

      <main>
        <section className="site-ink relative overflow-hidden pt-36 lg:pt-48">
          <Backdrop />

          <div className="relative mx-auto max-w-7xl px-5 lg:px-10">
            <p
              className="word-rise inline-flex items-center gap-2.5 rounded-full border border-border bg-card/60 py-1.5 pr-4 pl-3 text-xs text-muted-foreground"
              style={{ "--d": "0ms" } as CSSProperties}
            >
              <span className="relative flex size-2">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex size-2 rounded-full bg-primary" />
              </span>
              Tu vendedor en WhatsApp, atendiendo 24/7
            </p>

            <h1 className="tracking-display mt-8 max-w-5xl text-[2.6rem] leading-none min-[400px]:text-5xl font-semibold sm:text-7xl lg:text-[6.5rem]">
              <Words text="Tu tienda vende" start={120} />
              <br />
              <Words
                text="mientras duermes."
                start={420}
                className="font-accent font-normal tracking-normal text-primary italic"
              />
            </h1>

            <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:items-end">
              <p
                className="word-rise text-lg leading-relaxed text-muted-foreground lg:col-span-5 lg:text-xl"
                style={{ "--d": "700ms" } as CSSProperties}
              >
                Un asistente con IA responde con tu catálogo real, resuelve dudas y cobra con Mercado
                Pago dentro del chat. Tú solo despachas.
              </p>
              <div
                className="word-rise flex flex-col gap-4 lg:col-span-6 lg:col-start-7 lg:items-end"
                style={{ "--d": "850ms" } as CSSProperties}
              >
                <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
                  <PrimaryCta />
                  <Link
                    href="#recorrido"
                    className="rounded-sm text-sm font-medium underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
                  >
                    Ver cómo funciona
                  </Link>
                </div>
                <p className="font-data text-[11px] tracking-wider text-muted-foreground uppercase">
                  15 días gratis · Sin tarjeta · Cancelas cuando quieras
                </p>
              </div>
            </div>

            <div className="relative mt-20 lg:mt-28">
              <div
                aria-hidden
                className="absolute inset-x-[10%] -top-10 h-48 rounded-full bg-primary/20 blur-3xl"
              />
              <Reveal variant="tilt" delay={200}>
                <SaleDemo className="relative bg-card" />
              </Reveal>
              <Reveal
                delay={1100}
                className="absolute -top-8 right-6 hidden rounded-xl border border-border bg-background/90 px-4 py-3 shadow-[0_20px_40px_-20px_oklch(0_0_0/0.6)] backdrop-blur lg:block"
              >
                <p className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingUp className="size-3.5 text-primary" aria-hidden />
                  Esta noche · ejemplo
                </p>
                <p className="font-data mt-1 text-xl">$224.500</p>
                <p className="font-data text-[11px] text-muted-foreground">9 pedidos pagados</p>
              </Reveal>
            </div>
          </div>

          <div className="relative mt-20 lg:mt-28">
            <CapabilityTicker />
          </div>
        </section>

        <section className="py-28 lg:py-44">
          <div className="mx-auto max-w-7xl px-5 lg:px-10">
            <LostVsWon />
          </div>
        </section>

        <section className="site-ink relative overflow-hidden py-28 lg:py-40">
          <div
            aria-hidden
            className="pointer-events-none absolute -right-1/4 top-0 size-160 rounded-full bg-primary/10 blur-3xl"
          />
          <div className="relative mx-auto max-w-7xl px-5 lg:px-10">
            <NightRevenue />
          </div>
        </section>

        <section id="recorrido" className="scroll-mt-16 py-28 lg:py-40">
          <div className="mx-auto max-w-7xl px-5 lg:px-10">
            <SaleJourney />
          </div>
        </section>

        <section id="equipo" className="site-ink scroll-mt-16 overflow-hidden py-28 lg:py-40">
          <div className="mx-auto grid max-w-7xl gap-16 px-5 lg:grid-cols-12 lg:gap-10 lg:px-10">
            <div className="lg:col-span-4">
              <Reveal>
                <p className={eyebrow}>Tu panel</p>
                <h2 className="mt-5 text-4xl leading-[1.05] font-semibold tracking-tight lg:text-5xl">
                  Tú ves todo.{" "}
                  <span className="font-accent font-normal tracking-normal text-primary italic">
                    El asistente hace lo repetitivo.
                  </span>
                </h2>
              </Reveal>
              <dl className="mt-12 flex flex-col border-t border-border">
                {PANEL.map((item, index) => (
                  <Reveal key={item.term} delay={100 + index * 120} className="border-b border-border py-5">
                    <dt className="text-base font-medium">{item.term}</dt>
                    <dd className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {item.detail}
                    </dd>
                  </Reveal>
                ))}
              </dl>
            </div>

            <Reveal variant="tilt" delay={150} className="lg:col-span-8 lg:-mr-24">
              <div className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_40px_80px_-40px_oklch(0_0_0/0.7)]">
                <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
                  <p className="text-sm font-medium">Pedidos</p>
                  <p className="font-data text-xs text-muted-foreground">Ejemplo · Hoy</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-xl text-left text-sm">
                    <thead>
                      <tr className="font-data text-xs text-muted-foreground uppercase">
                        <th scope="col" className="px-5 py-3 font-normal">
                          Pedido
                        </th>
                        <th scope="col" className="px-5 py-3 font-normal">
                          Cliente
                        </th>
                        <th scope="col" className="px-5 py-3 font-normal">
                          Canal
                        </th>
                        <th scope="col" className="px-5 py-3 font-normal">
                          Estado
                        </th>
                        <th scope="col" className="px-5 py-3 text-right font-normal">
                          Total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {ORDERS.map((order, index) => (
                        <tr
                          key={order.id}
                          className={cn(
                            "border-t border-border transition-colors hover:bg-muted",
                            index === 0 && "bg-muted",
                          )}
                        >
                          <td className="font-data px-5 py-3.5">{order.id}</td>
                          <td className="px-5 py-3.5">{order.customer}</td>
                          <td className="px-5 py-3.5 text-muted-foreground">{order.channel}</td>
                          <td className="px-5 py-3.5">
                            <StatusDot status={order.status} />
                          </td>
                          <td className="font-data px-5 py-3.5 text-right">{order.total}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <Reveal
                delay={700}
                className="mt-4 flex flex-col gap-4 rounded-xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:justify-between lg:max-w-xl"
              >
                <div>
                  <p className="text-sm font-medium">Diego R. pidió hablar con una persona</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    «¿Me pueden asesorar con la talla?»
                  </p>
                </div>
                <span className="font-data shrink-0 rounded-md bg-accent px-2 py-1 text-xs text-accent-foreground">
                  Asignada a tu equipo
                </span>
              </Reveal>
            </Reveal>
          </div>
        </section>

        <section aria-label="En cifras" className="border-b border-border">
          <dl className="mx-auto grid max-w-7xl px-5 sm:grid-cols-2 lg:grid-cols-4 lg:px-10">
            {FACTS.map((fact, index) => (
              <Reveal
                key={fact.label}
                delay={index * 120}
                className={cn(
                  "flex flex-col gap-2 border-border py-12 lg:py-16",
                  index > 0 && "border-t sm:border-t-0",
                  index % 2 === 1 && "sm:border-l sm:pl-8",
                  index >= 2 && "sm:border-t lg:border-t-0",
                  index > 0 && "lg:border-l lg:pl-8",
                )}
              >
                <dt className="order-2 text-sm text-muted-foreground">{fact.label}</dt>
                <dd className="order-1 flex items-baseline gap-2">
                  <CountUp
                    value={fact.value}
                    className="text-5xl font-semibold tracking-tight lg:text-6xl"
                  />
                  <span className="font-data text-xs text-muted-foreground uppercase">
                    {fact.unit}
                  </span>
                </dd>
              </Reveal>
            ))}
            <Reveal
              delay={360}
              className="flex flex-col gap-2 border-t border-border py-12 sm:border-l sm:pl-8 lg:border-t-0 lg:py-16"
            >
              <dt className="order-2 text-sm text-muted-foreground">atiende aunque no estés</dt>
              <dd className="order-1 font-accent text-5xl text-primary italic lg:text-6xl">24/7</dd>
            </Reveal>
          </dl>
        </section>

        <section className="py-24 lg:py-32">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-12 lg:gap-10 lg:px-10">
            <Reveal className="lg:col-span-4">
              <p className={eyebrow}>Planes</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight lg:text-4xl">
                Empieza gratis.{" "}
                <span className="font-accent font-normal tracking-normal italic">
                  Crece sin cambiar de herramienta.
                </span>
              </h2>
            </Reveal>
            <ul className="border-t border-border lg:col-span-7 lg:col-start-6">
              {PLANS.map((plan, index) => (
                <li key={plan.name} className="border-b border-border">
                  <Reveal delay={index * 100}>
                    <Link
                      href="/pricing"
                      className="group flex items-center gap-6 py-7 transition-[padding] duration-300 hover:pl-3 focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none motion-reduce:transition-none"
                    >
                      <span className="w-28 shrink-0 text-2xl font-semibold tracking-tight">
                        {plan.name}
                      </span>
                      <span className="flex-1 text-base text-muted-foreground">{plan.line}</span>
                      <ArrowUpRight
                        className="size-5 shrink-0 text-muted-foreground transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-primary motion-reduce:transition-none"
                        aria-hidden
                      />
                    </Link>
                  </Reveal>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section id="preguntas" className="scroll-mt-16 border-t border-border py-24 lg:py-32">
          <div className="mx-auto grid max-w-7xl gap-12 px-5 lg:grid-cols-12 lg:gap-10 lg:px-10">
            <Reveal className="lg:col-span-4">
              <p className={eyebrow}>Preguntas</p>
              <h2 className="mt-4 text-3xl font-semibold tracking-tight lg:text-4xl">
                Lo que suelen preguntar antes de empezar.
              </h2>
            </Reveal>
            <Reveal delay={120} className="lg:col-span-7 lg:col-start-6">
              <SiteFaq items={FAQ} />
            </Reveal>
          </div>
        </section>

        <section className="site-ink relative overflow-hidden py-32 lg:py-48">
          <Backdrop />
          <div className="relative mx-auto max-w-7xl px-5 lg:px-10">
            <Reveal>
              <h2 className="tracking-display max-w-5xl text-5xl leading-none font-semibold sm:text-7xl lg:text-[6rem]">
                Esta noche, tu tienda{" "}
                <span className="font-accent font-normal tracking-normal text-primary italic">
                  atiende sola.
                </span>
              </h2>
            </Reveal>
            <Reveal
              delay={200}
              className="mt-14 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"
            >
              <PrimaryCta />
              <p className="font-data text-xs tracking-wider text-muted-foreground uppercase">
                15 días · Sin tarjeta · Mercado Pago
              </p>
            </Reveal>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
