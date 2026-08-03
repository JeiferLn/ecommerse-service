import type { ReactNode } from "react";

import { PrivateHeader } from "@/components/private-header";

export default function PrivateLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col">
      <div aria-hidden className="surface-mesh pointer-events-none absolute inset-0 opacity-40" />

      <PrivateHeader />

      <main className="relative z-10 flex-1 p-4 sm:p-6">{children}</main>
    </div>
  );
}
