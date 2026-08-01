"use client";

import { ROLE_LABELS, type UserRole } from "@commerce-ai/types";

import { Badge } from "@/components/ui/badge";
import { useSession } from "@/providers/session-provider";

const ROLE_STYLES: Record<UserRole, string> = {
  admin: "border-primary/25 bg-primary/10 text-primary",
  owner: "border-sky-600/25 bg-sky-500/10 text-sky-800",
  manager: "border-amber-500/30 bg-amber-500/10 text-amber-800",
  user: "border-border bg-muted text-muted-foreground",
};

export function RoleBadge({ role }: { role: UserRole }) {
  return (
    <Badge className={ROLE_STYLES[role]} title={`Rol: ${ROLE_LABELS[role]}`}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}

export function SessionRoleBadge() {
  const { user, isLoading } = useSession();

  if (isLoading || !user) {
    return null;
  }

  return <RoleBadge role={user.role} />;
}
