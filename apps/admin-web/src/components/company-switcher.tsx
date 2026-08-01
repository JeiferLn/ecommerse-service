"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch } from "@/lib/api";
import type { SessionUser } from "@/lib/session";
import { useSession } from "@/providers/session-provider";

export function CompanySwitcher() {
  const router = useRouter();
  const { user, refresh } = useSession();
  const companies = user?.companies ?? [];

  const switchMutation = useMutation({
    mutationFn: (companyId: string) =>
      apiFetch<SessionUser>("/company/switch", {
        method: "POST",
        body: JSON.stringify({ companyId }),
      }),
    onSuccess: async () => {
      await refresh();
      router.push("/dashboard");
      router.refresh();
    },
  });

  if (companies.length < 2) {
    return null;
  }

  return (
    <Select
      value={user?.companyId ?? undefined}
      onValueChange={(companyId) => switchMutation.mutate(companyId)}
      disabled={switchMutation.isPending}
    >
      <SelectTrigger aria-label="Cambiar de empresa" className="w-52">
        <SelectValue placeholder="Selecciona empresa" />
      </SelectTrigger>
      <SelectContent>
        {companies.map((company) => (
          <SelectItem key={company.id} value={company.id}>
            {company.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
