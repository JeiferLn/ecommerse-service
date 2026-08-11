"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiClientError } from "@/lib/api";
import { homePathForRole } from "@/lib/home-path";
import type { SessionUser } from "@/lib/session";
import { useSession } from "@/providers/session-provider";

const loginSchema = z.object({
  email: z.string().email("Ingresa un email válido"),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refresh } = useSession();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const mutation = useMutation({
    mutationFn: (values: LoginValues) =>
      apiFetch<SessionUser>("/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      }),
    onSuccess: async (user) => {
      await refresh();
      const next = searchParams.get("next");
      router.push(next ?? homePathForRole(user.role));
      router.refresh();
    },
  });

  return (
    <form
      onSubmit={handleSubmit((values) => mutation.mutate(values))}
      className="flex flex-col gap-4"
    >
      {searchParams.get("registered") === "1" ? (
        <p className="rounded-lg border border-border/70 bg-accent/30 px-3 py-2 text-sm text-foreground">
          {searchParams.get("status") === "failure"
            ? "El pago no se completó. Si ya pagaste, espera un momento e inicia sesión; si no, vuelve a registrarte con el plan de pago."
            : "Si el pago se autorizó, tu cuenta ya está lista. Inicia sesión con el email y la contraseña que elegiste."}
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          placeholder="tu@empresa.com"
          autoComplete="email"
          {...register("email")}
        />
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      {mutation.isError && (
        <p className="text-sm text-destructive">
          {mutation.error instanceof ApiClientError
            ? mutation.error.message
            : "No se pudo conectar con el servidor"}
        </p>
      )}

      <Button type="submit" className="mt-1 w-full" disabled={mutation.isPending}>
        {mutation.isPending ? "Ingresando…" : "Iniciar sesión"}
      </Button>
    </form>
  );
}
