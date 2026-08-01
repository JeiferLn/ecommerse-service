import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
        Commerce AI SaaS
      </h1>
      <p className="max-w-xl text-muted-foreground">
        Plataforma multi-tenant de comercio conversacional con Inteligencia
        Artificial para WhatsApp.
      </p>
      <div className="flex gap-3">
        <Button size="lg">Comenzar</Button>
        <Button size="lg" variant="outline">
          Saber más
        </Button>
      </div>
    </main>
  );
}
