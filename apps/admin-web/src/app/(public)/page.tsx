import {
  ArrowRight,
  Bot,
  Clock3,
  Link2,
  MoreVertical,
  Play,
  Plus,
  Quote,
  Rocket,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  TrendingUp,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import type { Metadata } from "next";

import { PublicSiteHeader } from "@/components/public-site-header";

export const metadata: Metadata = {
  title: "Commerce AI — Aumenta tus ventas en piloto automático",
  description:
    "Asistente de ventas en WhatsApp: atiende 24/7, muestra tu catálogo, cobra con Mercado Pago y cierra pedidos mientras duermes.",
};

const AVATARS = [
  "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=96&h=96&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=96&h=96&fit=crop&crop=faces",
  "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=96&h=96&fit=crop&crop=faces",
];

const PRODUCT_IMG =
  "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?w=800&h=600&fit=crop";

const PORTRAIT =
  "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=256&h=256&fit=crop&crop=faces";

const LOGOS = ["Moda Local", "Casa & Hogar", "Beauty Lab", "Urban Fit", "Almacén Sur", "Taller 91"];

export default function HomePage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground antialiased">
      <PublicSiteHeader />

      <main className="pt-[72px]">
        <section className="hero-bg-light relative z-10 flex min-h-[85vh] items-center overflow-hidden border-b border-border/60">
          <div className="pointer-events-none absolute inset-0 overflow-hidden">
            <div className="animate-blob absolute right-[10%] top-[10%] size-[40vw] rounded-full bg-[#2e5bff]/20 blur-[100px] mix-blend-multiply dark:mix-blend-screen" />
            <div
              className="animate-blob absolute bottom-[-10%] left-[5%] size-[50vw] rounded-full bg-primary/10 blur-[120px] mix-blend-multiply dark:bg-[#c24100]/10 dark:mix-blend-screen"
              style={{ animationDelay: "2s" }}
            />
          </div>

          <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 px-5 py-12 lg:grid-cols-12 lg:gap-16 lg:px-10 lg:py-20">
            <div className="flex flex-col gap-6 lg:col-span-5">
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary/20 bg-muted px-4 py-1.5 shadow-[0_0_15px_rgba(46,91,255,0.12)] dark:shadow-[0_0_15px_rgba(46,91,255,0.2)]">
                <TrendingUp className="size-4 text-primary" aria-hidden />
                <span className="text-[11px] font-bold uppercase tracking-wide text-primary">
                  Ventas en WhatsApp, 24/7
                </span>
              </div>
              <h1 className="font-heading text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-5xl lg:text-7xl lg:leading-[1.05]">
                Multiplica tus ventas
                <br />
                <span className="text-gradient-primary">en piloto automático</span>
              </h1>
              <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
                Un asistente inteligente que atiende 24/7, responde dudas al instante, muestra
                productos de tu catálogo y cierra ventas en WhatsApp. Ahorra tiempo y aumenta tus
                ingresos sin esfuerzo.
              </p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register?plan=free"
                  className="premium-btn-primary inline-flex h-14 items-center justify-center rounded-xl px-8 text-base font-semibold text-white"
                >
                  Empieza tus 15 días gratis
                </Link>
                <Link
                  href="#como-funciona"
                  className="premium-btn-outline inline-flex h-14 items-center justify-center gap-2 rounded-xl bg-background/50 px-8 text-base font-semibold backdrop-blur-sm"
                >
                  <Play className="size-5" aria-hidden />
                  Ver cómo funciona
                </Link>
              </div>
              <div className="mt-4 flex items-center gap-4 border-t border-border/40 pt-6 text-sm text-muted-foreground">
                <span className="flex -space-x-3">
                  {AVATARS.map((src) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={src}
                      alt=""
                      src={src}
                      className="size-10 rounded-full border-2 border-background object-cover"
                    />
                  ))}
                  <span className="flex size-10 items-center justify-center rounded-full border-2 border-background bg-muted text-[11px] font-bold text-primary">
                    +500
                  </span>
                </span>
                <p>
                  Tiendas en LATAM ya
                  <br />
                  venden desde el chat.
                </p>
              </div>
            </div>

            <div className="relative flex justify-center lg:col-span-7 lg:justify-end">
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-[120%] w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-linear-to-tr from-[#2e5bff]/30 to-primary/10 blur-[80px]" />
              <div className="relative z-10 flex h-[680px] w-[340px] rotate-2 flex-col overflow-hidden rounded-[48px] border-12 border-[#050814] bg-[#050814] shadow-[0_30px_60px_rgba(0,0,0,0.2),0_0_40px_rgba(46,91,255,0.1)] transition-transform duration-700 ease-out hover:rotate-0 dark:border-[#0a0c14] dark:bg-[#0a0c14] dark:shadow-[0_30px_60px_rgba(0,0,0,0.35),0_0_40px_rgba(46,91,255,0.2)] sm:h-[720px] sm:w-[360px]">
                <div className="absolute left-1/2 top-0 z-30 h-7 w-30 -translate-x-1/2 rounded-b-3xl bg-[#050814] dark:bg-[#0a0c14]" />

                <div className="relative z-20 flex items-center gap-3 border-b border-border/60 bg-white/90 px-5 pb-4 pt-10 shadow-sm backdrop-blur-xl dark:border-white/5 dark:bg-[#282933]/90">
                  <div className="flex size-10 items-center justify-center rounded-full bg-linear-to-br from-[#2e5bff] to-[#c24100] font-bold text-white shadow-md">
                    M
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground dark:text-white">
                      Minimalist Store
                    </p>
                    <p className="flex items-center gap-1 text-[11px] font-medium text-primary dark:text-[#b8c3ff]">
                      <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
                      En línea 24/7
                    </p>
                  </div>
                  <MoreVertical
                    className="ml-auto size-5 text-muted-foreground dark:text-white/40"
                    aria-hidden
                  />
                </div>

                <div
                  className="relative flex flex-1 flex-col gap-4 overflow-hidden bg-white bg-fixed p-4 pb-24 dark:bg-[#0c0e17]"
                  style={{
                    backgroundImage:
                      "url('https://www.transparenttextures.com/patterns/cubes.png')",
                  }}
                >
                  <div className="sticky top-2 z-10 text-center">
                    <span className="inline-block rounded-full border border-white bg-muted/80 px-3 py-1 text-[11px] font-semibold text-muted-foreground shadow-sm backdrop-blur-md dark:border-white/5 dark:bg-[#33343e]/80 dark:text-white/50">
                      Hoy
                    </span>
                  </div>
                  <div className="animate-float max-w-[85%] self-end">
                    <div className="glass-bubble rounded-2xl rounded-tr-sm px-4 py-3 text-[15px]">
                      ¿Hola! Tienen la remera clásica blanca en talle M? ¿Y hacen envíos?
                    </div>
                    <span className="mr-1 mt-1 block text-right text-[10px] text-muted-foreground dark:text-white/35">
                      02:42 am
                    </span>
                  </div>
                  <div className="animate-float-delay flex max-w-[90%] gap-2 self-start">
                    <div className="mt-auto mb-5 flex size-7 shrink-0 items-center justify-center rounded-full border border-white/50 bg-linear-to-br from-[#2e5bff] to-[#c24100] shadow-lg dark:border-white/20">
                      <Bot className="size-3.5 text-white" aria-hidden />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="glass-bubble-agent rounded-2xl rounded-tl-sm p-4 text-[15px]">
                        <p className="mb-3">
                          ¡Hola! Sí, tenemos stock en talle M. Y sí, realizamos envíos a todo el
                          país. Aquí te dejo el producto:
                        </p>
                        <div className="relative mb-2 overflow-hidden rounded-xl border border-border/40 dark:border-white/10">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={PRODUCT_IMG}
                            alt="Remera clásica blanca"
                            className="h-40 w-full object-cover"
                          />
                          <div className="absolute inset-0 flex items-end bg-linear-to-t from-black/80 to-transparent p-3">
                            <p className="text-[13px] font-semibold text-white">
                              Remera Clásica Blanca
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between rounded-lg border border-border/50 bg-muted/70 p-2 dark:border-white/10 dark:bg-[#1d1f29]">
                          <span className="text-xs text-muted-foreground dark:text-white/50">
                            Precio unitario
                          </span>
                          <span className="text-sm font-bold text-foreground dark:text-white">
                            $15.000
                          </span>
                        </div>
                        <span className="mt-2 flex w-full items-center justify-center rounded-lg bg-[#2e5bff] py-2 text-[13px] font-bold text-white">
                          Comprar ahora
                        </span>
                      </div>
                      <span className="ml-1 text-[10px] text-muted-foreground dark:text-white/35">
                        02:42 am
                      </span>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-0 left-0 z-20 flex w-full items-center gap-2 border-t border-border/60 bg-white/80 p-3 pb-6 backdrop-blur-xl dark:border-white/5 dark:bg-[#282933]/90">
                  <span className="flex size-8 items-center justify-center rounded-full bg-muted text-muted-foreground dark:bg-[#33343e] dark:text-white/50">
                    <Plus className="size-4" aria-hidden />
                  </span>
                  <span className="flex h-10 flex-1 items-center rounded-full border border-border/50 bg-background px-4 text-sm text-muted-foreground shadow-inner dark:border-white/10 dark:bg-[#1d1f29] dark:text-white/35">
                    Mensaje…
                  </span>
                  <span className="flex size-10 items-center justify-center rounded-full bg-[#2e5bff] text-white shadow-md shadow-primary/30 dark:shadow-[0_0_15px_rgba(46,91,255,0.4)]">
                    <Send className="size-4" aria-hidden />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-border/60 bg-background py-16 lg:py-20">
          <div className="mx-auto max-w-7xl px-5 lg:px-10">
            <div className="glass-panel relative flex flex-col items-center gap-10 overflow-hidden rounded-[32px] p-8 md:flex-row md:p-12">
              <div className="absolute right-0 top-0 size-64 rounded-full bg-primary/10 blur-[60px]" />
              <div className="flex flex-col items-center text-center md:w-1/3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={PORTRAIT}
                  alt=""
                  className="mb-4 size-32 rounded-full border-4 border-border object-cover shadow-lg"
                />
                <h2 className="font-heading text-xl font-bold">Valeria Gómez</h2>
                <p className="text-sm text-muted-foreground">Dueña, Minimalist Store</p>
                <div className="mt-2 flex gap-0.5 text-amber-400">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="size-4 fill-current" aria-hidden />
                  ))}
                </div>
              </div>
              <div className="relative md:w-2/3">
                <Quote className="absolute -left-2 -top-4 size-14 text-primary/20" aria-hidden />
                <p className="relative z-10 mb-6 text-xl leading-relaxed italic text-foreground/90">
                  Antes perdíamos ventas de madrugada y el fin de semana. Con Commerce AI el
                  asistente{" "}
                  <strong className="font-semibold text-foreground">
                    cierra pedidos a las 3 AM sin que movamos un dedo
                  </strong>
                  . El catálogo, los envíos y el cobro van en el mismo chat.
                </p>
                <div className="flex flex-wrap gap-3">
                  <div className="rounded-lg border border-border bg-muted/60 px-4 py-2">
                    <span className="font-heading block text-2xl font-bold text-primary">24/7</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Atención
                    </span>
                  </div>
                  <div className="rounded-lg border border-border bg-muted/60 px-4 py-2">
                    <span className="font-heading block text-2xl font-bold text-primary">0 min</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Tiempo de espera
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-muted/30 py-8 dark:bg-[#11131c]">
          <p className="mb-6 text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Empresas que ya escalan su negocio con nosotros
          </p>
          <div className="relative w-full overflow-hidden">
            <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-20 bg-linear-to-r from-background to-transparent dark:from-[#11131c]" />
            <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-20 bg-linear-to-l from-background to-transparent dark:from-[#11131c]" />
            <div className="animate-marquee flex w-max">
              {[0, 1].map((copy) => (
                <ul
                  key={copy}
                  aria-hidden={copy === 1}
                  className="flex min-w-[100vw] shrink-0 items-center justify-center gap-12 px-8 opacity-40 sm:gap-16"
                >
                  {LOGOS.map((name) => (
                    <li
                      key={`${copy}-${name}`}
                      className="font-heading shrink-0 whitespace-nowrap text-2xl font-bold"
                    >
                      {name}
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          </div>
        </section>

        <section id="beneficios" className="scroll-mt-24 px-5 py-16 lg:px-10 lg:py-24">
          <div className="mx-auto max-w-7xl rounded-3xl border border-border/70 bg-muted/40 p-8 shadow-lg dark:bg-[#1d1f29] lg:p-16">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Resultados tangibles para tu tienda
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                No es solo un bot de respuestas automáticas: es un vendedor enfocado en aumentar tu
                facturación.
              </p>
            </div>
            <div className="grid gap-6 md:grid-cols-3">
              {[
                {
                  icon: Clock3,
                  title: "Atención 24/7 ininterrumpida",
                  body: "No pierdas ventas fuera del horario comercial. Tu tienda está siempre abierta, atendiendo dudas y cerrando compras a cualquier hora.",
                  chip: "También de madrugada",
                },
                {
                  icon: TrendingUp,
                  title: "Más cierre en el chat",
                  body: "Respuestas instantáneas y precisas evitan que el cliente se enfríe. El agente guía proactivamente hacia el checkout.",
                  chip: "Del mensaje al pago",
                },
                {
                  icon: Wallet,
                  title: "Ahorro de costos operativos",
                  body: "Automatiza consultas de stock, envíos y políticas. Tu equipo humano se enfoca solo en casos de alto valor.",
                  chip: "Inbox cuando es humano",
                },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[24px] border border-border/50 bg-background p-8 shadow-sm transition-shadow hover:shadow-[0_0_20px_rgba(46,91,255,0.12)] dark:bg-[#282933] dark:border-white/5"
                >
                  <div className="mb-6 flex size-12 items-center justify-center rounded-full border border-primary/20 bg-primary/10 text-primary">
                    <item.icon className="size-7" aria-hidden />
                  </div>
                  <h3 className="font-heading mb-3 text-xl font-semibold">{item.title}</h3>
                  <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
                  <span className="inline-block rounded-lg border border-border/50 bg-muted px-4 py-2 text-xs font-bold text-primary dark:border-white/5 dark:bg-[#11131c]">
                    {item.chip}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section
          id="como-funciona"
          className="scroll-mt-24 border-t border-border/60 px-5 py-16 lg:px-10 lg:py-24"
        >
          <div className="mx-auto max-w-7xl">
            <div className="mx-auto mb-14 max-w-2xl text-center">
              <h2 className="font-heading text-3xl font-bold tracking-tight sm:text-4xl">
                Implementación en minutos, no en meses
              </h2>
              <p className="mt-4 text-lg text-muted-foreground">
                Configuras tu tienda una vez y dejas que la IA haga el trabajo pesado.
              </p>
            </div>
            <div className="relative">
              <div className="absolute left-[10%] right-[10%] top-12 z-0 hidden h-0.5 bg-linear-to-r from-primary/10 via-primary/50 to-primary/10 md:block" />
              <ol className="relative z-10 grid gap-12 md:grid-cols-3">
                {[
                  {
                    n: "1",
                    icon: Link2,
                    title: "Sube tu catálogo",
                    body: "Productos, precios, stock y fotos en el panel. El bot responde con lo que tienes hoy, no con inventos.",
                  },
                  {
                    n: "2",
                    icon: SlidersHorizontal,
                    title: "Define las reglas",
                    body: "Envíos, Mercado Pago y los 4 PDFs (guía, FAQ, garantías, políticas). El agente se adapta a tu marca.",
                  },
                  {
                    n: "3",
                    icon: Rocket,
                    title: "Activa y vende",
                    body: "Conecta tu WhatsApp y atiende a muchos clientes a la vez, con link de cobro directo en el chat.",
                  },
                ].map((step) => (
                  <li key={step.n} className="flex flex-col items-center text-center">
                    <div className="relative mb-6 flex size-24 items-center justify-center rounded-2xl border-2 border-primary/40 bg-muted shadow-[0_0_20px_rgba(46,91,255,0.15)] dark:bg-[#1d1f29]">
                      <span className="absolute -right-3 -top-3 flex size-8 items-center justify-center rounded-full bg-[#2e5bff] text-sm font-bold text-white shadow-lg">
                        {step.n}
                      </span>
                      <step.icon className="size-10 text-primary" aria-hidden />
                    </div>
                    <h3 className="font-heading mb-3 text-xl font-semibold">{step.title}</h3>
                    <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                      {step.body}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section className="relative px-5 py-16 lg:px-10 lg:py-24">
          <div className="relative mx-auto flex max-w-6xl flex-col items-center overflow-hidden rounded-[40px] border border-primary/20 bg-muted/60 px-8 py-16 text-center shadow-2xl dark:bg-[#282933] md:px-20 md:py-20">
            <div className="pointer-events-none absolute left-1/2 top-0 size-[600px] -translate-x-1/2 rounded-full bg-[#2e5bff]/20 blur-[100px] dark:mix-blend-screen" />
            <h2 className="font-heading relative z-10 mb-6 text-4xl font-extrabold tracking-tight sm:text-5xl">
              ¿Listo para vender mientras duermes?
            </h2>
            <p className="relative z-10 mb-10 max-w-2xl text-lg text-muted-foreground">
              15 días de prueba. Sin tarjeta. Conecta WhatsApp, sube productos y deja que el primer
              cliente hable con el asistente.
            </p>
            <Link
              href="/register?plan=free"
              className="relative z-10 inline-flex items-center gap-3 rounded-2xl border border-white/10 bg-[#2e5bff] px-10 py-5 text-lg font-bold text-white shadow-[0_0_30px_rgba(46,91,255,0.3)] transition-transform hover:scale-[1.03]"
            >
              Comienza tus 15 días gratis
              <ArrowRight className="size-6" aria-hidden />
            </Link>
            <p className="relative z-10 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              No se requiere tarjeta. Cancelas cuando quieras.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border/40 bg-muted/20 py-10 text-center dark:bg-[#11131c]">
        <p className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <ShieldCheck className="size-4 text-primary" aria-hidden />
          © 2026 Commerce AI. Transformando el comercio conversacional.
        </p>
      </footer>
    </div>
  );
}
