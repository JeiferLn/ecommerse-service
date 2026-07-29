"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { COMPANY_TYPES } from "@/lib/routes";

const fieldClassName =
  "rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground outline-none transition placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-ring/30";

type Company = {
  id: string;
  name: string;
  type: string;
  phone: string | null;
  address: string | null;
  timezone: string;
};

export default function SettingsPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(true);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const [companyRes, meHint] = await Promise.all([
        fetch("/api/companies/me"),
        fetch("/api/companies/me/invitations"),
      ]);

      if (companyRes.ok) {
        setCompany((await companyRes.json()) as Company);
      } else {
        setError("No se pudo cargar la empresa");
      }

      // MEMBER no puede listar invitaciones (403)
      setIsOwner(meHint.status !== 403);
    })();
  }, []);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!isOwner) return;
    setError(null);
    setSuccess(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      name: String(formData.get("name") ?? ""),
      type: String(formData.get("type") ?? ""),
      phone: String(formData.get("phone") ?? ""),
      address: String(formData.get("address") ?? ""),
      timezone: String(formData.get("timezone") ?? ""),
    };

    startTransition(async () => {
      const res = await fetch("/api/companies/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          (data as { message?: string })?.message ??
            "No se pudo guardar la empresa",
        );
        return;
      }

      setCompany(data as Company);
      setSuccess("Configuración guardada");
    });
  }

  if (!company) {
    return <p className="text-muted">{error ?? "Cargando..."}</p>;
  }

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Configuración de empresa
      </h1>
      <p className="mt-2 text-sm text-muted">
        {isOwner
          ? "Actualiza los datos iniciales de tu negocio."
          : "Solo el dueño puede editar esta información."}
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Nombre</span>
          <input
            name="name"
            defaultValue={company.name}
            required
            disabled={!isOwner}
            className={fieldClassName}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Tipo</span>
          <select
            name="type"
            defaultValue={company.type}
            required
            disabled={!isOwner}
            className={fieldClassName}
          >
            {COMPANY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Teléfono</span>
          <input
            name="phone"
            defaultValue={company.phone ?? ""}
            disabled={!isOwner}
            className={fieldClassName}
            placeholder="+57 300 000 0000"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Dirección</span>
          <input
            name="address"
            defaultValue={company.address ?? ""}
            disabled={!isOwner}
            className={fieldClassName}
            placeholder="Calle 1 # 2-3"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Zona horaria</span>
          <input
            name="timezone"
            defaultValue={company.timezone}
            disabled={!isOwner}
            className={fieldClassName}
          />
        </label>

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}
        {success ? <p className="text-sm text-primary">{success}</p> : null}

        {isOwner ? (
          <button
            type="submit"
            disabled={isPending}
            className="mt-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
          >
            {isPending ? "Guardando..." : "Guardar"}
          </button>
        ) : null}
      </form>
    </div>
  );
}
