"use client";

import { useEffect, useState } from "react";

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
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Plataforma
        </h1>
        <p className="mt-1 text-sm text-muted">
          Empresas y usuarios registrados en Commerce AI.
        </p>
      </div>

      {error ? (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      ) : null}

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-foreground">Empresas</h2>
          <span className="text-xs text-muted">{companies.length}</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Nombre</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium text-right">Usuarios</th>
              </tr>
            </thead>
            <tbody>
              {companies.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-muted">
                    Sin empresas aún
                  </td>
                </tr>
              ) : (
                companies.map((company) => (
                  <tr
                    key={company.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {company.name}
                    </td>
                    <td className="px-4 py-3 text-muted">{company.type}</td>
                    <td className="px-4 py-3 text-right text-muted">
                      {company._count.users}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium text-foreground">Usuarios</h2>
          <span className="text-xs text-muted">{users.length}</span>
        </div>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border bg-background text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3 font-medium">Usuario</th>
                <th className="px-4 py-3 font-medium">Empresa</th>
                <th className="px-4 py-3 font-medium text-right">Rol</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b border-border last:border-0"
                >
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{user.name}</p>
                    <p className="text-xs text-muted">{user.email}</p>
                  </td>
                  <td className="px-4 py-3 text-muted">
                    {user.company?.name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-foreground">
                    {user.role}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
