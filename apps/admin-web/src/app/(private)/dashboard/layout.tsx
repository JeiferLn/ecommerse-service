"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { DashboardSidebar } from "@/components/dashboard-sidebar";
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
    return <p className="text-sm text-muted-foreground">Redirigiendo al panel de plataforma…</p>;
  }

  return (
    <div className="flex flex-1 gap-4 lg:gap-8">
      <DashboardSidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
