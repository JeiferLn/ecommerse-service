import Link from "next/link";
import type { ReactNode } from "react";

import { LogoutButton } from "@/components/auth/logout-button";
import { Button } from "@/components/ui/button";

export default function PrivateLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b p-4">
        <Link href="/dashboard" className="text-lg font-bold tracking-tight">
          Commerce AI SaaS
        </Link>
        <nav className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/dashboard">Dashboard</Link>
          </Button>
          <LogoutButton />
        </nav>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
