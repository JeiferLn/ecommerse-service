"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";
import { COMPANY_TYPES, ROUTES, homePathByRole } from "@/lib/routes";

const fieldClassName =
  "rounded-lg border border-border bg-surface px-3 py-2.5 text-foreground outline-none transition placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-ring/30";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "");
    const email = String(formData.get("email") ?? "");
    const password = String(formData.get("password") ?? "");
    const companyName = String(formData.get("companyName") ?? "");
    const companyType = String(formData.get("companyType") ?? "");

    startTransition(async () => {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          companyName,
          companyType,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        message?: string;
        user?: { role?: string };
      } | null;

      if (!res.ok) {
        setError(data?.message ?? "No se pudo registrar");
        return;
      }

      router.replace(homePathByRole(data?.user?.role));
      router.refresh();
    });
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        Crear cuenta
      </h1>
      <p className="mt-2 text-sm text-muted">
        Registra tu empresa como dueño en Commerce AI
      </p>

      <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Tu nombre</span>
          <input
            type="text"
            name="name"
            autoComplete="name"
            required
            minLength={2}
            className={fieldClassName}
            placeholder="Tu nombre"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Correo</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            required
            className={fieldClassName}
            placeholder="tu@empresa.com"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Contraseña</span>
          <input
            type="password"
            name="password"
            autoComplete="new-password"
            required
            minLength={8}
            className={fieldClassName}
            placeholder="••••••••"
          />
        </label>

        <div className="my-1 h-px bg-border" />

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Nombre de la empresa</span>
          <input
            type="text"
            name="companyName"
            required
            minLength={2}
            className={fieldClassName}
            placeholder="Mi Empresa SAS"
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium text-foreground">Tipo de empresa</span>
          <select
            name="companyType"
            required
            defaultValue=""
            className={fieldClassName}
          >
            <option value="" disabled>
              Selecciona un tipo
            </option>
            {COMPANY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        {error ? (
          <p className="text-sm text-danger" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isPending}
          className="mt-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition hover:bg-primary-hover disabled:opacity-60"
        >
          {isPending ? "Registrando..." : "Registrar empresa"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link
          href={ROUTES.login}
          className="font-semibold text-primary underline-offset-2 hover:underline"
        >
          Inicia sesión
        </Link>
      </p>
    </div>
  );
}
