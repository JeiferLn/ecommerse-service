import { ArrowLeft, Check, MessageCircle } from "lucide-react";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

import { Backdrop } from "@/components/site/backdrop";
import { CountUp } from "@/components/site/count-up";
import { Reveal } from "@/components/site/reveal";
import { SiteLogo } from "@/components/site/site-logo";
import { accentWords } from "@/components/site/words";

const ACTIVITY = [
  { time: "08:12", text: "Pedido #1051 pagado", detail: "$42.000 · Mercado Pago", paid: true },
  {
    time: "07:40",
    text: "Consulta sobre envíos respondida",
    detail: "Fuente: Política de envíos",
    paid: false,
  },
  { time: "02:18", text: "Pedido #1050 pagado", detail: "$15.000 · Mercado Pago", paid: true },
  { time: "23:45", text: "Pedido #1048 pagado", detail: "$15.000 · Mercado Pago", paid: true },
];

const NEXT_STEPS = [
  {
    title: "Carga tu catálogo",
    text: "Productos, variantes y stock. Es el mismo inventario que usas en el mostrador.",
  },
  {
    title: "Conecta Mercado Pago y WhatsApp",
    text: "El asistente cobra con tu cuenta y responde desde tu número.",
  },
  {
    title: "Sube tus políticas",
    text: "Envíos, cambios y devoluciones en PDF. El asistente responde citándolas.",
  },
];

function rise(delay: number): CSSProperties {
  return { "--d": `${delay}ms` } as CSSProperties;
}

function LiveBadge({ children }: { children: ReactNode }) {
  return (
    <p className="inline-flex items-center gap-2.5 rounded-full border border-border bg-card/60 py-1.5 pr-4 pl-3 text-xs text-muted-foreground">
      <span className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-primary" />
      </span>
      {children}
    </p>
  );
}

function LoginAside() {
  return (
    <div className="flex flex-1 flex-col justify-between gap-10">
      <div className="word-rise" style={rise(150)}>
        <LiveBadge>Tu asistente siguió atendiendo</LiveBadge>
        <h2 className="tracking-display mt-8 max-w-lg text-4xl leading-tight font-semibold">
          Mientras no estabas, <span className={accentWords}>tu tienda vendió.</span>
        </h2>
      </div>

      <div>
        <Reveal delay={300}>
          <p className="font-data text-xs tracking-wider text-muted-foreground uppercase">
            Cobrado esta noche · ejemplo
          </p>
          <p className="tracking-display mt-3 text-6xl font-semibold text-primary">
            <CountUp value={72000} prefix="$" duration={1800} />
          </p>
        </Reveal>

        <Reveal delay={450} className="mt-8">
          <figure className="rounded-2xl border border-border bg-card/80 shadow-2xl backdrop-blur">
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <span className="text-sm font-medium">Actividad de la noche</span>
              <span className="font-data rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground uppercase">
                Ejemplo
              </span>
            </div>
            <ol className="divide-y divide-border">
              {ACTIVITY.map((item, index) => (
                <li key={item.time}>
                  <Reveal delay={650 + index * 140} className="flex gap-4 px-5 py-4">
                    <span className="font-data w-11 shrink-0 text-xs text-muted-foreground">
                      {item.time}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm">{item.text}</span>
                      <span className="font-data mt-1 block text-xs text-muted-foreground">
                        {item.detail}
                      </span>
                    </span>
                    {item.paid ? (
                      <Check className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    ) : (
                      <MessageCircle
                        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                        aria-hidden
                      />
                    )}
                  </Reveal>
                </li>
              ))}
            </ol>
            <figcaption className="sr-only">
              Ejemplo de la actividad que registra el asistente fuera de horario
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </div>
  );
}

function RegisterAside() {
  return (
    <div className="flex flex-1 flex-col justify-between gap-10">
      <div className="word-rise" style={rise(150)}>
        <LiveBadge>Listo en una tarde</LiveBadge>
        <h2 className="tracking-display mt-8 max-w-lg text-4xl leading-tight font-semibold">
          Tres pasos y tu catálogo <span className={accentWords}>empieza a vender.</span>
        </h2>
      </div>

      <ol className="flex flex-col">
        {NEXT_STEPS.map((step, index) => (
          <li key={step.title}>
            <Reveal delay={300 + index * 150} className="flex gap-5 border-t border-border py-6">
              <span className="font-accent w-6 shrink-0 text-3xl leading-none text-primary italic">
                {index + 1}
              </span>
              <span>
                <span className="block font-medium">{step.title}</span>
                <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                  {step.text}
                </span>
              </span>
            </Reveal>
          </li>
        ))}
      </ol>

      <Reveal delay={800}>
        <div className="flex items-center justify-between gap-4 rounded-2xl border border-primary/30 bg-card/80 px-5 py-4 shadow-2xl backdrop-blur">
          <span>
            <span className="font-data block text-[11px] tracking-wider text-muted-foreground uppercase">
              Tu primera venta automática · ejemplo
            </span>
            <span className="mt-1 block text-sm">Pedido #1001 pagado por WhatsApp</span>
          </span>
          <span className="font-data text-lg text-primary">+$15.000</span>
        </div>
        <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Check className="size-4 text-primary" aria-hidden />
          Free no pide tarjeta. Tienes 15 días para probarlo.
        </p>
      </Reveal>
    </div>
  );
}

export function AuthShell({
  variant,
  title,
  description,
  children,
  footer,
}: {
  variant: "login" | "register";
  title: ReactNode;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="grid min-h-screen lg:grid-cols-12">
      <div className="flex flex-col lg:col-span-7">
        <header className="flex h-16 items-center justify-between px-5 lg:px-10">
          <SiteLogo />
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
          >
            <ArrowLeft className="size-4" aria-hidden />
            Volver al inicio
          </Link>
        </header>

        <main className="flex flex-1 justify-center px-5 pt-10 pb-20 sm:pt-16 lg:items-center lg:px-10 lg:pt-0">
          <div className={variant === "register" ? "w-full max-w-lg" : "w-full max-w-sm"}>
            <h1
              style={rise(0)}
              className="word-rise tracking-display text-4xl leading-tight font-semibold text-balance sm:text-5xl"
            >
              {title}
            </h1>
            <p style={rise(120)} className="word-rise mt-4 text-base leading-relaxed text-muted-foreground">
              {description}
            </p>
            <div style={rise(240)} className="word-rise mt-10">
              {children}
            </div>
            {footer ? (
              <div style={rise(360)} className="word-rise mt-8 text-sm text-muted-foreground">
                {footer}
              </div>
            ) : null}
          </div>
        </main>
      </div>

      <aside className="site-ink relative hidden lg:col-span-5 lg:block">
        <Backdrop />
        <div className="sticky top-0 flex min-h-screen flex-col p-10 xl:p-14">
          {variant === "login" ? <LoginAside /> : <RegisterAside />}
        </div>
      </aside>
    </div>
  );
}
