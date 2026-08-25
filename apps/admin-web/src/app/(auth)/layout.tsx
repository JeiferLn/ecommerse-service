import type { ReactNode } from "react";

import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-background text-foreground antialiased">
      <div className="absolute right-4 top-4 z-50 sm:right-6 sm:top-5">
        <ThemeToggle />
      </div>
      {children}
    </div>
  );
}
