"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CreateCompanyDialog } from "@/components/create-company-dialog";
import { apiFetch } from "@/lib/api";
import type { SessionUser } from "@/lib/session";
import { useSession } from "@/providers/session-provider";

const CREATE_COMPANY_VALUE = "__create_company__";

export function CompanySwitcher() {
  const router = useRouter();
  const { user, refresh } = useSession();
  const companies = user?.companies ?? [];
  const [createOpen, setCreateOpen] = useState(false);

  const switchMutation = useMutation({
    mutationFn: (companyId: string) =>
      apiFetch<SessionUser>("/company/switch", {
        method: "POST",
        body: JSON.stringify({ companyId }),
      }),
    onSuccess: async () => {
      await refresh();
      router.push("/");
      router.refresh();
    },
  });

  if (companies.length < 1) {
    return null;
  }

  const ownsACompany = companies.some((company) => company.role === "owner");
  const canCreate = !ownsACompany && user?.role !== "admin";

  return (
    <div className="flex flex-col gap-2">
      <Select
        value={user?.companyId ?? undefined}
        onValueChange={(companyId) => {
          if (companyId === CREATE_COMPANY_VALUE) {
            setCreateOpen(true);
            return;
          }
          switchMutation.mutate(companyId);
        }}
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
          {canCreate && (
            <SelectItem value={CREATE_COMPANY_VALUE}>Crear empresa</SelectItem>
          )}
        </SelectContent>
      </Select>
      <CreateCompanyDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
