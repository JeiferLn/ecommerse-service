import Link from "next/link";
import { ROUTES } from "@/lib/routes";

export default function PublicHomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center bg-background px-6 py-24">
      <p className="text-sm font-semibold tracking-tight text-foreground">
        Commerce AI
      </p>
      <h1 className="mt-3 max-w-lg text-center text-3xl font-semibold tracking-tight text-foreground">
        Comercio conversacional con Inteligencia Artificial
      </h1>
      <p className="mt-4 max-w-md text-center text-muted">
        Landing pública en construcción. Usa el acceso para entrar al panel.
      </p>
      <div className="mt-8 flex gap-3">
        <Link
          href={ROUTES.login}
          className="rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover"
        >
          Iniciar sesión
        </Link>
        <Link
          href={ROUTES.register}
          className="rounded-md border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-background"
        >
          Registrarse
        </Link>
      </div>
    </main>
  );
}
