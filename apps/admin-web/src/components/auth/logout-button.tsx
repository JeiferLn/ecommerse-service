"use client";

import { LogOut } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

export function LogoutButton() {
  const router = useRouter();
  const { clear } = useSession();

  async function handleLogout() {
    await apiFetch<null>("/auth/logout", { method: "POST" }).catch(() => null);
    clear();
    router.push("/login");
    router.refresh();
  }

  return (
    <Button variant="ghost" size="sm" onClick={handleLogout}>
      <LogOut aria-hidden /> Cerrar sesión
    </Button>
  );
}
