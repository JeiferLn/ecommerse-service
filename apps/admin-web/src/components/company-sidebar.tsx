"use client";

import {
  canOperateOrders,
  canViewWhatsapp,
  type ConversationSummary,
  type PaginatedResponse,
} from "@commerce-ai/types";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutEffect, useRef, useState } from "react";

import { OnboardingSummary } from "@/components/onboarding-checklist";
import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { isNavItemActive, visibleNav } from "@/lib/company-nav";
import { cn } from "@/lib/utils";
import { useSession } from "@/providers/session-provider";

export function usePendingConversations(enabled: boolean): number {
  const { user } = useSession();
  const { data } = useQuery({
    queryKey: ["whatsapp-conversations", user?.companyId],
    queryFn: () =>
      apiFetch<PaginatedResponse<ConversationSummary>>("/whatsapp/conversations?page=1&perPage=50"),
    enabled: enabled && Boolean(user?.companyId),
    retry: false,
    refetchInterval: 60_000,
  });
  return data?.items.filter((item) => item.handler === "human").length ?? 0;
}

export const NAV_ITEM_CLASS =
  "relative inline-flex h-9 items-center gap-2.5 rounded-md px-3 text-sm transition-colors duration-150";
export const NAV_ITEM_ACTIVE = "bg-muted font-medium text-foreground";

/** Barra de 2 px que se desliza hasta el ítem con aria-current="page". */
export function useActiveIndicator(pathname: string) {
  const navRef = useRef<HTMLElement>(null);
  const [box, setBox] = useState<{ top: number; height: number; animate: boolean } | null>(null);

  useLayoutEffect(() => {
    const nav = navRef.current;
    const update = () => {
      const active = nav?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!nav || !active) {
        setBox(null);
        return;
      }
      const navTop = nav.getBoundingClientRect().top;
      const rect = active.getBoundingClientRect();
      setBox((prev) => ({
        top: rect.top - navTop + 8,
        height: rect.height - 16,
        animate: prev !== null,
      }));
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [pathname]);

  const indicator = box ? (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute top-0 left-0 w-0.5 rounded-full bg-foreground",
        box.animate && "transition-transform duration-280 ease-out",
      )}
      style={{ height: box.height, transform: `translateY(${box.top}px)` }}
    />
  ) : null;

  return { navRef, indicator };
}
export const NAV_ITEM_IDLE = "text-muted-foreground hover:bg-muted/60 hover:text-foreground";

/** Contenido de navegación de la empresa; se usa en el sidebar y en el menú móvil. */
export function CompanyNav({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useSession();
  const pathname = usePathname();
  const role = user?.role;
  const groups = visibleNav(role);
  const canSell = Boolean(role && role !== "admin" && canOperateOrders(role));
  const pending = usePendingConversations(
    Boolean(role && role !== "admin" && canViewWhatsapp(role)),
  );
  const { navRef, indicator } = useActiveIndicator(pathname);

  return (
    <nav ref={navRef} aria-label="Navegación de la tienda" className="relative flex flex-col gap-5">
      {indicator}
      {canSell ? (
        <Button asChild className="w-full justify-start">
          <Link href="/sales" onClick={onNavigate}>
            <Plus aria-hidden />
            Nueva venta
          </Link>
        </Button>
      ) : null}

      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-0.5">
          <p className="px-3 pb-1 text-xs text-muted-foreground">{group.label}</p>
          {group.items.map((item) => {
            const active = isNavItemActive(item, pathname);
            const Icon = item.icon;
            const count = item.badge === "pendingConversations" ? pending : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(NAV_ITEM_CLASS, active ? NAV_ITEM_ACTIVE : NAV_ITEM_IDLE)}
              >
                <Icon className="size-4 shrink-0" aria-hidden />
                <span className="flex-1">{item.label}</span>
                {count > 0 ? (
                  <span
                    className="min-w-5 rounded-full bg-warning-soft px-1.5 py-0.5 text-center text-[11px] leading-none font-semibold text-warning tabular-nums"
                    aria-label={`${count} esperando respuesta`}
                  >
                    {count}
                  </span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

export function CompanySidebar() {
  return (
    <aside className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border px-3 py-5 lg:flex">
      <CompanyNav />
      <div className="mt-auto">
        <OnboardingSummary />
      </div>
    </aside>
  );
}
