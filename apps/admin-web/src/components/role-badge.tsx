"use client";

import { ROLE_LABELS, type UserRole } from "@commerce-ai/types";

import { Badge } from "@/components/ui/badge";
import { useSession } from "@/providers/session-provider";

const ROLE_STYLES: Record<UserRole, string> = {
  admin: "border-purple-500/30 bg-purple-500/10 text-purple-700 dark:text-purple-300",
  owner: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  manager: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  user: "border-muted-foreground/30 bg-muted text-muted-foreground",
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
