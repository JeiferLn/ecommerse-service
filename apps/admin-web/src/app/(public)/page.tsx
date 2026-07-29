import Link from "next/link";
import { ROUTES } from "@/lib/routes";

export default function PublicHomePage() {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center overflow-hidden px-6 py-24">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--primary-soft)_0%,_transparent_50%),linear-gradient(160deg,_var(--background)_0%,_var(--background-accent)_100%)]"
      />
      <div className="relative flex flex-col items-center">
        <p className="text-sm font-semibold tracking-wide text-primary">
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
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover"
          >
            Iniciar sesión
          </Link>
          <Link
            href={ROUTES.register}
            className="rounded-lg border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground transition hover:border-border-strong hover:bg-primary-soft/40"
          >
            Registrarse
          </Link>
        </div>
      </div>
    </main>
  );
}
