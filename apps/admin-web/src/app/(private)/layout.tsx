import Link from "next/link";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import { CompanySwitcher } from "@/components/company-switcher";
import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";

export default function PrivateLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div aria-hidden className="surface-mesh pointer-events-none absolute inset-0 opacity-40" />

      <header className="relative z-20 border-b border-border/70 bg-background/70 backdrop-blur-md">
        <div className="flex items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <BrandMark href="/dashboard" size="sm" />
          <nav className="flex items-center gap-2">
            <CompanySwitcher />
            <Button variant="ghost" size="sm" asChild className="hidden sm:inline-flex">
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <LogoutButton />
          </nav>
        </div>
      </header>

      <main className="relative z-10 flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
