"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import type { CompanyMember, InviteResult } from "@commerce-ai/types";

import { RoleBadge } from "@/components/role-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

export function MembersSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  const { data: members, isLoading } = useQuery({
    queryKey: ["company-members"],
    queryFn: () => apiFetch<CompanyMember[]>("/company/members"),
    enabled: Boolean(user?.companyId),
  });

  const inviteMutation = useMutation({
    mutationFn: (inviteEmail: string) =>
      apiFetch<InviteResult>("/company/invitations", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail }),
      }),
    onSuccess: (result) => {
      setEmail("");
      setInviteMessage(result.message);
      void queryClient.invalidateQueries({ queryKey: ["company-members"] });
    },
    onError: (error: unknown) => {
      setInviteMessage(
        error instanceof ApiClientError ? error.message : "No se pudo conectar con el servidor",
      );
    },
  });

  function handleInvite(event: FormEvent) {
    event.preventDefault();
    setInviteMessage(null);
    inviteMutation.mutate(email);
  }

  if (!user?.companyId) {
    return null;
  }

  const isOwner = user?.role === "owner";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Miembros</CardTitle>
        <CardDescription>Personas con acceso a la empresa.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {isOwner && (
          <form onSubmit={handleInvite} className="flex flex-col gap-2">
            <Label htmlFor="invite-email">Invitar miembro</Label>
            <div className="flex gap-2">
              <Input
                id="invite-email"
                type="email"
                placeholder="correo@persona.com"
                autoComplete="off"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={inviteMutation.isPending}
              />
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending ? "Enviando…" : "Invitar"}
              </Button>
            </div>
            {inviteMessage && <p className="text-sm text-muted-foreground">{inviteMessage}</p>}
          </form>
        )}

        {isLoading && <p className="text-sm text-muted-foreground">Cargando miembros…</p>}

        {!isLoading && members && members.length === 0 && (
          <p className="text-sm text-muted-foreground">Aún no hay miembros.</p>
        )}

        {!isLoading && members && members.length > 0 && (
          <ul className="flex flex-col gap-2">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate font-medium">{member.name}</span>
                  <span className="truncate text-sm text-muted-foreground">{member.email}</span>
                </div>
                <RoleBadge role={member.role} />
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
