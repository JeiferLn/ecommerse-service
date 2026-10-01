"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Mail, UserMinus, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import type {
  CompanyInvitation,
  CompanyMember,
  InviteResult,
  RemoveMemberResult,
} from "@commerce-ai/types";
import {
  MEMBER_ASSIGNABLE_ROLES,
  ROLE_LABELS,
  canManageMembers,
  canViewMembers,
} from "@commerce-ai/types";

import { PageHeader } from "@/components/page-header";
import { RoleBadge } from "@/components/role-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SkeletonRows } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiFetch, ApiClientError } from "@/lib/api";
import { useStaggerOnce } from "@/lib/use-stagger-once";
import { useSession } from "@/providers/session-provider";

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function MembersSection() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [memberMessage, setMemberMessage] = useState<string | null>(null);

  const canManage = Boolean(user && canManageMembers(user.role));
  const canView = Boolean(user && canViewMembers(user.role));

  const { data: members, isLoading } = useQuery({
    queryKey: ["company-members"],
    queryFn: () => apiFetch<CompanyMember[]>("/company/members"),
    enabled: Boolean(user?.companyId) && canView,
  });
  const rowsStagger = useStaggerOnce(Boolean(members?.length));

  const inviteMutation = useMutation({
    mutationFn: (inviteEmail: string) =>
      apiFetch<InviteResult>("/company/invitations", {
        method: "POST",
        body: JSON.stringify({ email: inviteEmail }),
      }),
    onSuccess: (result) => {
      setEmail("");
      setInviteOpen(false);
      setMemberMessage(result.message);
      void queryClient.invalidateQueries({ queryKey: ["company-members"] });
      void queryClient.invalidateQueries({ queryKey: ["company-invitations"] });
    },
    onError: (error: unknown) => {
      setInviteError(
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
    mutationFn: ({
      memberId,
      role,
    }: {
      memberId: string;
      role: (typeof MEMBER_ASSIGNABLE_ROLES)[number];
    }) =>
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
    enabled: Boolean(user?.companyId) && canManage,
  });

  function handleInvite(event: FormEvent) {
    event.preventDefault();
    setInviteError(null);
    inviteMutation.mutate(email.trim());
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

  if (!user) {
    return <SkeletonRows rows={3} columns={3} />;
  }

  if (!user.companyId) {
    return null;
  }

  return (
    <div className="flex flex-col">
      <PageHeader
        title="Equipo"
        description="Las personas con acceso a tu tienda y lo que cada una puede hacer."
        className="mb-6"
        actions={
          canManage ? (
            <Dialog
              open={inviteOpen}
              onOpenChange={(open) => {
                setInviteOpen(open);
                if (open) {
                  setInviteError(null);
                }
              }}
            >
              <DialogTrigger asChild>
                <Button>
                  <UserPlus aria-hidden />
                  Invitar
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <form onSubmit={handleInvite} className="flex flex-col gap-4">
                  <DialogHeader>
                    <DialogTitle>Invitar al equipo</DialogTitle>
                    <DialogDescription>
                      Le enviaremos un correo para que cree su cuenta. Entra con rol de usuario y
                      luego puedes cambiarlo.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="invite-email">Correo</Label>
                    <Input
                      id="invite-email"
                      type="email"
                      placeholder="correo@persona.com"
                      autoComplete="off"
                      autoFocus
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      disabled={inviteMutation.isPending}
                    />
                    {inviteError ? <p className="text-sm text-destructive">{inviteError}</p> : null}
                  </div>
                  <DialogFooter>
                    <Button type="submit" disabled={inviteMutation.isPending || !email.trim()}>
                      {inviteMutation.isPending ? "Enviando…" : "Enviar invitación"}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          ) : null
        }
      />

      {memberMessage ? (
        <p
          key={memberMessage}
          role="status"
          className="slide-up-in mb-4 text-sm text-muted-foreground"
        >
          {memberMessage}
        </p>
      ) : null}

      {isLoading ? <SkeletonRows rows={3} columns={3} /> : null}

      {!isLoading && members && members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay miembros.</p>
      ) : null}

      {!isLoading && members && members.length > 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Persona</TableHead>
              <TableHead className="w-40">Rol</TableHead>
              {canManage ? <TableHead className="w-12" /> : null}
            </TableRow>
          </TableHeader>
          <TableBody className={rowsStagger}>
            {members.map((member) => {
              const isEditable = canManage && member.id !== user?.id && member.role !== "owner";
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground"
                      >
                        {initials(member.name)}
                      </span>
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium">
                          {member.name}
                          {member.id === user?.id ? (
                            <span className="font-normal text-muted-foreground"> · tú</span>
                          ) : null}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">
                          {member.email}
                        </span>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {isEditable ? (
                      <Select
                        value={
                          member.role === "user" || member.role === "manager"
                            ? member.role
                            : undefined
                        }
                        onValueChange={(role) =>
                          roleMutation.mutate({
                            memberId: member.id,
                            role: role as (typeof MEMBER_ASSIGNABLE_ROLES)[number],
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
                          {MEMBER_ASSIGNABLE_ROLES.map((role) => (
                            <SelectItem key={role} value={role}>
                              {ROLE_LABELS[role]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <RoleBadge role={member.role} />
                    )}
                  </TableCell>
                  {canManage ? (
                    <TableCell className="text-right">
                      {isEditable ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          className="text-muted-foreground hover:text-destructive"
                          aria-label={`Eliminar a ${member.name} de la empresa`}
                          onClick={() => handleRemove(member)}
                          disabled={removeMutation.isPending || roleMutation.isPending}
                        >
                          <UserMinus aria-hidden />
                        </Button>
                      ) : null}
                    </TableCell>
                  ) : null}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      ) : null}

      {canManage && invitations && invitations.length > 0 ? (
        <section className="mt-10 flex flex-col gap-3">
          <h2 className="text-sm font-medium">
            Invitaciones pendientes{" "}
            <span className="font-normal text-muted-foreground tabular-nums">
              {invitations.length}
            </span>
          </h2>
          <ul className="divide-y divide-border border-y border-border">
            {invitations.map((invitation) => (
              <li key={invitation.id} className="flex items-center gap-3 py-2.5">
                <Mail className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-sm">{invitation.email}</span>
                <span className="text-xs whitespace-nowrap text-muted-foreground max-sm:hidden">
                  Enviada el{" "}
                  {new Date(invitation.createdAt).toLocaleDateString("es", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => cancelMutation.mutate(invitation.id)}
                  disabled={cancelMutation.isPending}
                >
                  Cancelar
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
