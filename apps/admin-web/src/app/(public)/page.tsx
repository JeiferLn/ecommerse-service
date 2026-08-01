import { Bot, CreditCard, MessageSquare, Search, ShieldCheck, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const features = [
  {
    icon: MessageSquare,
    title: "Atención automática",
    description: "Un asistente de ventas responde a tus clientes por WhatsApp las 24 horas.",
  },
  {
    icon: Search,
    title: "Búsqueda en lenguaje natural",
    description: "Tus clientes encuentran productos describiendo lo que necesitan.",
  },
  {
    icon: Bot,
    title: "IA entrenada con tus datos",
    description: "Documentos, FAQs y políticas de tu empresa como contexto para la IA.",
  },
  {
    icon: CreditCard,
    title: "Pedidos y pagos",
    description: "Genera pedidos y envía enlaces de pago directamente en la conversación.",
  },
];

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[28rem] bg-gradient-to-b from-primary/10 to-transparent"
      />

      <header className="relative z-10 flex items-center justify-between px-6 py-5">
        <span className="text-xl font-bold tracking-tight">Commerce AI SaaS</span>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" asChild>
            <a href="/login">Iniciar sesión</a>
          </Button>
          <Button asChild>
            <a href="/register">Crear cuenta</a>
          </Button>
        </nav>
      </header>

      <section className="relative z-10 flex flex-1 flex-col items-center justify-center gap-6 px-6 py-20 text-center">
        <span className="inline-flex items-center gap-1.5 rounded-full border bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5" aria-hidden />
          Inteligencia Artificial + WhatsApp
        </span>
        <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
          Vende por WhatsApp con un asistente de IA
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Conecta tu negocio a WhatsApp y deja que la Inteligencia Artificial atienda a tus
          clientes, recomiende productos y cierre ventas automáticamente.
        </p>
        <div className="flex gap-3">
          <Button size="lg" asChild>
            <a href="/register">Comenzar gratis</a>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="/login">Ver demo</a>
          </Button>
        </div>
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <ShieldCheck className="size-4" aria-hidden />
          Sin tarjeta de crédito para empezar
        </p>
      </section>

      <Separator />

      <section className="mx-auto grid max-w-5xl gap-4 p-6 py-16 sm:grid-cols-2">
        {features.map((feature) => (
          <Card key={feature.title}>
            <CardHeader>
              <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <feature.icon className="size-5" aria-hidden />
              </div>
              <CardTitle>{feature.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>{feature.description}</CardDescription>
            </CardContent>
          </Card>
        ))}
      </section>

      <footer className="border-t p-6 text-center text-sm text-muted-foreground">
        © {new Date().getFullYear()} Commerce AI SaaS
      </footer>
    </main>
  );
}
