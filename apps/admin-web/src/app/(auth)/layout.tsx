import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-12 sm:px-6">
      <div aria-hidden className="surface-mesh pointer-events-none absolute inset-0 opacity-60" />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 size-112 -translate-x-1/2 rounded-full bg-[radial-gradient(circle,var(--brand-glow)_0%,transparent_70%)] opacity-35 blur-2xl"
      />

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8">
        <BrandMark size="lg" className="animate-rise" />
        <div className="animate-rise-delay-1 w-full">{children}</div>
      </div>
    </main>
  );
}
