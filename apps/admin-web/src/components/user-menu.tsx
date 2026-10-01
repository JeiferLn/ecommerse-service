"use client";

import { ROLE_LABELS } from "@commerce-ai/types";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiFetch } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function UserMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, clear } = useSession();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  if (!user) {
    return null;
  }

  async function handleLogout() {
    await apiFetch<null>("/auth/logout", { method: "POST" }).catch(() => null);
    clear();
    queryClient.clear();
    router.push("/login");
    router.refresh();
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className="inline-flex h-9 items-center gap-2 rounded-md py-1 pr-2 pl-1 text-sm transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none"
        aria-label="Abrir menú de usuario"
      >
        <span className="flex size-7 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
          {initials(user.name) || "?"}
        </span>
        <span className="hidden max-w-32 truncate font-medium sm:block">{user.name}</span>
        <ChevronDown className="size-4 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="block truncate font-medium">{user.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
          <span className="mt-1.5 inline-block rounded-md bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
            {ROLE_LABELS[user.role]}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => setTheme(isDark ? "light" : "dark")}>
          {isDark ? <Sun aria-hidden /> : <Moon aria-hidden />}
          {isDark ? "Tema claro" : "Tema oscuro"}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => void handleLogout()}>
          <LogOut aria-hidden />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
