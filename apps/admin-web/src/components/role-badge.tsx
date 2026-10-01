"use client";

import { ROLE_LABELS, type UserRole } from "@commerce-ai/types";

import { StatusPill, type StatusTone } from "@/components/ui/status-pill";
import { useSession } from "@/providers/session-provider";

const ROLE_TONE: Record<UserRole, StatusTone> = {
  admin: "positive",
  owner: "positive",
  manager: "neutral",
  user: "neutral",
};

export function RoleBadge({ role }: { role: UserRole }) {
  return <StatusPill tone={ROLE_TONE[role]}>{ROLE_LABELS[role]}</StatusPill>;
}

export function SessionRoleBadge() {
  const { user, isLoading } = useSession();

  if (isLoading || !user) {
    return null;
  }

  return <RoleBadge role={user.role} />;
}
