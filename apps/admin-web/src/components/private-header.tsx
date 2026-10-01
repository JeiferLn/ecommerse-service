"use client";

import { CompanySwitcher } from "@/components/company-switcher";
import { MobileNav } from "@/components/mobile-nav";
import { SiteLogo } from "@/components/site/site-logo";
import { UserMenu } from "@/components/user-menu";
import { homePathForRole } from "@/lib/home-path";
import { useSession } from "@/providers/session-provider";

export function PrivateHeader() {
  const { user } = useSession();
  const home = homePathForRole(user?.role);
  const isAdmin = user?.role === "admin";

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-background">
      <div className="flex h-full items-center justify-between gap-4 px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <MobileNav />
          <SiteLogo href={home} />
          {isAdmin ? (
            <span className="hidden rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground sm:inline">
              Plataforma
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {!isAdmin && (
            <div className="hidden sm:block">
              <CompanySwitcher variant="ghost" />
            </div>
          )}
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
