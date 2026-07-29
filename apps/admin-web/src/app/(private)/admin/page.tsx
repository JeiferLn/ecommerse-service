"use client";

import { LogOut, Shield } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ROUTES } from "@/lib/routes";

type CompanyRow = {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  _count: { users: number };
};

type UserRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  company: { id: string; name: string } | null;
};

export default function AdminPage() {
  const router = useRouter();
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const [companiesRes, usersRes] = await Promise.all([
        fetch("/api/admin/companies"),
        fetch("/api/admin/users"),
      ]);

      if (!companiesRes.ok || !usersRes.ok) {
        setError("No se pudo cargar el panel de administración");
        return;
      }

      setCompanies((await companiesRes.json()) as CompanyRow[]);
      setUsers((await usersRes.json()) as UserRow[]);
    })();
  }, []);

  function handleLogout() {
    startTransition(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace(ROUTES.login);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-primary">
            <Shield className="size-4" />
            <span className="text-xs font-semibold uppercase tracking-wide">
              Plataforma
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Panel de administrador
          </h1>
          <p className="mt-2 text-muted">
            Empresas y usuarios que usan Commerce AI.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm font-medium text-foreground transition hover:border-border-strong hover:bg-primary-soft/40 disabled:opacity-60"
        >
          <LogOut className="size-4" />
          {isPending ? "Saliendo..." : "Cerrar sesión"}
        </button>
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Empresas ({companies.length})
        </h2>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
          {companies.length === 0 ? (
            <li className="px-4 py-3 text-sm text-muted">Sin empresas aún</li>
          ) : (
            companies.map((company) => (
              <li
                key={company.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <div>
                  <p className="font-medium text-foreground">{company.name}</p>
                  <p className="text-sm text-muted">{company.type}</p>
                </div>
                <span className="text-sm text-muted">
                  {company._count.users} usuarios
                </span>
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">
          Usuarios ({users.length})
        </h2>
        <ul className="mt-3 divide-y divide-border rounded-xl border border-border bg-surface">
          {users.map((user) => (
            <li
              key={user.id}
              className="flex items-center justify-between gap-3 px-4 py-3"
            >
              <div>
                <p className="font-medium text-foreground">{user.name}</p>
                <p className="text-sm text-muted">
                  {user.email}
                  {user.company ? ` · ${user.company.name}` : ""}
                </p>
              </div>
              <span className="text-xs font-semibold uppercase tracking-wide text-primary">
                {user.role}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
