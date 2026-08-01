import Link from "next/link";
import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <Link href="/" className="text-2xl font-bold tracking-tight">
        Commerce AI SaaS
      </Link>
      {children}
    </main>
  );
}
