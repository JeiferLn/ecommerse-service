"use client";

import { FormEvent, useEffect, useState, useTransition } from "react";
import { useParams, useRouter } from "next/navigation";
import { ROUTES } from "@/lib/routes";

const fieldClassName =
  "rounded-md border border-border bg-surface px-3 py-2.5 text-foreground outline-none transition placeholder:text-muted/70 focus:border-border-strong focus:ring-2 focus:ring-ring/20";

type InvitationInfo = {
  email: string;
  expiresAt: string;
  company: { id: string; name: string; type: string };
};

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void (async () => {
      const res = await fetch(`/api/invitations/${token}`);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          (data as { message?: string })?.message ??
            "Invitación no válida o expirada",
        );
        return;
      }
      setInfo(data as InvitationInfo);
    })();
  }, [token]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
    const name = String(formData.get("name") ?? "");
    const password = String(formData.get("password") ?? "");

    startTransition(async () => {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, password }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          (data as { message?: string })?.message ??
            "No se pudo aceptar la invitación",
        );
        return;
      }
      router.replace(ROUTES.dashboard);
      router.refresh();
    });
  }

  return (
    <main className="flex flex-1 items-center justify-center bg-background px-6 py-16">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-8">
        <p className="mb-6 text-sm font-semibold tracking-tight text-foreground">
          Commerce AI
        </p>

        {!info && !error ? (
          <p className="text-muted">Cargando invitación...</p>
        ) : null}

        {error && !info ? (
          <p className="text-danger" role="alert">
            {error}
          </p>
        ) : null}

        {info ? (
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              Únete a {info.company.name}
            </h1>
            <p className="mt-2 text-sm text-muted">
              Te invitaron como usuario de empresa con el correo{" "}
              <span className="font-medium text-foreground">{info.email}</span>
            </p>

            <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-foreground">Tu nombre</span>
                <input
                  name="name"
                  required
                  minLength={2}
                  className={fieldClassName}
                  placeholder="Tu nombre"
                />
              </label>

              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium text-foreground">Contraseña</span>
                <input
                  type="password"
                  name="password"
                  required
                  minLength={8}
                  className={fieldClassName}
                  placeholder="••••••••"
                />
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
                {isPending ? "Creando cuenta..." : "Aceptar invitación"}
              </button>
            </form>
          </div>
        ) : null}
      </div>
    </main>
  );
}
