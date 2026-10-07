"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, LayoutDashboard, MessageCircle, Settings } from "lucide-react";

import {
  NAV_ITEM_ACTIVE,
  NAV_ITEM_CLASS,
  NAV_ITEM_IDLE,
  useActiveIndicator,
} from "@/components/company-sidebar";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/admin", label: "Resumen", icon: LayoutDashboard },
  { href: "/admin/companies", label: "Empresas", icon: Building2 },
  { href: "/admin/whatsapp-test", label: "WhatsApp Test", icon: MessageCircle },
  { href: "/admin/settings", label: "Configuración", icon: Settings },
] as const;

export function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const { navRef, indicator } = useActiveIndicator(pathname);

  return (
    <nav
      ref={navRef}
      aria-label="Navegación de plataforma"
      className="relative flex flex-col gap-0.5"
    >
      {indicator}
      <p className="px-3 pb-1 text-xs text-muted-foreground">Plataforma</p>
      {NAV_ITEMS.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={isActive ? "page" : undefined}
            className={cn(NAV_ITEM_CLASS, isActive ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE)}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function AdminSidebar() {
  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 overflow-y-auto border-r border-border px-3 py-5 lg:block">
      <AdminNav />
    </aside>
  );
}
