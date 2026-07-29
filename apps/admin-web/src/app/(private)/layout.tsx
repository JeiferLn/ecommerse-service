import Link from "next/link";
import { cookies } from "next/headers";
import { ROLE_COOKIE, ROUTES } from "@/lib/routes";

export default async function PrivateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const role = (await cookies()).get(ROLE_COOKIE)?.value;
  const isAdmin = role === "ADMIN";

  return (
    <div className="flex min-h-full flex-1 flex-col bg-background">
      <header className="border-b border-border bg-surface px-6 py-4">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4">
          <Link
            href={isAdmin ? ROUTES.admin : ROUTES.dashboard}
            className="text-sm font-semibold tracking-wide text-primary"
          >
            Commerce AI
          </Link>

          <nav className="flex items-center gap-4 text-sm">
            {isAdmin ? (
              <Link
                href={ROUTES.admin}
                className="text-muted transition hover:text-foreground"
              >
                Plataforma
              </Link>
            ) : (
              <>
                <Link
                  href={ROUTES.dashboard}
                  className="text-muted transition hover:text-foreground"
                >
                  Inicio
                </Link>
                <Link
                  href={ROUTES.team}
                  className="text-muted transition hover:text-foreground"
                >
                  Equipo
                </Link>
                <Link
                  href={ROUTES.settings}
                  className="text-muted transition hover:text-foreground"
                >
                  Empresa
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-8 text-foreground">
        {children}
      </div>
    </div>
  );
}
