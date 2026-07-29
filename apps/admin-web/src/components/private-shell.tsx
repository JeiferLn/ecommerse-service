"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  Building2,
  LayoutDashboard,
  LogOut,
  Package,
  Shield,
  Users,
} from "lucide-react";
import { ROUTES } from "@/lib/routes";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

export function PrivateShell({
  isAdmin,
  children,
}: {
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const items: NavItem[] = isAdmin
    ? [{ href: ROUTES.admin, label: "Plataforma", icon: Shield }]
    : [
        { href: ROUTES.dashboard, label: "Resumen", icon: LayoutDashboard },
        { href: ROUTES.products, label: "Productos", icon: Package },
        { href: ROUTES.team, label: "Equipo", icon: Users },
        { href: ROUTES.settings, label: "Empresa", icon: Building2 },
      ];

  function handleLogout() {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace(ROUTES.login);
      router.refresh();
    });
  }

  function isActive(href: string) {
    if (href === ROUTES.dashboard) {
      return pathname === ROUTES.dashboard;
    }
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <div className="flex min-h-full flex-1 bg-background">
      <aside className="sticky top-0 flex h-dvh w-56 shrink-0 flex-col border-r border-border bg-sidebar">
        <div className="border-b border-border px-5 py-5">
          <Link
            href={isAdmin ? ROUTES.admin : ROUTES.dashboard}
            className="text-[15px] font-semibold tracking-tight text-foreground"
          >
            Commerce AI
          </Link>
          <p className="mt-1 text-xs text-muted">
            {isAdmin ? "Administración" : "Panel de empresa"}
          </p>
        </div>

        <nav className="flex flex-1 flex-col gap-0.5 p-3">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition ${
                  active
                    ? "bg-foreground text-primary-foreground"
                    : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-border p-3">
          <button
            type="button"
            onClick={handleLogout}
            disabled={isPending}
            className="flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-sm text-muted transition hover:bg-background hover:text-foreground disabled:opacity-60"
          >
            <LogOut className="size-4" />
            {isPending ? "Saliendo..." : "Cerrar sesión"}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center border-b border-border bg-surface px-6">
          <p className="text-sm text-muted">
            {isAdmin ? "Consola de plataforma" : "Consola de empresa"}
          </p>
        </header>
        <main className="flex-1 overflow-auto p-6 text-foreground">
          <div className="mx-auto w-full max-w-5xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
