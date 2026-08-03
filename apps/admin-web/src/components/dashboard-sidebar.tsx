"use client";

import { canViewMembers, type UserRole } from "@commerce-ai/types";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FolderTree, LayoutDashboard, Package, Settings, Users } from "lucide-react";

import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  visible: (role: UserRole | undefined) => boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Overview",
    icon: LayoutDashboard,
    visible: (role) => role !== "admin",
  },
  {
    href: "/dashboard/products",
    label: "Productos",
    icon: Package,
    visible: (role) => role !== "admin",
  },
  {
    href: "/dashboard/categories",
    label: "Categorías",
    icon: FolderTree,
    visible: (role) => role !== "admin",
  },
  {
    href: "/dashboard/members",
    label: "Miembros",
    icon: Users,
    visible: (role) => Boolean(role && role !== "admin" && canViewMembers(role)),
  },
  {
    href: "/dashboard/settings",
    label: "Configuración",
    icon: Settings,
    visible: (role) => role !== "admin",
  },
];

export function DashboardSidebar() {
  const { user } = useSession();
  const pathname = usePathname();

  const items = NAV_ITEMS.filter((item) => item.visible(user?.role));

  return (
    <aside className="w-56 shrink-0">
      <nav className="sticky top-6 flex flex-col gap-1 rounded-2xl border border-border/70 bg-card/70 p-2 shadow-brand-sm backdrop-blur-sm">
        {items.map((item) => {
          const isActive =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          const Icon = item.icon;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "inline-flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
