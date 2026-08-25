"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { ArrowRight, Eye, EyeOff, Lock, Mail } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiFetch, ApiClientError } from "@/lib/api";
import { homePathForRole } from "@/lib/home-path";
import type { SessionUser } from "@/lib/session";
import { cn } from "@/lib/utils";
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
  const [showPassword, setShowPassword] = useState(false);

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
      className="flex flex-col gap-5"
    >
      {searchParams.get("registered") === "1" ? (
        <p className="rounded-xl border border-border/70 bg-muted/40 px-3 py-2.5 text-sm text-foreground">
          {searchParams.get("status") === "failure"
            ? "El pago no se completó. Si ya pagaste, espera un momento e inicia sesión; si no, vuelve a registrarte con el plan de pago."
            : "Si el pago se autorizó, tu cuenta ya está lista. Inicia sesión con el email y la contraseña que elegiste."}
        </p>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <Label
          htmlFor="email"
          className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
        >
          Email
        </Label>
        <div className="relative">
          <Mail
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="email"
            type="email"
            placeholder="tu@empresa.com"
            autoComplete="email"
            className="h-12 rounded-lg pl-10"
            {...register("email")}
          />
        </div>
        {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3">
          <Label
            htmlFor="password"
            className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
          >
            Contraseña
          </Label>
          <Link
            href="/forgot-password"
            className="text-[11px] font-semibold text-primary hover:underline"
          >
            ¿Olvidaste tu contraseña?
          </Link>
        </div>
        <div className="relative">
          <Lock
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            className="h-12 rounded-lg pr-10 pl-10"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden />
            ) : (
              <Eye className="size-4" aria-hidden />
            )}
          </button>
        </div>
        {errors.password && <p className="text-sm text-destructive">{errors.password.message}</p>}
      </div>

      {mutation.isError && (
        <p className="text-sm text-destructive">
          {mutation.error instanceof ApiClientError
            ? mutation.error.message
            : "No se pudo conectar con el servidor"}
        </p>
      )}

      <Button
        type="submit"
        disabled={mutation.isPending}
        className={cn(
          "premium-btn-primary mt-1 h-12 w-full gap-2 rounded-xl text-sm font-semibold tracking-wide text-white uppercase",
        )}
      >
        {mutation.isPending ? "Ingresando…" : "Iniciar sesión"}
        {!mutation.isPending && <ArrowRight className="size-4" aria-hidden />}
      </Button>
    </form>
  );
}
