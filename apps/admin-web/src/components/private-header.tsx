"use client";

import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { CompanySwitcher } from "@/components/company-switcher";
import { LogoutButton } from "@/components/auth/logout-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { homePathForRole } from "@/lib/home-path";
import { useSession } from "@/providers/session-provider";

export function PrivateHeader() {
  const { user } = useSession();
  const home = homePathForRole(user?.role);
  const isAdmin = user?.role === "admin";

  return (
    <header className="relative z-20 border-b border-border/70 bg-background/70 backdrop-blur-md">
      <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <BrandMark href={home} size="sm" />
        <nav className="flex items-center gap-2">
          {!isAdmin && <CompanySwitcher />}
          <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
            <Link href={home}>{isAdmin ? "Admin" : "Dashboard"}</Link>
          </Button>
          <ThemeToggle />
          <LogoutButton />
        </nav>
      </div>
    </header>
  );
}
