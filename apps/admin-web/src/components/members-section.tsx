"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { UserMinus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  CompanyInvitation,
  CompanyMember,
  InviteResult,
  RemoveMemberResult,
} from "@commerce-ai/types";
import { ROLE_LABELS } from "@commerce-ai/types";

import { RoleBadge } from "@/components/role-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useSession } from "@/providers/session-provider";

const ASSIGNABLE_ROLES = ["user", "manager"] as const;

export function MembersSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [memberMessage, setMemberMessage] = useState<string | null>(null);

  const isOwner = user?.role === "owner";

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
      void queryClient.invalidateQueries({ queryKey: ["company-invitations"] });
    },
    onError: (error: unknown) => {
      setInviteMessage(
        error instanceof ApiClientError ? error.message : "No se pudo conectar con el servidor",
      );
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (invitationId: string) =>
      apiFetch<InviteResult>(`/company/invitations/${invitationId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["company-invitations"] });
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ memberId, role }: { memberId: string; role: (typeof ASSIGNABLE_ROLES)[number] }) =>
      apiFetch<CompanyMember>(`/company/members/${memberId}`, {
        method: "PATCH",
        body: JSON.stringify({ role }),
      }),
    onSuccess: () => {
      setMemberMessage(null);
      void queryClient.invalidateQueries({ queryKey: ["company-members"] });
    },
    onError: (error: unknown) => {
      setMemberMessage(
        error instanceof ApiClientError ? error.message : "No se pudo conectar con el servidor",
      );
    },
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      apiFetch<RemoveMemberResult>(`/company/members/${memberId}`, {
        method: "DELETE",
      }),
    onSuccess: (result) => {
      setMemberMessage(result.message);
      void queryClient.invalidateQueries({ queryKey: ["company-members"] });
    },
    onError: (error: unknown) => {
      setMemberMessage(
        error instanceof ApiClientError ? error.message : "No se pudo conectar con el servidor",
      );
    },
  });

  const { data: invitations } = useQuery({
    queryKey: ["company-invitations"],
    queryFn: () => apiFetch<CompanyInvitation[]>("/company/invitations"),
    enabled: Boolean(user?.companyId) && isOwner,
  });

  function handleInvite(event: FormEvent) {
    event.preventDefault();
    setInviteMessage(null);
    inviteMutation.mutate(email);
  }

  function handleRemove(member: CompanyMember) {
    const confirmed = window.confirm(
      `¿Eliminar a ${member.name} (${member.email}) de la empresa? Perderá el acceso de inmediato.`,
    );
    if (!confirmed) {
      return;
    }
    setMemberMessage(null);
    removeMutation.mutate(member.id);
  }

  if (!user?.companyId) {
    return null;
  }

  return (
    <Card className="border-border/70 bg-card/80 shadow-brand-sm backdrop-blur-sm">
      <CardHeader>
        <CardTitle className="font-heading text-xl font-bold">Miembros</CardTitle>
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

        {isOwner && invitations && invitations.length > 0 && (
          <div className="flex flex-col gap-2 rounded-lg border p-4">
            <h3 className="text-sm font-semibold">Invitaciones pendientes</h3>
            <ul className="flex flex-col gap-2">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex items-center justify-between gap-3 rounded-md bg-muted/50 p-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{invitation.email}</span>
                    <span className="text-sm text-muted-foreground">
                      {new Date(invitation.createdAt).toLocaleDateString("es", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => cancelMutation.mutate(invitation.id)}
                    disabled={cancelMutation.isPending}
                  >
                    Cancelar
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!isLoading && members && members.length === 0 && (
          <p className="text-sm text-muted-foreground">Aún no hay miembros.</p>
        )}

        {memberMessage && <p className="text-sm text-muted-foreground">{memberMessage}</p>}

        {!isLoading && members && members.length > 0 && (
          <ul className="flex flex-col gap-2">
            {members.map((member) => {
              const isEditable =
                isOwner && member.id !== user?.id && member.role !== "owner";
              return (
                <li
                  key={member.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate font-medium">{member.name}</span>
                    <span className="truncate text-sm text-muted-foreground">{member.email}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {isEditable ? (
                      <>
                        <Select
                          value={
                            member.role === "user" || member.role === "manager"
                              ? member.role
                              : undefined
                          }
                          onValueChange={(role) =>
                            roleMutation.mutate({
                              memberId: member.id,
                              role: role as (typeof ASSIGNABLE_ROLES)[number],
                            })
                          }
                          disabled={roleMutation.isPending || removeMutation.isPending}
                        >
                          <SelectTrigger
                            aria-label={`Cambiar rol de ${member.name}`}
                            className="h-8 w-32"
                          >
                            <SelectValue placeholder="Rol" />
                          </SelectTrigger>
                          <SelectContent>
                            {ASSIGNABLE_ROLES.map((role) => (
                              <SelectItem key={role} value={role}>
                                {ROLE_LABELS[role]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="destructive"
                          size="sm"
                          aria-label={`Eliminar a ${member.name} de la empresa`}
                          onClick={() => handleRemove(member)}
                          disabled={removeMutation.isPending || roleMutation.isPending}
                        >
                          <UserMinus aria-hidden />
                          Eliminar
                        </Button>
                      </>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
