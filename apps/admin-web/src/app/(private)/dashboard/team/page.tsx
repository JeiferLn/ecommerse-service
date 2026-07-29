"use client";

import { FormEvent, useCallback, useEffect, useState, useTransition } from "react";
import { Trash2 } from "lucide-react";

const fieldClassName =
  "rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground outline-none transition placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-ring/30";

type Member = {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
};

type Invitation = {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  createdAt: string;
};

export default function TeamPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isOwner, setIsOwner] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = useCallback(async () => {
    setError(null);
    const membersRes = await fetch("/api/companies/me/members");
    if (!membersRes.ok) {
      setError("No se pudo cargar el equipo");
      return;
    }
    setMembers((await membersRes.json()) as Member[]);

    const invitesRes = await fetch("/api/companies/me/invitations");
    if (invitesRes.ok) {
      setIsOwner(true);
      setInvitations((await invitesRes.json()) as Invitation[]);
    } else if (invitesRes.status === 403) {
      setIsOwner(false);
      setInvitations([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function onInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setInviteLink(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") ?? "");

    startTransition(async () => {
      const res = await fetch("/api/companies/me/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await res.json().catch(() => null)) as {
        message?: string;
        acceptUrl?: string;
      } | null;

      if (!res.ok) {
        setError(data?.message ?? "No se pudo enviar la invitación");
        return;
      }

      if (data?.acceptUrl) {
        setInviteLink(data.acceptUrl);
      }
      form.reset();
      await load();
    });
  }

  function revoke(id: string) {
    startTransition(async () => {
      const res = await fetch(`/api/companies/me/invitations/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(
          (data as { message?: string })?.message ??
            "No se pudo revocar la invitación",
        );
        return;
      }
      await load();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Equipo
        </h1>
        <p className="mt-2 text-sm text-muted">
          Usuarios de tu empresa. Los miembros solo se agregan por invitación.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      {isOwner ? (
        <form onSubmit={onInvite} className="flex flex-col gap-3 sm:flex-row">
          <input
            type="email"
            name="email"
            required
            placeholder="correo@ejemplo.com"
            className={`flex-1 ${fieldClassName}`}
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
          >
            {isPending ? "Enviando..." : "Invitar"}
          </button>
        </form>
      ) : null}

      {inviteLink ? (
        <p className="rounded-lg border border-border bg-primary-soft/40 px-4 py-3 text-sm text-foreground">
          En desarrollo (sin SMTP). Link de invitación:{" "}
          <a href={inviteLink} className="font-medium text-primary underline">
            {inviteLink}
          </a>
        </p>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Miembros
        </h2>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
          {members.map((member) => (
            <li
              key={member.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="font-medium text-foreground">{member.name}</p>
                <p className="text-sm text-muted">{member.email}</p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                {member.role}
              </span>
            </li>
          ))}
        </ul>
      </section>

      {isOwner ? (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
            Invitaciones
          </h2>
          {invitations.length === 0 ? (
            <p className="mt-3 text-sm text-muted">No hay invitaciones.</p>
          ) : (
            <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
              {invitations.map((invitation) => (
                <li
                  key={invitation.id}
                  className="flex items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {invitation.email}
                    </p>
                    <p className="text-sm text-muted">
                      {invitation.status} · expira{" "}
                      {new Date(invitation.expiresAt).toLocaleDateString("es")}
                    </p>
                  </div>
                  {invitation.status === "PENDING" ? (
                    <button
                      type="button"
                      onClick={() => revoke(invitation.id)}
                      disabled={isPending}
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1.5 text-xs text-muted transition hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                      Revocar
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </div>
  );
}
