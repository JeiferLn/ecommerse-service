"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { CompanySidebar } from "@/components/company-sidebar";
import { SubscriptionBanner } from "@/components/subscription-banner";
import { useSession } from "@/providers/session-provider";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, isLoading } = useSession();

  useEffect(() => {
    if (!isLoading && user?.role === "admin") {
      router.replace("/admin");
    }
  }, [isLoading, user?.role, router]);

  if (user?.role === "admin") {
    return <p className="p-6 text-sm text-muted-foreground">Redirigiendo al panel de plataforma…</p>;
  }

  return (
    <div className="flex w-full flex-1">
      <CompanySidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <SubscriptionBanner />
        <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-6 sm:px-8 lg:py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
