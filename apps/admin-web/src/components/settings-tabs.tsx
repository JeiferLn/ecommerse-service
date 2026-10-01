"use client";

import { canManageWhatsapp, type UserRole } from "@commerce-ai/types";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

const TABS: { href: string; label: string; visible: (role: Exclude<UserRole, "admin">) => boolean }[] = [
  { href: "/settings", label: "Tienda", visible: () => true },
  { href: "/settings/payments", label: "Pagos", visible: canManageWhatsapp },
  { href: "/settings/shipping", label: "Envíos", visible: canManageWhatsapp },
];

export function SettingsTabs() {
  const pathname = usePathname();
  const { user } = useSession();
  const role = user?.role;
  const tabs = TABS.filter((tab) => role && role !== "admin" && tab.visible(role));
  if (tabs.length < 2) {
    return null;
  }

  return (
    <nav aria-label="Secciones de configuración" className="mb-8 flex gap-6 border-b border-border">
      {tabs.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative -mb-px border-b-2 pb-2.5 text-sm transition-colors duration-150",
              active
                ? "border-foreground font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
