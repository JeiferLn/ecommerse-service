import { ArrowRight, MessageCircle, ShieldCheck } from "lucide-react";

import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col overflow-hidden">
      <div aria-hidden className="surface-mesh pointer-events-none absolute inset-0 opacity-70" />

      <header className="relative z-20 flex items-center justify-between px-6 py-5 sm:px-10">
        <BrandMark size="md" />
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <a href="/login">Iniciar sesión</a>
          </Button>
          <Button asChild>
            <a href="/register">Crear cuenta</a>
          </Button>
        </nav>
      </header>

      <section className="relative z-10 grid flex-1 items-center gap-12 px-6 pb-16 pt-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-8 lg:px-10 lg:pb-20 lg:pt-4">
        <div className="flex max-w-xl flex-col gap-6 lg:max-w-none">
          <p className="font-heading animate-rise text-4xl font-extrabold tracking-tight text-primary sm:text-5xl lg:text-6xl">
            Commerce AI
          </p>
          <h1 className="animate-rise-delay-1 max-w-lg text-balance text-2xl font-semibold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
            Vende por WhatsApp con un asistente que nunca duerme
          </h1>
          <p className="animate-rise-delay-1 max-w-md text-base leading-relaxed text-muted-foreground sm:text-lg">
            Conecta tu negocio y deja que la IA atienda clientes, recomiende productos y cierre
            ventas en la conversación.
          </p>
          <div className="animate-rise-delay-2 flex flex-wrap items-center gap-3">
            <Button size="lg" className="h-11 px-5 text-base" asChild>
              <a href="/register">
                Comenzar gratis
                <ArrowRight className="size-4" aria-hidden />
              </a>
            </Button>
            <Button size="lg" variant="outline" className="h-11 px-5 text-base" asChild>
              <a href="/login">Ya tengo cuenta</a>
            </Button>
          </div>
          <p className="animate-rise-delay-2 flex items-center gap-2 text-sm text-muted-foreground">
            <ShieldCheck className="size-4 text-primary" aria-hidden />
            Sin tarjeta de crédito para empezar
          </p>
        </div>

        <div
          aria-hidden
          className="relative mx-auto flex w-full max-w-md items-center justify-center lg:max-w-none lg:justify-end"
        >
          <div className="absolute -inset-8 rounded-[2.5rem] bg-[radial-gradient(circle_at_center,var(--brand-glow)_0%,transparent_68%)] opacity-40 blur-2xl" />
          <div className="animate-float relative w-full max-w-sm overflow-hidden rounded-[2rem] border border-border/80 bg-card/80 p-5 shadow-brand backdrop-blur-md sm:p-6">
            <div className="mb-5 flex items-center gap-3 border-b border-border/70 pb-4">
              <span className="flex size-10 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <MessageCircle className="size-5" strokeWidth={2.25} />
              </span>
              <div>
                <p className="font-heading text-sm font-bold">Asistente de ventas</p>
                <p className="text-xs text-muted-foreground">WhatsApp · en línea</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 text-sm">
              <div className="animate-float-delay max-w-[85%] self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-primary-foreground">
                ¿Tienen el suero hidratante en stock?
              </div>
              <div className="max-w-[90%] self-start rounded-2xl rounded-bl-md bg-secondary px-3.5 py-2.5 text-secondary-foreground">
                Sí. Tengo 3 opciones. La más pedida es el suero con ácido hialurónico a $28.
              </div>
              <div className="max-w-[75%] self-end rounded-2xl rounded-br-md bg-primary px-3.5 py-2.5 text-primary-foreground">
                Perfecto, lo quiero
              </div>
              <div className="max-w-[92%] self-start rounded-2xl rounded-bl-md bg-secondary px-3.5 py-2.5 text-secondary-foreground">
                Listo. Te envío el enlace de pago y confirmo el pedido.
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative z-10 border-t border-border/60 bg-background/40 px-6 py-16 backdrop-blur-sm sm:px-10">
        <div className="mx-auto flex max-w-5xl flex-col gap-8">
          <div className="max-w-xl">
            <h2 className="font-heading text-2xl font-bold tracking-tight sm:text-3xl">
              Todo lo que necesitas para vender en chat
            </h2>
            <p className="mt-2 text-muted-foreground">
              Un solo lugar para conectar WhatsApp, tu catálogo y la IA de tu negocio.
            </p>
          </div>
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                title: "Atención 24/7",
                description: "Responde clientes automáticamente en WhatsApp.",
              },
              {
                title: "Búsqueda natural",
                description: "Encuentran productos describiendo lo que buscan.",
              },
              {
                title: "IA con tu contexto",
                description: "FAQs, políticas y documentos de tu empresa.",
              },
              {
                title: "Pedidos y pagos",
                description: "Cierra la venta y envía el link en el chat.",
              },
            ].map((item) => (
              <li key={item.title} className="flex flex-col gap-2 border-t border-primary/20 pt-4">
                <h3 className="font-heading text-base font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <footer className="relative z-10 border-t border-border/60 px-6 py-6 text-center text-sm text-muted-foreground sm:px-10">
        © {new Date().getFullYear()} Commerce AI
      </footer>
    </main>
  );
}
