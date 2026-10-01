import type { ReactNode } from "react";

import { PrivateHeader } from "@/components/private-header";

export default function PrivateLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PrivateHeader />

      <main className="flex min-h-[calc(100dvh-3.5rem)] flex-1">{children}</main>
    </div>
  );
}
